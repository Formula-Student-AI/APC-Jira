// Saves for the panel's typed fields. Each compares with what the board shows at that moment, so an
// unchanged value is never sent, and nothing is sent for an item that has gone.

import { updateItem, useBoard } from '../store/board'

function current(id: string) {
  return useBoard.getState().items[id]
}

/** Never saves an empty title: the field goes back to the saved one instead. */
export function saveTitle(id: string, value: string): void {
  const title = value.trim()
  const item = current(id)
  if (!item || !title || title === item.title) return
  void updateItem(id, { title }, 'the title')
}

export function saveDescription(id: string, value: string): void {
  const item = current(id)
  if (!item || value === item.description) return
  void updateItem(id, { description: value }, 'the description')
}

export function saveBlockedReason(id: string, value: string): void {
  const reason = value.trim() || null
  const item = current(id)
  if (!item || reason === (item.blocked_reason || null)) return
  void updateItem(id, { blocked_reason: reason }, 'the blocked reason')
}
