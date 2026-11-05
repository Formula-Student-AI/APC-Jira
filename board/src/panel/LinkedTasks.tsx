// Linked tasks, laid out like Jira's "Linked work items": the links grouped by type ("is blocked by",
// "blocks", "relates to"), and a "+" that opens a form with the link type and a task search.
// The Timeline draws the "blocks" links as lines between the bars.

import { AlertIcon, PlusIcon, XIcon } from '@primer/octicons-react'
import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { datesClash, itemsBlockedBy, LINK_TYPES, linkTypeProblem, relatedNumbers, type LinkType } from '../lib/links'
import { openItem } from '../lib/router'
import { addLink, removeLink, useBoard } from '../store/board'
import type { Item } from '../types'
import { AvatarStack } from '../ui/Avatar'
import { OptionChip } from '../ui/OptionChip'
import { PriorityIcon } from '../ui/PriorityIcon'

const LABELS = Object.fromEntries(LINK_TYPES.map((type) => [type.id, type.label])) as Record<LinkType, string>

export function LinkedTasks({ item }: { item: Item }) {
  const items = useBoard((s) => s.items)
  const all = useMemo(() => Object.values(items), [items])
  const byNumber = useMemo(() => new Map(all.map((other) => [other.number, other])), [all])
  const [adding, setAdding] = useState(false)
  const titleId = useId()

  const groups: { type: LinkType; numbers: number[] }[] = [
    { type: 'blocked_by', numbers: item.blocked_by },
    { type: 'blocks', numbers: itemsBlockedBy(all, item.number).map((other) => other.number) },
    { type: 'relates', numbers: relatedNumbers(all, item) },
  ]
  const total = groups.reduce((sum, group) => sum + group.numbers.length, 0)

  return (
    <section className="ip-section" aria-labelledby={titleId}>
      <div className="ip-links-head">
        <h3 className="ip-section-title" id={titleId}>
          Linked tasks
        </h3>
        {item.number > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Link a task"
            title="Link a task"
            aria-expanded={adding}
            onClick={() => setAdding(true)}
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {groups.map(
        ({ type, numbers }) =>
          numbers.length > 0 && (
            <div key={type} className="ip-link-group">
              <p className="ip-link-type">{LABELS[type]}</p>
              <ul className="ip-link-list">
                {numbers.map((number) => (
                  <LinkRow key={number} item={item} type={type} number={number} other={byNumber.get(number) ?? null} />
                ))}
              </ul>
            </div>
          ),
      )}
      {total === 0 && !adding && <p className="ip-link-none">No linked tasks yet.</p>}
      {adding && <AddLinkForm item={item} all={all} byNumber={byNumber} onClose={() => setAdding(false)} />}
    </section>
  )
}

interface LinkRowProps {
  item: Item
  type: LinkType
  number: number
  /** null when that task has been deleted */
  other: Item | null
}

function LinkRow({ item, type, number, other }: LinkRowProps) {
  const clash =
    other && type === 'blocked_by' && datesClash(other, item)
      ? `#${item.number} starts before #${number} ends`
      : other && type === 'blocks' && datesClash(item, other)
        ? `#${number} starts before #${item.number} ends`
        : null
  return (
    <li className="ip-link-row">
      <button
        type="button"
        className="ip-link-open"
        disabled={!other}
        title={other ? `Open #${number}` : undefined}
        onClick={() => openItem(number)}
      >
        <span className="ip-link-number">#{number}</span>
        <span className="ip-link-title">{other ? other.title : 'Deleted task'}</span>
      </button>
      {clash && (
        <span className="ip-link-clash" role="img" aria-label={`Dates clash: ${clash}`} title={`Dates clash: ${clash}`}>
          <AlertIcon size={14} />
        </span>
      )}
      {other && <OptionChip field="status" name={other.status} />}
      {other && other.assignees.length > 0 && <AvatarStack usernames={other.assignees} max={2} size={20} />}
      {other && <PriorityIcon name={other.extra.priority} />}
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm ip-link-remove"
        aria-label={`Remove the link: ${LABELS[type]} #${number}`}
        title="Remove the link"
        onClick={() => removeLink(item.id, type, number)}
      >
        <XIcon size={14} />
      </button>
    </li>
  )
}

interface AddLinkFormProps {
  item: Item
  all: Item[]
  byNumber: ReadonlyMap<number, Item>
  onClose: () => void
}

/** Jira's link form: the type, a task search (by #number or title), then Link or Cancel. */
function AddLinkForm({ item, all, byNumber, onClose }: AddLinkFormProps) {
  const [type, setType] = useState<LinkType>('blocked_by')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Item | null>(null)
  const [active, setActive] = useState(0)
  const listId = useId()

  const q = query.trim().toLowerCase().replace(/^#/, '')
  const matches = all
    .filter((other) => other.number > 0 && other.id !== item.id && !other.archived)
    .filter((other) => !q || String(other.number).startsWith(q) || other.title.toLowerCase().includes(q))
    .filter((other) => linkTypeProblem(byNumber, item, type, other.number) === null)
    .sort((a, b) => a.number - b.number)
    .slice(0, 8)
  const current = Math.min(active, Math.max(0, matches.length - 1))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (picked && addLink(item.id, type, picked.number)) onClose()
  }

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(0, Math.min(matches.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (matches[current]) setPicked(matches[current])
    } else if (event.key === 'Escape') {
      // Close the form, not the whole panel.
      event.preventDefault()
      onClose()
    }
  }

  return (
    <form className="ip-linkform" onSubmit={submit}>
      <div className="ip-linkform-row">
        <select
          className="select ip-linkform-type"
          value={type}
          aria-label="Link type"
          onChange={(event) => {
            setType(event.target.value as LinkType)
            setPicked(null)
          }}
        >
          {LINK_TYPES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="ip-linkform-search">
          {picked ? (
            <div className="ip-linkform-picked">
              <span className="ip-link-number">#{picked.number}</span>
              <span className="ip-link-title">{picked.title}</span>
              <button
                type="button"
                className="ip-label-remove"
                aria-label="Choose another task"
                onClick={() => {
                  setPicked(null)
                  setQuery('')
                }}
              >
                <XIcon size={12} />
              </button>
            </div>
          ) : (
            <>
              <input
                className="input"
                autoFocus
                role="combobox"
                aria-label="Task to link"
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
                onKeyDown={onSearchKey}
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
                    onClick={() => setPicked(other)}
                  >
                    <span className="ip-link-number">#{other.number}</span>
                    <span className="ip-link-title">{other.title}</span>
                    <OptionChip field="status" name={other.status} />
                  </li>
                ))}
                {matches.length === 0 && <li className="ip-linkform-empty">No tasks to link this way.</li>}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="ip-linkform-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!picked}>
          Link
        </button>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
