// The item's fields as label/value rows: Status, Priority, Subteam, Domain, the subteam's leads, Assignees,
// Labels and dates.

import { PlusIcon, XIcon } from '@primer/octicons-react'
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { FIELDS, type SelectFieldKey } from '../fields'
import { colorClass, nextDomainColor, subteamChange, subteamOption } from '../lib/options'
import { addOption, updateExtraField, updateItem, useBoard } from '../store/board'
import { useCanManageDomains, useDomains, useFieldOptions, useSubteamLeads } from '../store/hooks'
import type { FieldOption, Item } from '../types'
import { Avatar } from '../ui/Avatar'
import { DateBox } from '../ui/DateBox'
import { Dropdown } from '../ui/Dropdown'
import { MilestoneIcon } from '../ui/MilestoneIcon'
import { OptionDot } from '../ui/OptionChip'
import { PhaseIcon } from '../ui/PhaseIcon'
import { PriorityIcon } from '../ui/PriorityIcon'
import {
  datesBlocked,
  datesWhat,
  HALF_TYPED,
  isFilledIn,
  isTyped,
  leftBox,
  planDates,
  readDateBox,
  shownDate,
  waitsForLeave,
  type DateDraft,
  type DateDrafts,
  type DateKey,
} from './dates'
import { closeMenu } from './dom'
import { LabelsEditor } from './LabelsEditor'
import { AssigneesPicker } from './MemberPicker'
import { memberName } from './members'
import { useDebounced } from './useDebouncedSave'

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
      <DomainRow item={item} />
      <SubteamLeadRow subteam={item.subteam} />
      <Row label="Assignees" wide>
        <AssigneesPicker item={item} />
      </Row>
      <Row label="Labels" wide>
        <LabelsEditor item={item} />
      </Row>
      <DateRows item={item} />
      <TypeRow item={item} />
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
    <Row label={leads.length > 1 ? 'Subteam leads' : 'Subteam lead'} wide>
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
  const allOptions = useBoard((s) => s.options)
  const label = FIELDS[field].label
  const value = currentValue(item, field)

  const change = (next: string) => {
    if (next === value) return
    if (field === 'status') {
      if (next) void updateItem(item.id, { status: next }, 'the status')
    } else if (field === 'subteam') {
      // The domain goes too, unless the new subteam has one of that name (the database does the same).
      void updateItem(item.id, subteamChange(allOptions, item, next || null), 'the subteam')
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

/**
 * The item's domain: one of its subteam's domains. The subteam's leads and board admins can add a domain
 * here with "+", and manage them in Subteam domains (leads) or Board settings > Domains (board admins).
 */
function DomainRow({ item }: { item: Item }) {
  const domains = useDomains(item.subteam)
  const canManage = useCanManageDomains(item.subteam)
  const value = item.domain ?? ''
  const current = domains.find((domain) => domain.name === value)

  const change = (next: string) => {
    if (next !== value) void updateItem(item.id, { domain: next || null }, 'the domain')
  }

  let control: ReactNode
  if (!item.subteam) {
    control = <p className="ip-none">Pick a subteam first</p>
  } else if (domains.length === 0 && !value) {
    control = (
      <p className="ip-none" title={canManage ? 'Add one with +' : `The ${item.subteam} leads can add domains`}>
        No domains yet
      </p>
    )
  } else {
    control = (
      <div className="ip-select">
        <span className={`chip-dot ${colorClass(current?.color ?? 'GRAY')}`} aria-hidden="true" />
        <select className="select" value={value} aria-label="Domain" onChange={(event) => change(event.target.value)}>
          <option value="">No domain</option>
          {domains.map((domain) => (
            <option key={domain.id} value={domain.name} title={domain.description ?? undefined}>
              {domain.name}
            </option>
          ))}
          {value && !current && <option value={value}>{value}</option>}
        </select>
      </div>
    )
  }

  return (
    <Row label="Domain">
      <div className="ip-domain">
        {control}
        {canManage && item.subteam && <AddDomain item={item} subteam={item.subteam} domains={domains} />}
      </div>
    </Row>
  )
}

/** "+" beside the Domain: add a domain to the item's subteam, and give it to this item. */
function AddDomain({ item, subteam, domains }: { item: Item; subteam: string; domains: FieldOption[] }) {
  return (
    <Dropdown
      label={<PlusIcon />}
      ariaLabel={`Add a domain to ${subteam}`}
      buttonClassName="btn btn-ghost btn-icon btn-sm"
      align="right"
      width={280}
    >
      {(close) => <AddDomainForm item={item} subteam={subteam} domains={domains} onDone={close} />}
    </Dropdown>
  )
}

interface AddDomainFormProps {
  item: Item
  subteam: string
  domains: FieldOption[]
  onDone: () => void
}

function AddDomainForm({ item, subteam, domains, onDone }: AddDomainFormProps) {
  const options = useBoard((s) => s.options)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const inputId = useId()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const text = name.trim()
    const parent = subteamOption(options, subteam)
    if (!text || busy || !parent) return
    // A domain that already has this name (in any case) is picked rather than added twice.
    const existing = domains.find((domain) => domain.name.toLowerCase() === text.toLowerCase())
    setBusy(true)
    const domain = existing ?? (await addOption('domain', text, nextDomainColor(domains, parent.color), parent.id))
    setBusy(false)
    if (!domain) return
    if (domain.name !== item.domain) void updateItem(item.id, { domain: domain.name }, 'the domain')
    // Close, and give focus back to "+" (not the page, where Escape would close the whole panel).
    closeMenu(onDone, form)
  }

  return (
    <form className="ip-domain-form" onSubmit={(event) => void submit(event)}>
      <label className="field-label" htmlFor={inputId}>
        New {subteam} domain
      </label>
      <div className="ip-domain-form-row">
        <input
          id={inputId}
          className="input"
          autoFocus
          maxLength={60}
          value={name}
          placeholder="e.g. LV systems"
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
          {busy && <span className="spinner" aria-hidden="true" />}
          Add
        </button>
      </div>
      <p className="muted ip-domain-form-note">It joins {subteam}'s domains and is set on this task.</p>
    </form>
  )
}

type ItemType = 'task' | 'milestone' | 'phase'

const TYPES: { id: ItemType; label: string; hint: string }[] = [
  { id: 'task', label: 'Task', hint: 'An ordinary task.' },
  { id: 'milestone', label: 'Milestone', hint: 'A key date: a diamond on the Timeline at the due date, with a line across it.' },
  { id: 'phase', label: 'Phase', hint: 'A period: its dates are shaded across the whole Timeline, with its name at the top.' },
]

/** Task, milestone (a key date) or phase (a period). Milestones and phases stand out on the Timeline. */
function TypeRow({ item }: { item: Item }) {
  const current: ItemType = item.is_phase ? 'phase' : item.is_milestone ? 'milestone' : 'task'
  const subtask = !!item.parent_id
  const pick = (type: ItemType) => {
    if (type !== current) void updateItem(item.id, { is_milestone: type === 'milestone', is_phase: type === 'phase' }, 'the type')
  }
  return (
    <Row label="Type" wide>
      <div className="ip-type" role="group" aria-label="Type">
        {TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className="ip-type-option"
            aria-pressed={current === type.id}
            disabled={subtask && type.id !== 'task'}
            title={subtask && type.id !== 'task' ? 'A subtask is always a task' : type.hint}
            onClick={() => pick(type.id)}
          >
            {type.id === 'milestone' && <MilestoneIcon size={11} label="" />}
            {type.id === 'phase' && <PhaseIcon size={12} label="" />}
            {type.label}
          </button>
        ))}
      </div>
      {current !== 'task' && <p className="ip-type-hint">{TYPES.find((type) => type.id === current)?.hint}</p>}
      {subtask && <p className="ip-type-hint">A subtask is always a task. To change that, make it a separate task first (⋯ menu).</p>}
    </Row>
  )
}

