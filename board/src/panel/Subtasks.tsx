// Subtasks, as in Jira: the steps of a task under one umbrella. Each is a task of its own (status,
// assignees, dates, its own panel); here they are listed with a progress bar, ticked off when done, and
// added one after another with "+". A subtask can't have subtasks, so a subtask's panel has no list.

import { PlusIcon } from '@primer/octicons-react'
import { useId, useState, type FormEvent } from 'react'
import { DONE_STATUS } from '../fields'
import { progressOf } from '../lib/subtasks'
import { openItem } from '../lib/router'
import { addSubtask, updateItem, useBoard } from '../store/board'
import { useSubtasks } from '../store/hooks'
import type { Item } from '../types'
import { AvatarStack } from '../ui/Avatar'
import { OptionChip } from '../ui/OptionChip'

export function Subtasks({ item }: { item: Item }) {
  const all = useSubtasks(item.id)
  const [adding, setAdding] = useState(false)
  const titleId = useId()
  if (item.parent_id) return null

  const subtasks = all.filter((subtask) => !subtask.archived)
  const archived = all.length - subtasks.length
  const { done, total } = progressOf(all)
  const percent = total ? Math.round((done / total) * 100) : 0

  return (
    <section className="ip-section" aria-labelledby={titleId}>
      <div className="ip-links-head">
        <h3 className="ip-section-title" id={titleId}>
          Subtasks
        </h3>
        {total > 0 && (
          <span className="ip-subtasks-count">
            {done} of {total} done
          </span>
        )}
        {item.number > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Add a subtask"
            title="Add a subtask"
            aria-expanded={adding}
            onClick={() => setAdding(true)}
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {total > 0 && (
        <div
          className="ip-subtasks-bar"
          role="progressbar"
          aria-label="Subtasks done"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={`${done} of ${total} done`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {subtasks.length > 0 && (
        <ul className="ip-subtasks">
          {subtasks.map((subtask) => (
            <SubtaskRow key={subtask.id} subtask={subtask} />
          ))}
        </ul>
      )}
      {subtasks.length === 0 && !adding && (
        <p className="ip-link-none">No subtasks yet. Break this task into steps with +.</p>
      )}
      {archived > 0 && (
        <p className="ip-link-none ip-subtasks-archived">
          {archived} archived subtask{archived === 1 ? '' : 's'} not shown (filter: is:archived parent:{item.number})
        </p>
      )}
      {adding && <AddSubtaskForm parent={item} onClose={() => setAdding(false)} />}
    </section>
  )
}

function SubtaskRow({ subtask }: { subtask: Item }) {
  const firstStatus = useBoard((s) => s.options.find((o) => o.field === 'status')?.name ?? null)
  const hasDone = useBoard((s) => s.options.some((o) => o.field === 'status' && o.name === DONE_STATUS))
  const done = subtask.status === DONE_STATUS
  const ready = subtask.number > 0
  // Ticking marks it Done; unticking puts it back to the first status (e.g. Todo).
  const toggle = () => {
    const next = done ? firstStatus : DONE_STATUS
    if (next && next !== subtask.status) void updateItem(subtask.id, { status: next }, 'the status')
  }

  return (
    <li className={`ip-subtask${done ? ' ip-subtask-done' : ''}`}>
      <input
        type="checkbox"
        className="ip-subtask-check"
        checked={done}
        disabled={!ready || !hasDone || (done && !firstStatus)}
        aria-label={`#${subtask.number} ${subtask.title}: ${done ? 'done. Untick to reopen' : 'tick when done'}`}
        title={hasDone ? (done ? 'Done. Untick to reopen it' : `Tick to mark it ${DONE_STATUS}`) : `There is no ${DONE_STATUS} status`}
        onChange={toggle}
      />
      <button
        type="button"
        className="ip-link-open"
        disabled={!ready}
        title={ready ? `Open #${subtask.number}` : undefined}
        onClick={() => openItem(subtask.number)}
      >
        <span className="ip-link-number">{ready ? `#${subtask.number}` : '#…'}</span>
        <span className="ip-link-title">{subtask.title}</span>
      </button>
      <OptionChip field="status" name={subtask.status} />
      {subtask.assignees.length > 0 && <AvatarStack usernames={subtask.assignees} max={2} size={20} />}
    </li>
  )
}

/** Type a step and press Enter; the box stays open for the next one. */
function AddSubtaskForm({ parent, onClose }: { parent: Item; onClose: () => void }) {
  const [title, setTitle] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = title.trim()
    if (!text) return
    // It shows at once (and says so if it can't be saved), so the next step can be typed straight away.
    setTitle('')
    void addSubtask(parent, text)
  }

  return (
    <form className="ip-subtask-form" onSubmit={submit}>
      <input
        className="input"
        autoFocus
        maxLength={300}
        value={title}
        placeholder="What needs to be done?"
        aria-label="New subtask"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // Close the box, not the whole panel.
            event.preventDefault()
            onClose()
          }
        }}
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!title.trim()}>
        Add
      </button>
      <button type="button" className="btn btn-sm" onClick={onClose}>
        Close
      </button>
    </form>
  )
}
