// Which swimlanes are collapsed, remembered per view in this browser (localStorage).

import { useState } from 'react'

const storageKey = (viewId: string) => `fsai-board:collapsed-lanes:${viewId}`

function load(viewId: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(viewId)) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [])
  } catch {
    return new Set()
  }
}

function save(viewId: string, keys: Set<string>): void {
  try {
    localStorage.setItem(storageKey(viewId), JSON.stringify([...keys]))
  } catch {
    // Storage unavailable (e.g. private mode): the lanes just aren't remembered.
  }
}

/**
 * Collapsed lane keys for a view, and a toggle that remembers the change.
 * BoardView is keyed by view id (see App), so this state starts fresh for each view.
 */
export function useCollapsedLanes(viewId: string): [ReadonlySet<string>, (laneKey: string) => void] {
  const [collapsed, setCollapsed] = useState(() => load(viewId))

  const toggle = (laneKey: string) => {
    const next = new Set(collapsed)
    if (next.has(laneKey)) next.delete(laneKey)
    else next.add(laneKey)
    setCollapsed(next)
    save(viewId, next)
  }

  return [collapsed, toggle]
}
