// A once-a-minute tick, so relative times such as "5 minutes ago" stay right while the panel is open.

import { useSyncExternalStore } from 'react'

let minute = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  timer ??= setInterval(() => {
    minute += 1
    listeners.forEach((notify) => notify())
  }, 60_000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const getMinute = () => minute

/** Re-renders the calling component once a minute. */
export function useMinuteTick(): number {
  return useSyncExternalStore(subscribe, getMinute, getMinute)
}
