// Blocking: an item is blocked when its Status is "Blocked" (as on GitHub). This section says why.
// Which tasks it waits on are its links (LinkedTasks), which the Timeline draws too.

import { BlockedIcon } from '@primer/octicons-react'
import { useId, useRef } from 'react'
import { BLOCKED_STATUS } from '../fields'
import { updateItem } from '../store/board'
import type { Item } from '../types'
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
      <p className="ip-hint">Add the tasks it waits on under Linked tasks. To unblock it, change the Status.</p>
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
