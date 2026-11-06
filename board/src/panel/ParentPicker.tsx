// "Make a subtask of…" / "Move to another task…" (the panel's ⋯ menu): search for the task this one
// becomes a step of. Only tasks it can go under are offered: not itself, not a subtask, not archived.

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { parentProblem, subtaskProblem } from '../lib/subtasks'
import { setParent, useBoard } from '../store/board'
import type { Item } from '../types'
import { Modal } from '../ui/Modal'
import { OptionChip } from '../ui/OptionChip'

export function ParentPicker({ item, onClose }: { item: Item; onClose: () => void }) {
  const items = useBoard((s) => s.items)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // The parent when the picker opened: the title and the list don't change while the choice saves.
  const [startParent] = useState(item.parent_id)
  const picked = useRef(false)
  const listId = useId()
  const formId = useId()

  // Why this item can't be a subtask at all (it has subtasks, or is a milestone or phase).
  const problem = subtaskProblem(item, items)

  const q = query.trim().toLowerCase().replace(/^#/, '')
  const matches = problem
    ? []
    : Object.values(items)
        .filter((other) => other.number > 0 && !other.archived && other.id !== startParent)
        .filter((other) => parentProblem(item, other, items) === null)
        .filter((other) => !q || String(other.number).startsWith(q) || other.title.toLowerCase().includes(q))
        .sort((a, b) => a.number - b.number)
        .slice(0, 8)
  const current = Math.min(active, Math.max(0, matches.length - 1))

  // Close at once: if the save fails, setParent undoes it and says why.
  const pick = (parent: Item | undefined) => {
    if (!parent || picked.current) return
    picked.current = true
    onClose()
    void setParent(item, parent)
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(0, Math.min(matches.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))))
    }
  }

  return (
    <Modal
      title={startParent ? `Move #${item.number} to another task` : `Make #${item.number} a subtask`}
      onClose={onClose}
      width={520}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      {problem ? (
        <p>{problem}</p>
      ) : (
        <form
          id={formId}
          className="ip-parentpick"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            pick(matches[current])
          }}
        >
          <p className="muted ip-parentpick-note">
            “{item.title}” becomes a step of the task you choose, listed under its Subtasks.
          </p>
          <input
            className="input"
            autoFocus
            data-autofocus
            role="combobox"
            aria-label="Parent task"
            aria-expanded={matches.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={matches[current] ? `${listId}-${matches[current].number}` : undefined}
            value={query}
            placeholder="Search by #number or title"
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
          />
          <ul id={listId} role="listbox" className="ip-linkform-list" aria-label="Tasks">
            {matches.map((other, index) => (
              <li
                key={other.id}
                id={`${listId}-${other.number}`}
                role="option"
                aria-selected={index === current}
                className="ip-linkform-option"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(other)}
              >
                <span className="ip-link-number">#{other.number}</span>
                <span className="ip-link-title">{other.title}</span>
                <OptionChip field="status" name={other.status} />
              </li>
            ))}
            {matches.length === 0 && <li className="ip-linkform-empty">No task found.</li>}
          </ul>
        </form>
      )}
    </Modal>
  )
}
