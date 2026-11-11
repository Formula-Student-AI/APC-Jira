// The Export dialog's options column: native radios, checkboxes, selects and text boxes in fieldsets, in the
// order Format, Paper, Rows, Period, Columns, Also include, then the title block's text. There is no form, so
// Enter in a text box never prints. Options that don't apply are disabled, with the reason beside them.
// The subteams and the filter aren't offered here: they come from the Timeline, so the two always agree.

import { FileIcon, ImageIcon } from '@primer/octicons-react'
import { useId, type ReactNode } from 'react'
import { PLAN_LABEL } from '../../../config'
import { MONTHS_WRONG, monthsOutOfOrder, withMonths, type IncludeCounts, type MonthOption } from './ExportDialogModel'
import {
  NOTE_MAX,
  PREPARED_BY_MAX,
  TITLE_MAX,
  type ColumnChoice,
  type ExportSettings,
  type FormatSettings,
  type Paper,
} from './exportSettings'

export interface ExportOptionsProps {
  settings: ExportSettings
  note: string
  /** The Prepared by box's text */
  preparedBy: string
  /** 'From the Timeline as it is now: …' */
  scope: string
  /** Each paper's live page count; null while it isn't known */
  pageCounts: Record<Paper, number | null>
  /** The presets with their months, e.g. 'Next 3 months (Nov 2026 – Jan 2027)' */
  periodLabels: { plan: string; next3: string; next6: string }
  /** The months for the From and To selects */
  months: MonthOption[]
  /** For the Also include labels; null leaves the count out */
  counts: IncludeCounts
  /** On a phone an image is suggested, as the easiest to share */
  phone: boolean
  onChange: (patch: Partial<ExportSettings>) => void
  /** Choose months…: starts from the months shown now */
  onChooseMonths: () => void
  onNote: (note: string) => void
  onPreparedBy: (text: string) => void
}

const pageCount = (paper: Paper, count: number | null) => {
  const name = paper.toUpperCase()
  return count === null ? name : `${name} · ${count} ${count === 1 ? 'page' : 'pages'}`
}

const withCount = (label: string, count: number | null) => (count === null ? label : `${label} (${count})`)

