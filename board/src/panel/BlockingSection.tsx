// Blocking: an item is blocked when its Status is "Blocked" (as on GitHub). This section adds why,
// and which other items it waits on.

import { BlockedIcon, XIcon } from '@primer/octicons-react'
import { useId, useMemo, useRef, useState } from 'react'
import { BLOCKED_STATUS } from '../fields'
import { openItem } from '../lib/router'
import { updateItem, useBoard } from '../store/board'
import type { Item } from '../types'
import { checkBlocker, withBlocker } from './blockers'
import { saveBlockedReason } from './saves'
import { useAutoGrow } from './useAutoGrow'
import { useDraft } from './useDebouncedSave'

export function BlockingSection({ item }: { item: Item }) {
  if (item.status !== BLOCKED_STATUS) {
    return (
      <div className="ip-unblocked">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void updateItem(item.id, { status: BLOCKED_STATUS }, 'the status')}
        >
          <BlockedIcon size={14} />
          Mark as blocked
        </button>
      </div>
    )
  }
  return (
    <section className="ip-blocked" aria-label="Blocked">
      <h3 className="ip-blocked-title">
        <BlockedIcon size={16} />
        Blocked
      </h3>
      <BlockedReason item={item} />
      <BlockedBy item={item} />
      <p className="ip-hint">To unblock it, change the Status.</p>
    </section>
  )
}

function BlockedReason({ item }: { item: Item }) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  const draft = useDraft(item.blocked_reason ?? '', (value) => saveBlockedReason(item.id, value), 800)
  useAutoGrow(ref, draft.value)
  return (
    <div className="ip-blocked-reason">
      <label className="field-label" htmlFor={id}>
        Why is it blocked?
      </label>
      <textarea
        ref={ref}
        id={id}
        className="textarea"
        rows={2}
        maxLength={2000}
        value={draft.value}
        placeholder="What is it waiting for, and what would unblock it?"
        onChange={(event) => draft.change(event.target.value)}
        onBlur={draft.commit}
      />
    </div>
  )
}

function BlockedBy({ item }: { item: Item }) {
  const items = useBoard((s) => s.items)
  const existing = useMemo(() => new Set(Object.values(items).map((other) => other.number)), [items])
  const titles = useMemo(() => new Map(Object.values(items).map((other) => [other.number, other.title])), [items])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  const add = () => {
    if (!text.trim()) return
    const check = checkBlocker(text, item, existing)
    if (!check.ok) {
      setError(check.error)
      return
    }
    setError(null)
    setText('')
    void updateItem(item.id, { blocked_by: withBlocker(item.blocked_by, check.number) }, 'the blockers')
  }

  return (
    <div className="ip-blocked-by">
      <label className="field-label" htmlFor={id}>
        Blocked by
      </label>
      <div className="ip-blockers">
        {item.blocked_by.map((number) => (
          <span key={number} className="chip chip-plain ip-blocker">
            <button type="button" className="ip-link-button" onClick={() => openItem(number)} title={titles.get(number)}>
              #{number}
            </button>
            <button
              type="button"
              className="ip-label-remove"
              aria-label={`Remove #${number}`}
              onClick={() =>
                void updateItem(item.id, { blocked_by: item.blocked_by.filter((n) => n !== number) }, 'the blockers')
              }
            >
              <XIcon size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          className="input ip-blocker-input"
          value={text}
          placeholder="#12"
          inputMode="numeric"
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setText(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
