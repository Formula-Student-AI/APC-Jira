// Board settings (board admins only): subteam leads, who is in each subteam, each subteam's domains, dropdown
// options and members.
// The database checks every change too, so this is a convenience, not the security boundary.

import { CheckIcon, PlusIcon, TrashIcon, XIcon } from '@primer/octicons-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { USERNAME_PATTERN, normalizeUsername } from '../config'
import { FIELDS, SELECT_FIELDS, type SelectFieldKey } from '../fields'
import { formatBytes } from '../lib/images'
import { MemberMenu } from '../panel/MemberPicker'
import { MAX_TOTAL_BYTES } from '../store/attachments'
import { memberName } from '../panel/members'
import {
  addMember,
  deleteMember,
  pushToast,
  renameMember,
  setBoardAdmin,
  setMemberActive,
  setSubteamMember,
  updateOption,
  useBoard,
} from '../store/board'
import { useFieldOptions, useMe, useMembersList } from '../store/hooks'
import type { FieldOption, Member } from '../types'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { Modal } from '../ui/Modal'
import { OptionDot } from '../ui/OptionChip'
import { DomainsEditor } from './DomainsEditor'
import { deletionText, memberUse } from './memberDeletion'
import { AddOptionForm, OptionRow } from './OptionEditor'
import { useSaveProblems } from './saveProblems'
import { SubteamMembersEditor } from './SubteamMembersEditor'
import { useBusy } from './useBusy'
import './settings.css'

type Tab = 'leads' | 'subteam-members' | 'domains' | 'options' | 'members'

const TABS: { id: Tab; label: string }[] = [
  { id: 'leads', label: 'Subteam leads' },
  { id: 'subteam-members', label: 'Subteam members' },
  { id: 'domains', label: 'Domains' },
  { id: 'options', label: 'Dropdown options' },
  { id: 'members', label: 'Members' },
]

export function BoardSettingsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('leads')
  // Kept here, so a Subteam members change that fails after you've moved to another tab still says so there.
  const memberProblems = useSaveProblems()
  return (
    <Modal title="Board settings" onClose={onClose} width={760}>
      <p className="muted settings-note">
        Board admin is a permission to manage this board. It has nothing to do with the Admin subteam.
      </p>
      <StorageUse />
      <div className="settings-tabs" role="tablist" aria-label="Settings">
        {TABS.map(({ id, label }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="settings-tab" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'leads' && <LeadsTab />}
      {tab === 'subteam-members' && <SubteamMembersEditor saveProblems={memberProblems} />}
      {tab === 'domains' && <DomainsEditor />}
      {tab === 'options' && <OptionsTab />}
      {tab === 'members' && <MembersTab />}
    </Modal>
  )
}

/** How much of the attachment allowance is used (images are shrunk before upload). */
function StorageUse() {
  const attachments = useBoard((s) => s.attachments)
  let bytes = 0
  let count = 0
  for (const list of Object.values(attachments)) {
    for (const a of list) {
      bytes += a.size + a.thumb_size
      count++
    }
  }
  const share = Math.min(100, (bytes / MAX_TOTAL_BYTES) * 100)
  return (
    <div className="settings-storage">
      <div className="settings-storage-text">
        <span>
          Attachments: {count} image{count === 1 ? '' : 's'}, {formatBytes(bytes)} of {formatBytes(MAX_TOTAL_BYTES)}
        </span>
        <span className="muted">{share < 1 ? '<1' : Math.round(share)}% used</span>
      </div>
      <div className="settings-storage-bar" role="progressbar" aria-label="Attachment storage used" aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${share}%` }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------- subteam leads

function LeadsTab() {
  const subteams = useFieldOptions('subteam')
  return (
    <div className="settings-section">
      <p className="muted settings-help">
        A subteam's leads are shown on every task in that subteam and in the Blocked view, and they look after
        the subteam's domains. In the filter box, lead:@me shows the tasks of the subteams you lead.
      </p>
      {subteams.length > 0 ? (
        <ul className="settings-leads">
          {subteams.map((option) => (
            <LeadsRow key={option.id} option={option} />
          ))}
        </ul>
      ) : (
        <p className="muted settings-help">There are no subteams yet. Add them under Dropdown options.</p>
      )}
    </div>
  )
}

function LeadsRow({ option }: { option: FieldOption }) {
  const members = useBoard((s) => s.members)
  const [busy, run] = useBusy()
  const toggle = (username: string, select: boolean) => {
    const leads = select ? [...option.leads, username] : option.leads.filter((u) => u !== username)
    run(async () => {
      const saved = await updateOption(option.id, { leads })
      // Someone is a subteam's lead or one of its members, not both: a new lead comes off its member list
      // (Subteam members), where a lead would only be hidden.
      const member = useBoard.getState().subteamMembers.some((row) => row.subteam === option.id && row.username === username)
      if (saved && select && member) {
        const problem = await setSubteamMember(option.id, username, false)
        if (problem) pushToast('error', problem)
      }
    })
  }

  return (
    <li className="settings-lead-row">
      <span className="settings-lead-team">
        <OptionDot field="subteam" name={option.name} />
        {option.name}
      </span>
      <div className="settings-lead-people">
        {option.leads.length === 0 && <span className="muted">No lead yet</span>}
        {option.leads.map((username) => {
          const name = memberName(members, username)
          return (
            <span key={username} className="settings-lead">
              <Avatar username={username} size={20} />
              <span className="settings-lead-name">{name}</span>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Remove ${name} as a ${option.name} lead`}
                disabled={busy}
                onClick={() => toggle(username, false)}
              >
                <XIcon size={14} />
              </button>
            </span>
          )
        })}
      </div>
      <Dropdown
        label={
          <>
            <PlusIcon /> Add lead
          </>
        }
        ariaLabel={`Choose the ${option.name} leads`}
        buttonClassName="btn btn-sm"
        align="right"
        width={320}
      >
        {() => <MemberMenu selected={option.leads} label={`${option.name} leads`} disabled={busy} onToggle={toggle} />}
      </Dropdown>
    </li>
  )
}