/**
 * Start and due dates: saved when both are whole dates in the right order. Typed dates are saved when
 * the box is left, on Enter or when the panel closes; picked ones after a short pause (see dates.ts).
 */
function DateRows({ item }: { item: Item }) {
  const [drafts, setDrafts] = useState<DateDrafts>({})
  const startBox = useRef<HTMLInputElement>(null)
  const dueBox = useRef<HTMLInputElement>(null)
  const start = shownDate(item, drafts, 'start_date')
  const due = shownDate(item, drafts, 'due_date')
  const blocked = datesBlocked(item, drafts)

  const save = (next: DateDrafts) => {
    const plan = planDates(item, next)
    setDrafts(plan.drafts)
    if (plan.patch) void updateItem(item.id, plan.patch, datesWhat(plan.patch))
  }
  // Whatever is waiting is also saved when the panel closes or shows another item.
  const later = useDebounced(save, 800)
  const saveNow = (next: DateDrafts) => {
    later.cancel()
    save(next)
  }

  const change = (key: DateKey, box: DateDraft, typed: boolean) => {
    const next = { ...drafts, [key]: box }
    setDrafts(next)
    if (waitsForLeave(box, typed)) later.hold(next)
    else later.schedule(next)
  }

  // A date held back because it was after the other one is saved once the order is put right
  // elsewhere (the Timeline, or someone else), unless a box is being typed in. Only when the saved
  // dates change: while someone types, the browser may briefly report no box as focused.
  const { start_date: savedStart, due_date: savedDue } = item
  const replan = useEffectEvent(() => {
    const focused = document.activeElement
    const typing = !!focused && (focused === startBox.current || focused === dueBox.current)
    if (!typing && planDates({ start_date: savedStart, due_date: savedDue }, drafts).patch) later.schedule(drafts)
  })
  useEffect(() => replan(), [savedStart, savedDue])

  const boxProps = (key: DateKey) => ({
    invalid: blocked,
    onChange: (box: DateDraft, typed: boolean) => change(key, box, typed),
    // Hold the box from the first typed key, so a live change from someone else can't replace what's
    // being typed: the box may report nothing yet (a new date, or a part Firefox is still holding).
    onTyping: (box: DateDraft) => {
      if (!drafts[key]) change(key, box, true)
    },
    onEnter: (box: DateDraft) => {
      if (box.done) saveNow({ ...drafts, [key]: box })
    },
    onLeave: (box: DateDraft) => saveNow(leftBox(drafts, key, box)),
    onClear: () => saveNow({ ...drafts, [key]: { value: '', done: true } }),
  })

  return (
    <>
      <Row label="Start date">
        <DateInput label="Start date" value={start} boxRef={startBox} {...boxProps('start_date')} />
      </Row>
      <Row label="Due date">
        <DateInput label="Due date" value={due} boxRef={dueBox} {...boxProps('due_date')} />
      </Row>
      {blocked && (
        <p className="field-error ip-field-wide" role="alert">
          The start date must be on or before the due date. Nothing is saved until it is.
        </p>
      )}
    </>
  )
}

