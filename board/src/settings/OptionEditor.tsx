// Editing dropdown options, shared by Board settings and Subteam domains: a row per option (colour,
// name, move up/down, delete) and a form to add one. The database decides who may change what.

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@primer/octicons-react'
import { useState, type FormEvent } from 'react'
import { BLOCKED_STATUS, DONE_STATUS } from '../fields'
import { colorClass } from '../lib/options'
import { addOption, deleteOption, moveOption, updateOption } from '../store/board'
import type { FieldOption, OptionColor } from '../types'
import { Dropdown } from '../ui/Dropdown'
import { useBusy } from './useBusy'

const COLORS: OptionColor[] = ['GRAY', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'RED', 'PINK', 'PURPLE']

/** One option: colour, name (saved on Enter or leaving the box), move up or down, delete. */
export function OptionRow({ option, first, last }: { option: FieldOption; first: boolean; last: boolean }) {
  const [name, setName] = useState(option.name)
  const [confirming, setConfirming] = useState(false)
  const [busy, run] = useBusy()
  // The board relies on these two statuses by name (the database refuses renaming or deleting them too).
  const locked = option.field === 'status' && (option.name === BLOCKED_STATUS || option.name === DONE_STATUS)

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
      {locked && (
        <span className="muted settings-locked">
          {option.name === BLOCKED_STATUS ? 'Used by the Blocked view' : 'Marks finished tasks (subtask ticks, due dates)'}
        </span>
      )}
    </li>
  )
}

export function ColorPicker({ value, onChange }: { value: OptionColor; onChange: (color: OptionColor) => void }) {
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

interface AddOptionFormProps {
  field: string
  /** Domains only: the id of the subteam option they belong to */
  parentId?: string | null
  /** What one option is called, e.g. "status option" or "Electrical domain" */
  noun: string
  /** The colour to start with (a new domain gets one its subteam doesn't use yet) */
  defaultColor?: OptionColor
}

/** Add an option at the end of the list. */
export function AddOptionForm({ field, parentId = null, noun, defaultColor = 'GRAY' }: AddOptionFormProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<OptionColor | null>(null)
  const [busy, run] = useBusy()
  const shownColor = color ?? defaultColor

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = name.trim()
    if (!text) return
    run(async () => {
      if (await addOption(field, text, shownColor, parentId)) {
        setName('')
        setColor(null)
      }
    })
  }

  return (
    <form className="settings-add" onSubmit={submit}>
      <ColorPicker value={shownColor} onChange={setColor} />
      <input
        className="input"
        value={name}
        maxLength={60}
        placeholder={`New ${noun}`}
        aria-label={`New ${noun}`}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="btn btn-sm" disabled={busy || !name.trim()}>
        <PlusIcon /> Add
      </button>
    </form>
  )
}
