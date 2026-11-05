// Board settings (board admins only): dropdown options and members.
// The database checks every change too, so this is a convenience, not the security boundary.

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@primer/octicons-react'
import { useId, useState, type FormEvent } from 'react'
import { USERNAME_PATTERN, normalizeUsername } from '../config'
import { BLOCKED_STATUS, FIELDS, SELECT_FIELDS, type SelectFieldKey } from '../fields'
import { colorClass } from '../lib/options'
import { addMember, addOption, deleteOption, moveOption, renameMember, setBoardAdmin, setMemberActive, updateOption } from '../store/board'
import { useFieldOptions, useMe, useMembersList } from '../store/hooks'
import type { FieldOption, Member, OptionColor } from '../types'
import { Dropdown } from '../ui/Dropdown'
import { Modal } from '../ui/Modal'
import './settings.css'

const COLORS: OptionColor[] = ['GRAY', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'RED', 'PINK', 'PURPLE']

export function BoardSettingsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'options' | 'members'>('options')
  return (
    <Modal title="Board settings" onClose={onClose} width={760}>
      <p className="muted settings-note">
        Board admin is a permission to manage this board. It has nothing to do with the Admin subteam.
      </p>
      <div className="settings-tabs" role="tablist" aria-label="Settings">
        <button type="button" role="tab" aria-selected={tab === 'options'} className="settings-tab" onClick={() => setTab('options')}>
          Dropdown options
        </button>
        <button type="button" role="tab" aria-selected={tab === 'members'} className="settings-tab" onClick={() => setTab('members')}>
          Members
        </button>
      </div>
      {tab === 'options' ? <OptionsTab /> : <MembersTab />}
    </Modal>
  )
}

/** Runs one save at a time for a row and reports whether one is in progress. */
function useBusy(): [boolean, (task: () => Promise<unknown>) => void] {
  const [busy, setBusy] = useState(false)
  const run = (task: () => Promise<unknown>) => {
    setBusy(true)
    void task().finally(() => setBusy(false))
  }
  return [busy, run]
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
      <AddOptionForm key={field} field={field} />
    </div>
  )
}

function OptionRow({ option, first, last }: { option: FieldOption; first: boolean; last: boolean }) {
  const [name, setName] = useState(option.name)
  const [confirming, setConfirming] = useState(false)
  const [busy, run] = useBusy()
  const locked = option.field === 'status' && option.name === BLOCKED_STATUS

  const commitName = () => {
    const next = name.trim()
    if (!next) setName(option.name)
    else if (next !== option.name) run(() => updateOption(option.id, { name: next }))
  }

  return (
    <li className="settings-option">
      <ColorPicker value={option.color} onChange={(color) => run(() => updateOption(option.id, { color }))} />
      <input
        className="input settings-option-name"
        value={name}
        maxLength={60}
        disabled={busy || locked}
        aria-label={`Name of ${option.name}`}
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitName()
          }
        }}
      />
      <div className="settings-option-actions">
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Move ${option.name} up`} disabled={first || busy} onClick={() => run(() => moveOption(option.id, -1))}>
          <ArrowUpIcon />
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Move ${option.name} down`} disabled={last || busy} onClick={() => run(() => moveOption(option.id, 1))}>
          <ArrowDownIcon />
        </button>
        {confirming ? (
          <>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => deleteOption(option.id).finally(() => setConfirming(false)))}>
              Delete
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Delete ${option.name}`} disabled={busy || locked} onClick={() => setConfirming(true)}>
            <TrashIcon />
          </button>
        )}
      </div>
      {locked && <span className="muted settings-locked">Used by the Blocked view</span>}
    </li>
  )
}

function ColorPicker({ value, onChange }: { value: OptionColor; onChange: (color: OptionColor) => void }) {
  return (
    <Dropdown
      label={<span className={`chip-dot settings-swatch ${colorClass(value)}`} />}
      ariaLabel={`Colour: ${value.toLowerCase()}. Change`}
      buttonClassName="btn btn-ghost btn-icon btn-sm"
      width={188}
    >
      {(close) => (
        <div className="settings-palette">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`settings-color ${colorClass(color)}`}
              aria-label={color.toLowerCase()}
              aria-pressed={color === value}
              onClick={() => {
                onChange(color)
                close()
              }}
            />
          ))}
        </div>
      )}
    </Dropdown>
  )
}

function AddOptionForm({ field }: { field: SelectFieldKey }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<OptionColor>('GRAY')
  const [busy, run] = useBusy()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = name.trim()
    if (!text) return
    run(async () => {
      if (await addOption(field, text, color)) setName('')
    })
  }

  return (
    <form className="settings-add" onSubmit={submit}>
      <ColorPicker value={color} onChange={setColor} />
      <input
        className="input"
        value={name}
        maxLength={60}
        placeholder={`New ${FIELDS[field].label.toLowerCase()} option`}
        aria-label={`New ${FIELDS[field].label} option`}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="btn btn-sm" disabled={busy || !name.trim()}>
        <PlusIcon /> Add
      </button>
    </form>
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