interface DateInputProps {
  label: string
  /** Exactly what the box holds while someone types (see dates.ts), otherwise the saved date */
  value: string
  boxRef: RefObject<HTMLInputElement | null>
  invalid: boolean
  /** What the box holds after a change, and whether it was typed */
  onChange: (box: DateDraft, typed: boolean) => void
  /** A key is being typed into the box: what it holds so far (never saved as it is) */
  onTyping: (box: DateDraft) => void
  onEnter: (box: DateDraft) => void
  /** What the box holds as it's left, or as it's removed while focused */
  onLeave: (box: DateDraft) => void
  onClear: () => void
}

function DateInput(props: DateInputProps) {
  const { label, value, boxRef, invalid, onChange, onTyping, onEnter, onLeave, onClear } = props
  // The key down, if any. Read in the capture phase: Firefox changes the box before a key bubbles.
  const keyDown = useRef<string | null>(null)
  // A digit typed that the box hasn't reported yet (see isTyped).
  const pendingDigit = useRef<string | null>(null)
  // The box has been half-typed, or holds a date the browser filled in by itself (see isFilledIn).
  const halfTyped = useRef(false)
  const filledIn = useRef(false)
  const read = (box: HTMLInputElement) => (filledIn.current ? HALF_TYPED : readDateBox(box))
  const forget = () => {
    keyDown.current = pendingDigit.current = null
    halfTyped.current = filledIn.current = false
  }

  // React sends no blur when the box is removed while focused (browser Back, say), so read it then.
  const leaveRemoved = useRef(() => {})
  useLayoutEffect(() => {
    leaveRemoved.current = () => {
      const box = boxRef.current
      if (box && box === document.activeElement) onLeave(read(box))
    }
  })
  useLayoutEffect(() => () => leaveRemoved.current(), [])

  return (
    <div className="ip-date">
      <DateBox
        boxRef={boxRef}
        className="input"
        value={value}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onKeyDownCapture={(event) => {
          keyDown.current = event.key
          if (isTyped(event.key, null)) pendingDigit.current = event.key
          if (event.key === 'Enter') onEnter(read(event.currentTarget))
        }}
        onKeyUpCapture={(event) => {
          keyDown.current = null
          const box = readDateBox(event.currentTarget)
          if (!box.done) {
            halfTyped.current = true
            onTyping(box)
          } else if (isTyped(event.key, null)) {
            // Firefox still shows the old date while it holds a part's first digit.
            onTyping({ value: box.value, done: false })
          }
        }}
        onChange={(event) => {
          const el = event.currentTarget
          const box = readDateBox(el)
          const key = keyDown.current
          const typed = isTyped(key, pendingDigit.current)
          pendingDigit.current = null
          const focused = el === document.activeElement && document.hasFocus()
          filledIn.current = !typed && isFilledIn(halfTyped.current, box, key, focused)
          halfTyped.current = !box.done || filledIn.current
          onChange(filledIn.current ? { ...box, done: false } : box, typed)
        }}
        onBlur={(event) => {
          const el = event.currentTarget
          keyDown.current = null
          // The window lost focus, not the box: keep what's typed for when the person comes back.
          if (el === document.activeElement) return
          const box = read(el)
          forget()
          // Clear the parts of a half-typed box; React then puts the saved date back, if there is one.
          if (!box.done) el.value = ''
          onLeave(box)
        }}
      />
      {value && (
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label={`Clear ${label}`}
          // Focus stays in the box, so a date being typed isn't saved just before it's cleared.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            forget()
            onClear()
          }}
        >
          <XIcon size={14} />
        </button>
      )}
    </div>
  )
}
