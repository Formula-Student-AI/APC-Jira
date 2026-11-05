// The item's fields as label/value rows: Status, Priority, Subteam and its leads, Assignees, Labels and dates.

import { XIcon } from '@primer/octicons-react'
import { useState, type ReactNode } from 'react'
import { FIELDS, type SelectFieldKey } from '../fields'
import { updateExtraField, updateItem, useBoard } from '../store/board'
import { useFieldOptions, useSubteamLeads } from '../store/hooks'
import type { Item } from '../types'
import { Avatar } from '../ui/Avatar'
import { OptionDot } from '../ui/OptionChip'
import { PriorityIcon } from '../ui/PriorityIcon'
import { datesOutOfOrder, datesWhat, dropUnfinished, isWholeDayOrEmpty, planDateChange, shownDate, type DateDrafts, type DateKey } from './dates'
import { LabelsEditor } from './LabelsEditor'
import { AssigneesPicker } from './MemberPicker'
import { memberName } from './members'

export function PanelFields({ item }: { item: Item }) {
  return (
    <dl className="ip-fields">
      <Row label="Status">
        <OptionSelect item={item} field="status" />
      </Row>
      <Row label="Priority">
        <OptionSelect item={item} field="priority" />
      </Row>
      <Row label="Subteam">
        <OptionSelect item={item} field="subteam" />
      </Row>
      <SubteamLeadRow subteam={item.subteam} />
      <Row label="Assignees" wide>
        <AssigneesPicker item={item} />
      </Row>
      <Row label="Labels" wide>
        <LabelsEditor item={item} />
      </Row>
      <DateRows item={item} />
      <MilestoneRow item={item} />
    </dl>
  )
}

function Row({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`ip-field${wide ? ' ip-field-wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Who leads the item's subteam. Board admins choose the leads in Board settings, so it is read-only here. */
function SubteamLeadRow({ subteam }: { subteam: string | null }) {
  const leads = useSubteamLeads(subteam)
  const members = useBoard((s) => s.members)
  return (
    <Row label={leads.length > 1 ? 'Subteam leads' : 'Subteam lead'}>
      {leads.length > 0 ? (
        <ul className="ip-leads">
          {leads.map((username) => (
            <li key={username} className="ip-lead">
              <Avatar username={username} size={20} />
              <span className="ip-people-names">{memberName(members, username)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ip-none" title={subteam ? 'Board admins choose subteam leads in Board settings' : undefined}>
          {subteam ? 'No lead yet' : '—'}
        </p>
      )}
    </Row>
  )
}

function currentValue(item: Item, field: SelectFieldKey): string {
  if (field === 'status') return item.status
  if (field === 'subteam') return item.subteam ?? ''
  return item.extra[field] ?? ''
}

/** A dropdown field whose choices come from field_options. */
function OptionSelect({ item, field }: { item: Item; field: SelectFieldKey }) {
  const options = useFieldOptions(field)
  const label = FIELDS[field].label
  const value = currentValue(item, field)

  const change = (next: string) => {
    if (next === value) return
    if (field === 'status') {
      if (next) void updateItem(item.id, { status: next }, 'the status')
    } else if (field === 'subteam') {
      void updateItem(item.id, { subteam: next || null }, 'the subteam')
    } else {
      void updateExtraField(item.id, field, next || null, `the ${label.toLowerCase()}`)
    }
  }

  return (
    <div className="ip-select">
      {field === 'priority' ? <PriorityIcon name={value} /> : <OptionDot field={field} name={value || null} />}
      <select className="select" value={value} aria-label={label} onChange={(event) => change(event.target.value)}>
        {field !== 'status' && <option value="">{field === 'subteam' ? 'No subteam' : 'No priority'}</option>}
        {options.map((option) => (
          <option key={option.id} value={option.name} title={option.description ?? undefined}>
            {option.name}
          </option>
        ))}
        {value && !options.some((option) => option.name === value) && <option value={value}>{value}</option>}
      </select>
    </div>
  )
}

/** A milestone is a key date: a diamond on the Timeline (at its due date), with a line across it. */
function MilestoneRow({ item }: { item: Item }) {
  return (
    <Row label="Milestone" wide>
      <label className="ip-switch">
        <input
          type="checkbox"
          role="switch"
          checked={item.is_milestone}
          onChange={(event) => void updateItem(item.id, { is_milestone: event.target.checked }, 'the milestone setting')}
        />
        <span className="ip-switch-track" aria-hidden="true" />
        <span className="ip-switch-text">
          {item.is_milestone
            ? 'A key date: a diamond on the Timeline at the due date, with a line across it'
            : 'Make this a key date on the Timeline'}
        </span>
      </label>
    </Row>
  )
}

/** Start and due dates: saved when both are whole dates in the right order. */
function DateRows({ item }: { item: Item }) {
  const [drafts, setDrafts] = useState<DateDrafts>({})
  const start = shownDate(item, drafts, 'start_date')
  const due = shownDate(item, drafts, 'due_date')
  const outOfOrder = datesOutOfOrder(start, due)

  const change = (key: DateKey, raw: string) => {
    const plan = planDateChange(item, drafts, key, isWholeDayOrEmpty(raw) ? raw : null)
    setDrafts(plan.drafts)
    if (plan.patch) void updateItem(item.id, plan.patch, datesWhat(plan.patch))
  }

  return (
    <>
      <Row label="Start date">
        <DateInput
          label="Start date"
          value={start}
          invalid={outOfOrder}
          onChange={(value) => change('start_date', value)}
          onBlur={() => setDrafts((current) => dropUnfinished(current, 'start_date'))}
        />
      </Row>
      <Row label="Due date">
        <DateInput
          label="Due date"
          value={due}
          invalid={outOfOrder}
          onChange={(value) => change('due_date', value)}
          onBlur={() => setDrafts((current) => dropUnfinished(current, 'due_date'))}
        />
      </Row>
      {outOfOrder && (
        <p className="field-error ip-field-wide" role="alert">
          The start date must be on or before the due date. Nothing is saved until it is.
        </p>
      )}
    </>
  )
}

interface DateInputProps {
  label: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
  onBlur: () => void
}

function DateInput({ label, value, invalid, onChange, onBlur }: DateInputProps) {
  return (
    <div className="ip-date">
      <input
        type="date"
        className="input"
        value={value}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {value && (
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Clear ${label}`} onClick={() => onChange('')}>
          <XIcon size={14} />
        </button>
      )}
    </div>
  )
}
