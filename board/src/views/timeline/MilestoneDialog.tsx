// "◆ Milestone" on the Timeline: a key date (design freeze, competition) shown as a diamond with a line
// across the timeline. It is an item like any other, marked as a milestone, so it can be linked and edited.

import { useId, useState, type FormEvent } from 'react'
import { useToday } from '../../lib/clock'
import { openItem } from '../../lib/router'
import { createItem } from '../../store/board'
import { useFieldOptions } from '../../store/hooks'
import { Modal } from '../../ui/Modal'

export function MilestoneDialog({ subteam, onClose }: { subteam: string | null; onClose: () => void }) {
  const today = useToday()
  const subteams = useFieldOptions('subteam')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [team, setTeam] = useState(subteam ?? '')
  const [busy, setBusy] = useState(false)
  const formId = useId()
  const titleId = useId()
  const dateId = useId()
  const teamId = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = title.trim()
    if (!text || !date || busy) return
    setBusy(true)
    const created = await createItem({ title: text, is_milestone: true, start_date: date, due_date: date, subteam: team || null })
    setBusy(false)
    if (created) {
      onClose()
      openItem(created.number)
    }
  }

  return (
    <Modal
      title="New milestone"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy || !title.trim() || !date}>
            {busy && <span className="spinner" aria-hidden="true" />}
            Add milestone
          </button>
        </>
      }
    >
      <form id={formId} className="hdr-newform" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="field-label" htmlFor={titleId}>
            Name
          </label>
          <input
            id={titleId}
            className="input"
            autoFocus
            maxLength={300}
            value={title}
            placeholder="e.g. Design freeze, FS UK competition"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="hdr-newform-row">
          <div>
            <label className="field-label" htmlFor={dateId}>
              Date
            </label>
            <input id={dateId} type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor={teamId}>
              Subteam
            </label>
            <select id={teamId} className="select" value={team} onChange={(event) => setTeam(event.target.value)}>
              <option value="">Whole team</option>
              {subteams.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="muted hdr-newform-note">
          It shows as a diamond on its date, with a line across the whole Timeline. Link tasks to it (“blocks”) to
          see in red when they would finish too late.
        </p>
      </form>
    </Modal>
  )
}
