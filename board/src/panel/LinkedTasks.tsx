// Linked tasks, as in Jira: the items this one is blocked by (waits on), and the items it blocks.
// The Timeline draws the same links between the bars, in red when the dates clash.

import { AlertIcon, PlusIcon, XIcon } from '@primer/octicons-react'
import { useId, useMemo, useState } from 'react'
import { datesClash, itemsBlockedBy, wouldLoop } from '../lib/links'
import { openItem } from '../lib/router'
import { addBlocker, removeBlocker, useBoard } from '../store/board'
import type { Item } from '../types'
import { Dropdown } from '../ui/Dropdown'
import { OptionChip } from '../ui/OptionChip'
import { arrowKeyFocus } from './dom'

interface LinkRow {
  number: number
  /** null when that item has been deleted */
  other: Item | null
}

export function LinkedTasks({ item }: { item: Item }) {
  const items = useBoard((s) => s.items)
  const all = useMemo(() => Object.values(items), [items])
  const byNumber = useMemo(() => new Map(all.map((other) => [other.number, other])), [all])
  const titleId = useId()
  const ready = item.number > 0

  const blockers: LinkRow[] = item.blocked_by.map((number) => ({ number, other: byNumber.get(number) ?? null }))
  const blocked: LinkRow[] = itemsBlockedBy(all, item.number).map((other) => ({ number: other.number, other }))
  // Items that can still be linked each way: not this one, not archived, not linked already, and no loop.
  const pickable = (other: Item) => other.number > 0 && other.id !== item.id && !other.archived
  const canBlockThis = all.filter(
    (other) => pickable(other) && !item.blocked_by.includes(other.number) && !wouldLoop(byNumber, item.number, other.number),
  )
  const canBeBlocked = all.filter(
    (other) => pickable(other) && !other.blocked_by.includes(item.number) && !wouldLoop(byNumber, other.number, item.number),
  )

  return (
    <section className="ip-section" aria-labelledby={titleId}>
      <h3 className="ip-section-title" id={titleId}>
        Linked tasks
      </h3>
      <LinkGroup
        label="Blocked by"
        empty="Not waiting on any task."
        rows={blockers}
        clashText={(other) => (datesClash(other, item) ? `#${item.number} starts before #${other.number} ends` : null)}
        onRemove={(number) => removeBlocker(item.id, number)}
        candidates={ready ? canBlockThis : null}
        onAdd={(other) => addBlocker(item.id, other.number)}
      />
      <LinkGroup
        label="Blocks"
        empty="No task waits on this one."
        rows={blocked}
        clashText={(other) => (datesClash(item, other) ? `#${other.number} starts before #${item.number} ends` : null)}
        onRemove={(number) => {
          const other = byNumber.get(number)
          if (other) removeBlocker(other.id, item.number)
        }}
        candidates={ready ? canBeBlocked : null}
        onAdd={(other) => addBlocker(other.id, item.number)}
      />
    </section>
  )
}

interface LinkGroupProps {
  label: string
  empty: string
  rows: LinkRow[]
  /** A warning when the two items' dates clash, else null */
  clashText: (other: Item) => string | null
  onRemove: (number: number) => void
  /** Items that can be added; null while this item is still being created */
  candidates: Item[] | null
  onAdd: (other: Item) => void
}

function LinkGroup({ label, empty, rows, clashText, onRemove, candidates, onAdd }: LinkGroupProps) {
  return (
    <div className="ip-link-group">
      <div className="ip-link-head">
        <span className="field-label">{label}</span>
        {candidates && (
          <Dropdown
            label={
              <>
                <PlusIcon size={14} /> Add
              </>
            }
            ariaLabel={`Add a "${label}" link`}
            buttonClassName="btn btn-ghost btn-sm"
            align="right"
            width={360}
          >
            {(close) => (
              <ItemMenu
                label={label}
                candidates={candidates}
                onPick={(other) => {
                  onAdd(other)
                  close()
                }}
              />
            )}
          </Dropdown>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="ip-link-none">{empty}</p>
      ) : (
        <ul className="ip-link-list">
          {rows.map(({ number, other }) => {
            const clash = other ? clashText(other) : null
            return (
              <li key={number} className="ip-link-row">
                <button
                  type="button"
                  className="ip-link-open"
                  disabled={!other}
                  title={other ? `Open #${number}` : undefined}
                  onClick={() => openItem(number)}
                >
                  <span className="ip-link-number">#{number}</span>
                  <span className="ip-link-title">{other ? other.title : 'Deleted item'}</span>
                </button>
                {clash && (
                  <span className="ip-link-clash" role="img" aria-label={`Dates clash: ${clash}`} title={`Dates clash: ${clash}`}>
                    <AlertIcon size={14} />
                  </span>
                )}
                {other && <OptionChip field="status" name={other.status} />}
                <button type="button" className="ip-label-remove" aria-label={`Remove the link to #${number}`} onClick={() => onRemove(number)}>
                  <XIcon size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Search box and a list of items to link (by number or title). */
function ItemMenu({ label, candidates, onPick }: { label: string; candidates: Item[]; onPick: (other: Item) => void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase().replace(/^#/, '')
  const matches = candidates
    .filter((other) => !q || String(other.number).startsWith(q) || other.title.toLowerCase().includes(q))
    .sort((a, b) => a.number - b.number)
  const shown = matches.slice(0, 50)
  return (
    <div className="ip-member-menu" onKeyDown={arrowKeyFocus}>
      <input
        className="input"
        autoFocus
        value={query}
        placeholder="Search by #number or title"
        aria-label={`Search tasks for ${label}`}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="ip-member-list">
        {shown.length === 0 && <p className="muted ip-member-none">No tasks to link.</p>}
        {shown.map((other) => (
          <button key={other.id} type="button" className="menu-item" onClick={() => onPick(other)}>
            <span className="ip-link-number">#{other.number}</span>
            <span className="ip-member-name">{other.title}</span>
          </button>
        ))}
        {matches.length > shown.length && (
          <p className="muted ip-member-none">{matches.length - shown.length} more: type to narrow the list.</p>
        )}
      </div>
    </div>
  )
}