// ---------------------------------------------------------------------------- options

function OptionsTab() {
  const [field, setField] = useState<SelectFieldKey>('subteam')
  const options = useFieldOptions(field)
  const fieldId = useId()
  return (
    <div className="settings-section">
      <div className="settings-row">
        <label className="field-label" htmlFor={fieldId}>
          Field
        </label>
        <select id={fieldId} className="select settings-field" value={field} onChange={(event) => setField(event.target.value as SelectFieldKey)}>
          {SELECT_FIELDS.map((key) => (
            <option key={key} value={key}>
              {FIELDS[key].label}
            </option>
          ))}
        </select>
      </div>
      <p className="muted settings-help">
        The order here is the order of board columns and dropdowns. Renaming an option updates every item that uses it.
        Options still in use can't be deleted.
      </p>
      <ul className="settings-options">
        {options.map((option, index) => (
          // Keyed by name too, so a rename from elsewhere resets the row's text box.
          <OptionRow key={`${option.id}:${option.name}`} option={option} first={index === 0} last={index === options.length - 1} />
        ))}
      </ul>
      <AddOptionForm key={field} field={field} noun={`${FIELDS[field].label.toLowerCase()} option`} />
    </div>
  )
}

// ---------------------------------------------------------------------------- members

function MembersTab() {
  const members = useMembersList(true)
  const me = useMe()
  // Said here, and focused, after a deletion: a toast would sit behind this dialog.
  const [notice, setNotice] = useState<string | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  return (
    <div className="settings-section">
      <AddMemberForm />
      {notice && (
        <p ref={noticeRef} className="settings-notice" tabIndex={-1}>
          <CheckIcon /> {notice}
        </p>
      )}
      <div className="settings-table-wrap">
        <table className="settings-members">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Username</th>
              <th scope="col">Board admin</th>
              <th scope="col">Active</th>
              <th scope="col">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <MemberRow
                key={`${member.username}:${member.full_name}`}
                member={member}
                isMe={member.username === me?.username}
                onDeleted={() => setNotice(`${member.full_name} (${member.username}) was deleted.`)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted settings-help">
        Retired members are hidden from the pickers but stay in the history. Deleting a member takes them off their
        tasks and stops them leading any subteams; the history keeps their username. If they sign in again, they come
        back as a new member.
      </p>
    </div>
  )
}

interface MemberRowProps {
  member: Member
  isMe: boolean
  onDeleted: () => void
}

function MemberRow({ member, isMe, onDeleted }: MemberRowProps) {
  const [name, setName] = useState(member.full_name)
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [busy, run] = useBusy()
  const deleteButton = useRef<HTMLButtonElement>(null)
  const confirmId = useId()

  const commitName = () => {
    const next = name.trim().replace(/\s+/g, ' ')
    if (!next) setName(member.full_name)
    else if (next !== member.full_name) run(() => renameMember(member.username, next))
  }

  // Close the question and go back to the bin. Not while the deletion is being sent: it can't be called back.
  const keep = () => {
    if (busy) return
    setConfirming(false)
    setDeleteError(null)
    deleteButton.current?.focus()
  }

  // Deleted: the row leaves the list and the tab says so. Otherwise the question stays open with the reason.
  const remove = () =>
    run(async () => {
      setDeleteError(null)
      const problem = await deleteMember(member.username)
      if (problem === null) onDeleted()
      else setDeleteError(problem)
    })

  return (
    <>
      <tr className={member.active ? undefined : 'settings-retired'}>
        <td>
          <input
            className="input settings-member-name"
            value={name}
            maxLength={100}
            disabled={busy}
            aria-label={`Full name of ${member.username}`}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitName()
              }
            }}
          />
        </td>
        <td className="mono">{member.username}</td>
        <td>
          <input
            type="checkbox"
            checked={member.is_board_admin}
            disabled={busy}
            aria-label={`${member.full_name} is a board admin`}
            onChange={(event) => run(() => setBoardAdmin(member.username, event.target.checked))}
          />
        </td>
        <td>
          <input
            type="checkbox"
            checked={member.active}
            disabled={busy || isMe}
            aria-label={`${member.full_name} is active`}
            title={isMe ? "You can't retire yourself" : undefined}
            onChange={(event) => run(() => setMemberActive(member.username, event.target.checked))}
          />
        </td>
        <td className="settings-member-delete">
          <button
            ref={deleteButton}
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label={`Delete ${member.full_name}`}
            aria-expanded={confirming}
            aria-controls={confirming ? confirmId : undefined}
            disabled={busy || isMe}
            title={isMe ? "You can't delete yourself" : undefined}
            onClick={() => (confirming ? keep() : setConfirming(true))}
          >
            <TrashIcon />
          </button>
        </td>
      </tr>
      {confirming && (
        <DeleteMemberQuestion id={confirmId} member={member} busy={busy} error={deleteError} onDelete={remove} onKeep={keep} />
      )}
    </>
  )
}

