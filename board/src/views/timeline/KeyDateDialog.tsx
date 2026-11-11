// "◆ Milestone" and "Phase" on the Timeline. A milestone is a key date (design freeze, competition): a
// diamond with a line down the timeline. A phase is a period (concept design, manufacturing): a band
// shaded over its dates. The whole team's (and Admin's) run across every subteam, any other subteam's down
// its own section. Both are items like any other, so they can be linked and edited.

/** Where the line or band goes, by the subteam picked. */
const REACH = `across every subteam for the whole team or ${WHOLE_TEAM_SUBTEAM}, otherwise down its own subteam only.`

import { useId, useState, type FormEvent } from 'react'
import { WHOLE_TEAM_SUBTEAM } from '../../config'
import { useToday } from '../../lib/clock'
import { isWholeDay } from '../../lib/format'
import { DateBox } from '../../ui/DateBox'
import { openItem } from '../../lib/router'
import { createItem } from '../../store/board'
import { useFieldOptions } from '../../store/hooks'
import { Modal } from '../../ui/Modal'

export type KeyDateKind = 'milestone' | 'phase'

const TEXT: Record<KeyDateKind, { title: string; button: string; placeholder: string; note: string }> = {
  milestone: {
    title: 'New milestone',
    button: 'Add milestone',
    placeholder: 'e.g. Design freeze, FS UK competition',
    note: `It shows as a diamond on its date, with a line down the Timeline: ${REACH} Link tasks to it (“blocks”) to see in red when they would finish too late.`,
  },
  phase: {
    title: 'New phase',
    button: 'Add phase',
    placeholder: 'e.g. Concept design, Manufacturing, Testing',
    note: `Its dates are shaded, with its name at the top: ${REACH} Drag its bar to move it, or its ends to change the dates.`,
  },
}

interface KeyDateDialogProps {
  kind: KeyDateKind
  /** Subteam to start with (the one picked in the subteam bar, if just one) */
  subteam: string | null
  onClose: () => void
}

export function KeyDateDialog({ kind, subteam, onClose }: KeyDateDialogProps) {
  const today = useToday()
  const subteams = useFieldOptions('subteam')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [team, setTeam] = useState(subteam ?? '')
  const [busy, setBusy] = useState(false)
  const formId = useId()
  const ids = { title: useId(), start: useId(), end: useId(), team: useId() }
  const text = TEXT[kind]
  const phase = kind === 'phase'
  // Half-typed dates (e.g. "0202-11-05" while a year is typed) are neither errors nor ready.
  const datesWrong = phase && isWholeDay(start) && isWholeDay(end) && end < start
  const ready = !!title.trim() && isWholeDay(start) && (!phase || (isWholeDay(end) && !datesWrong))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    const created = await createItem({
      title: title.trim(),
      is_milestone: !phase,
      is_phase: phase,
      start_date: start,
      due_date: phase ? end : start,
      subteam: team || null,
    })
    setBusy(false)
    if (created) {
      onClose()
      openItem(created.number)
    }
  }

  return (
    <Modal
      title={text.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy || !ready}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {text.button}
          </button>
        </>
      }
    >
      <form id={formId} className="hdr-newform" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="field-label" htmlFor={ids.title}>
            Name
          </label>
          <input
            id={ids.title}
            className="input"
            autoFocus
            data-autofocus
            maxLength={300}
            value={title}
            placeholder={text.placeholder}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="hdr-newform-row">
          <div>
            <label className="field-label" htmlFor={ids.start}>
              {phase ? 'Start date' : 'Date'}
            </label>
            <DateBox
              id={ids.start}
              className="input"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              // Keep the end on or after the start: once the start is left, as typing passes through
              // other dates ("25" is "02" first).
              onBlur={() => {
                if (phase && isWholeDay(start) && isWholeDay(end) && start > end) setEnd(start)
              }}
            />
          </div>
          {phase ? (
            <div>
              <label className="field-label" htmlFor={ids.end}>
                End date
              </label>
              <DateBox
                id={ids.end}
                className="input"
                value={end}
                // No min: changing it makes the browser rebuild the box, wiping an end date being typed.
                aria-invalid={datesWrong || undefined}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          ) : (
            <TeamSelect id={ids.team} value={team} onChange={setTeam} options={subteams.map((o) => o.name)} />
          )}
        </div>
        {phase && (
          <div className="hdr-newform-row">
            <TeamSelect id={ids.team} value={team} onChange={setTeam} options={subteams.map((o) => o.name)} />
          </div>
        )}
        {datesWrong && <p className="field-error">The end date must be on or after the start date.</p>}
        <p className="muted hdr-newform-note">{text.note}</p>
      </form>
    </Modal>
  )
}

function TeamSelect({ id, value, onChange, options }: { id: string; value: string; onChange: (team: string) => void; options: string[] }) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        Subteam
      </label>
      <select id={id} className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Whole team</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}
