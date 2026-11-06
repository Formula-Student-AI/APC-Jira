// Board settings (board admins only): subteam leads, each subteam's domains, dropdown options and members.
// The database checks every change too, so this is a convenience, not the security boundary.

import { PlusIcon, XIcon } from '@primer/octicons-react'
import { useId, useState, type FormEvent } from 'react'
import { USERNAME_PATTERN, normalizeUsername } from '../config'
import { FIELDS, SELECT_FIELDS, type SelectFieldKey } from '../fields'
import { formatBytes } from '../lib/images'
import { MemberMenu } from '../panel/MemberPicker'
import { MAX_TOTAL_BYTES } from '../store/attachments'
import { memberName } from '../panel/members'
import { addMember, renameMember, setBoardAdmin, setMemberActive, updateOption, useBoard } from '../store/board'
import { useFieldOptions, useMe, useMembersList } from '../store/hooks'
import type { FieldOption, Member } from '../types'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { Modal } from '../ui/Modal'
import { OptionDot } from '../ui/OptionChip'
import { DomainsEditor } from './DomainsEditor'
import { AddOptionForm, OptionRow } from './OptionEditor'
import { useBusy } from './useBusy'
import './settings.css'

type Tab = 'leads' | 'domains' | 'options' | 'members'

const TABS: { id: Tab; label: string }[] = [
  { id: 'leads', label: 'Subteam leads' },
  { id: 'domains', label: 'Domains' },
  { id: 'options', label: 'Dropdown options' },
  { id: 'members', label: 'Members' },
]

export function BoardSettingsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('leads')
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
    run(() => updateOption(option.id, { leads }))
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
  return (
    <div className="settings-section">
      <AddMemberForm />
      <div className="settings-table-wrap">
        <table className="settings-members">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Username</th>
              <th scope="col">Board admin</th>
              <th scope="col">Active</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <MemberRow key={`${member.username}:${member.full_name}`} member={member} isMe={member.username === me?.username} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted settings-help">Retired members are hidden from the pickers but stay in the history.</p>
    </div>
  )
}

function MemberRow({ member, isMe }: { member: Member; isMe: boolean }) {
  const [name, setName] = useState(member.full_name)
  const [busy, run] = useBusy()

  const commitName = () => {
    const next = name.trim().replace(/\s+/g, ' ')
    if (!next) setName(member.full_name)
    else if (next !== member.full_name) run(() => renameMember(member.username, next))
  }

  return (
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