interface DeleteMemberQuestionProps {
  id: string
  member: Member
  busy: boolean
  /** Why the last try failed */
  error: string | null
  onDelete: () => void
  onKeep: () => void
}

/**
 * The question under a member's row: what deleting them changes, then Delete member or Keep. Focus starts
 * on Keep, the safe choice, and stays in the question while the deletion is sent: the buttons are then
 * aria-disabled, not disabled, which would drop focus.
 */
function DeleteMemberQuestion({ id, member, busy, error, onDelete, onKeep }: DeleteMemberQuestionProps) {
  const items = useBoard((s) => s.items)
  const options = useBoard((s) => s.options)
  const subteamMembers = useBoard((s) => s.subteamMembers)
  const text = useMemo(
    () => deletionText(memberUse(Object.values(items), options, member.username, subteamMembers)),
    [items, options, member.username, subteamMembers],
  )
  const textId = useId()
  const keepButton = useRef<HTMLButtonElement>(null)
  const onKeepRef = useRef(onKeep)

  useEffect(() => {
    onKeepRef.current = onKeep
  })

  useEffect(() => {
    keepButton.current?.focus()
    // Escape closes just this question, not Board settings, wherever focus is (as Dropdown does).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onKeepRef.current()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <tr id={id} className="settings-member-confirm">
      <td colSpan={5}>
        <p id={textId} className="settings-member-question">
          <strong>
            Delete {member.full_name} ({member.username})?
          </strong>{' '}
          {text}
        </p>
        {error && (
          <p className="field-error settings-member-error" role="alert">
            Couldn't delete {member.full_name}: {error}
          </p>
        )}
        <div className="settings-member-answers">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            aria-disabled={busy || undefined}
            aria-describedby={textId}
            onClick={() => {
              if (!busy) onDelete()
            }}
          >
            {busy ? 'Deleting…' : 'Delete member'}
          </button>
          <button
            ref={keepButton}
            type="button"
            className="btn btn-ghost btn-sm"
            aria-disabled={busy || undefined}
            aria-describedby={textId}
            onClick={onKeep}
          >
            Keep
          </button>
        </div>
      </td>
    </tr>
  )
}

function AddMemberForm() {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, run] = useBusy()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const user = normalizeUsername(username)
    if (!USERNAME_PATTERN.test(user)) {
      setError('Enter a university username, e.g. xy12345.')
      return
    }
    if (!fullName.trim()) {
      setError('Enter their full name.')
      return
    }
    setError(null)
    run(async () => {
      if (await addMember(user, fullName)) {
        setUsername('')
        setFullName('')
      }
    })
  }

  return (
    <form className="settings-add settings-add-member" onSubmit={submit}>
      <input
        className="input"
        value={username}
        placeholder="Username, e.g. xy12345"
        aria-label="Username of the new member"
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => setUsername(event.target.value.toLowerCase())}
      />
      <input
        className="input"
        value={fullName}
        maxLength={100}
        placeholder="Full name"
        aria-label="Full name of the new member"
        onChange={(event) => setFullName(event.target.value)}
      />
      <button type="submit" className="btn btn-sm" disabled={busy}>
        <PlusIcon /> Add member
      </button>
      {error && <p className="field-error settings-add-error">{error}</p>}
    </form>
  )
}
