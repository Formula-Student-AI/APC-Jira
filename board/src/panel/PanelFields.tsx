// The item's fields as label/value rows: Status, Subteam, Assignees, Labels, dates and custom fields.

import { XIcon } from '@primer/octicons-react'
import { useState, type ReactNode } from 'react'
import { CUSTOM_FIELDS, FIELDS, type CustomFieldKey, type SelectFieldKey } from '../fields'
import { updateExtraField, updateItem } from '../store/board'
import { useFieldOptions } from '../store/hooks'
import type { Item } from '../types'
import { OptionDot } from '../ui/OptionChip'
import { datesOutOfOrder, datesWhat, dropUnfinished, isWholeDayOrEmpty, planDateChange, shownDate, type DateDrafts, type DateKey } from './dates'
import { LabelsEditor } from './LabelsEditor'
import { AssigneesPicker, MemberSelect } from './MemberPicker'
import { saveExtraText } from './saves'
import { useDraft } from './useDebouncedSave'

export function PanelFields({ item }: { item: Item }) {
  return (
    <dl className="ip-fields">
      <Row label="Status">
        <OptionSelect item={item} field="status" />
      </Row>
      <Row label="Subteam">
        <OptionSelect item={item} field="subteam" />
      </Row>
      <Row label="Assignees" wide>
        <AssigneesPicker item={item} />
      </Row>
      <Row label="Labels" wide>
        <LabelsEditor item={item} />
      </Row>
      <DateRows item={item} />
      {CUSTOM_FIELDS.map((key) => (
        <Row key={key} label={FIELDS[key].label}>
          <CustomField item={item} field={key} />
        </Row>
      ))}
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

function CustomField({ item, field }: { item: Item; field: CustomFieldKey }) {
  const kind = FIELDS[field].kind
  if (kind === 'single_select') return <OptionSelect item={item} field={field as SelectFieldKey} />
  if (kind === 'member') return <MemberSelect item={item} field={field} />
  return <ExtraText item={item} field={field} />
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
      <OptionDot field={field} name={value || null} />
      <select className="select" value={value} aria-label={label} onChange={(event) => change(event.target.value)}>
        {field !== 'status' && <option value="">{field === 'subteam' ? 'No subteam' : '—'}</option>}
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

/** A free-text custom field (Work package), saved as you type. */
function ExtraText({ item, field }: { item: Item; field: CustomFieldKey }) {
  const label = FIELDS[field].label
  const draft = useDraft(item.extra[field] ?? '', (value) => saveExtraText(item.id, field, value, `the ${label.toLowerCase()}`), 600)
  return (
    <input
      className="input"
      value={draft.value}
      maxLength={500}
      placeholder="—"
      aria-label={label}
      onChange={(event) => draft.change(event.target.value)}
      onBlur={draft.commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          draft.commit()
        }
      }}
    />
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