export function ExportOptions(props: ExportOptionsProps) {
  const { settings, note, preparedBy, scope, pageCounts, periodLabels, months, counts, phone } = props
  const { onChange, onChooseMonths, onNote, onPreparedBy } = props
  const id = useId()
  const format = settings.format
  const current = settings[format]
  const summary = current.rows === 'summary'
  const period = settings.period
  const monthsWrong = monthsOutOfOrder(period)
  const monthChoices = withMonths(months, period.preset === 'months' ? [period.from, period.to] : [])
  const onlyEveryTask = summary ? 'Only with Every task.' : undefined

  // Rows and columns are remembered for each format.
  const setFormat = (patch: Partial<FormatSettings>) =>
    onChange(format === 'pdf' ? { pdf: { ...settings.pdf, ...patch } } : { png: { ...settings.png, ...patch } })
  const setColumn = (key: keyof ColumnChoice, on: boolean) => setFormat({ columns: { ...current.columns, [key]: on } })

  return (
    <div className="xp-options">
      <p className="xp-scope">{scope}</p>

      <fieldset className="xp-fieldset">
        <legend className="xp-legend">Format</legend>
        <div className="xp-cards">
          <label className="xp-card">
            <input
              type="radio"
              name={`${id}-format`}
              checked={format === 'pdf'}
              data-autofocus={format === 'pdf' || undefined}
              onChange={() => onChange({ format: 'pdf' })}
            />
            <FileIcon size={20} className="xp-card-icon" />
            <span className="xp-card-text">
              <span className="xp-card-title">PDF</span>
              <span className="xp-card-sub">To email or print</span>
            </span>
          </label>
          <label className="xp-card">
            <input
              type="radio"
              name={`${id}-format`}
              checked={format === 'png'}
              data-autofocus={format === 'png' || undefined}
              onChange={() => onChange({ format: 'png' })}
            />
            <ImageIcon size={20} className="xp-card-icon" />
            <span className="xp-card-text">
              <span className="xp-card-title">Image (PNG)</span>
              <span className="xp-card-sub">For slides</span>
            </span>
          </label>
        </div>
        {phone && <p className="xp-hint xp-hint-block">On a phone, an image is the easiest to share.</p>}
      </fieldset>

      {format === 'pdf' ? (
        <fieldset className="xp-fieldset">
          <legend className="xp-legend">Paper</legend>
          {(['a4', 'a3', 'a2'] as const).map((paper) => (
            <Choice
              key={paper}
              type="radio"
              name={`${id}-paper`}
              checked={settings.paper === paper}
              onChange={() => onChange({ paper })}
              label={pageCount(paper, pageCounts[paper])}
            />
          ))}
          <p className="xp-hint xp-hint-block">
            All landscape. A3 and A2 keep A4's type sizes, for a wider chart and more rows a page: A2 fits the
            whole plan on a wall chart.
          </p>
        </fieldset>
      ) : (
        <fieldset className="xp-fieldset">
          <legend className="xp-legend">Image size</legend>
          <p className="xp-fixed">16:9 slide, 3840 × 2160 px</p>
        </fieldset>
      )}

      <fieldset className="xp-fieldset">
        <legend className="xp-legend">Rows</legend>
        <Choice
          type="radio"
          name={`${id}-rows`}
          checked={!summary}
          onChange={() => setFormat({ rows: 'tasks' })}
          label="Every task"
        />
        <Choice
          type="radio"
          name={`${id}-rows`}
          checked={summary}
          onChange={() => setFormat({ rows: 'summary' })}
          label="One row per domain"
          hint="A summary: each subteam with its domains under it, so the plan fits a page or a slide."
        />
      </fieldset>

      <fieldset className="xp-fieldset">
        <legend className="xp-legend">Period</legend>
        <Choice
          type="radio"
          name={`${id}-period`}
          checked={period.preset === 'plan'}
          onChange={() => onChange({ period: { preset: 'plan' } })}
          label={periodLabels.plan}
        />
        <Choice
          type="radio"
          name={`${id}-period`}
          checked={period.preset === 'next3'}
          onChange={() => onChange({ period: { preset: 'next3' } })}
          label={periodLabels.next3}
        />
        <Choice
          type="radio"
          name={`${id}-period`}
          checked={period.preset === 'next6'}
          onChange={() => onChange({ period: { preset: 'next6' } })}
          label={periodLabels.next6}
        />
        <Choice
          type="radio"
          name={`${id}-period`}
          checked={period.preset === 'months'}
          onChange={onChooseMonths}
          label="Choose months…"
        />
        {period.preset === 'months' && (
          <div className="xp-months">
            <div>
              <label className="field-label" htmlFor={`${id}-from`}>
                From
              </label>
              <select
                id={`${id}-from`}
                className="select"
                value={period.from}
                onChange={(event) => onChange({ period: { ...period, from: event.target.value } })}
              >
                {monthChoices.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor={`${id}-to`}>
                To
              </label>
              <select
                id={`${id}-to`}
                className="select"
                value={period.to}
                aria-invalid={monthsWrong || undefined}
                aria-describedby={monthsWrong ? `${id}-months-wrong` : undefined}
                onChange={(event) => onChange({ period: { ...period, to: event.target.value } })}
              >
                {monthChoices.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {monthsWrong && (
          <p id={`${id}-months-wrong`} className="field-error" role="alert">
            {MONTHS_WRONG}
          </p>
        )}
      </fieldset>

      <fieldset className="xp-fieldset" aria-describedby={`${id}-columns`}>
        <legend className="xp-legend">Columns</legend>
        <p id={`${id}-columns`} className="xp-hint xp-hint-lead">
          {summary ? 'Workstream' : 'Task'} is always shown. Each column takes width from the chart.
        </p>
        <Choice
          type="checkbox"
          checked={current.columns.number}
          disabled={summary}
          onChange={(on) => setColumn('number', on)}
          label="# (item number)"
          hint={summary ? 'Not in one row per domain.' : undefined}
        />
        <Choice
          type="checkbox"
          checked={current.columns.owner}
          onChange={(on) => setColumn('owner', on)}
          label={summary ? 'Lead' : 'Owner'}
          hint="Exports can be forwarded: check names before sending outside the team."
        />
        <Choice type="checkbox" checked={current.columns.dates} onChange={(on) => setColumn('dates', on)} label="Dates" />
        <Choice
          type="checkbox"
          checked={current.columns.status}
          onChange={(on) => setColumn('status', on)}
          label={summary ? 'Done and Issues' : 'Status'}
        />
      </fieldset>

      <fieldset className="xp-fieldset">
        <legend className="xp-legend">Also include</legend>
        <Choice
          type="checkbox"
          checked={settings.subtasks}
          disabled={summary}
          onChange={(on) => onChange({ subtasks: on })}
          label={withCount('Subtasks, under their task', summary ? null : counts.subtasks)}
          hint={onlyEveryTask}
        />
        <Choice
          type="checkbox"
          checked={settings.undated}
          disabled={summary || format === 'png'}
          onChange={(on) => onChange({ undated: on })}
          label={withCount('Tasks without dates, listed last', summary || format === 'png' ? null : counts.undated)}
          hint={format === 'png' ? 'Only in a PDF.' : onlyEveryTask}
        />
        <Choice
          type="checkbox"
          checked={settings.links}
          disabled={summary}
          onChange={(on) => onChange({ links: on })}
          label="Dependency lines"
          hint={onlyEveryTask ?? 'Tasks waiting on unfinished work show as At risk either way.'}
        />
      </fieldset>

      <fieldset className="xp-fieldset">
        <legend className="xp-legend">Title block</legend>
        <TextBox
          label="Title"
          value={settings.title}
          max={TITLE_MAX}
          placeholder={PLAN_LABEL}
          onChange={(title) => onChange({ title })}
        />
        <TextBox
          label="Note"
          value={note}
          max={NOTE_MAX}
          placeholder="e.g. Updated after the design review"
          hint="On page 1 (one line on a slide). Never remembered, so an old note can't go out again."
          onChange={onNote}
        />
        <TextBox
          label="Prepared by"
          value={preparedBy}
          max={PREPARED_BY_MAX}
          hint="Leave it empty to leave the line out."
          onChange={onPreparedBy}
        />
      </fieldset>

      <p className="xp-hint xp-hint-block">Made in your browser: nothing is uploaded.</p>
    </div>
  )
}

interface ChoiceProps {
  type: 'radio' | 'checkbox'
  name?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  /** Linked to the control with aria-describedby */
  hint?: string
}

/** One radio or checkbox with its label, and a hint under it. */
function Choice({ type, name, checked, disabled, onChange, label, hint }: ChoiceProps) {
  const hintId = useId()
  return (
    <div className="xp-choice">
      <label className="xp-choice-label">
        <input
          type={type}
          name={name}
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint && (
        <p id={hintId} className="xp-hint">
          {hint}
        </p>
      )}
    </div>
  )
}

interface TextBoxProps {
  label: string
  value: string
  max: number
  placeholder?: string
  hint?: string
  onChange: (value: string) => void
}

function TextBox({ label, value, max, placeholder, hint, onChange }: TextBoxProps) {
  const id = useId()
  return (
    <div className="xp-text">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value.slice(0, max))}
      />
      {hint && (
        <p id={`${id}-hint`} className="xp-hint">
          {hint}
        </p>
      )}
    </div>
  )
}
