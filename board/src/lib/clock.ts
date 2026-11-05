// Today's date as a React-safe external store (re-renders when the day changes).
import { useSyncExternalStore } from 'react'
import { toDay } from './format'

let today = toDay(new Date())
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function tick() {
  const next = toDay(new Date())
  if (next !== today) {
    today = next
    listeners.forEach((listener) => listener())
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  timer ??= setInterval(tick, 60_000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const getToday = () => today

/** 'YYYY-MM-DD' for today, updating at midnight. */
export function useToday(): string {
  return useSyncExternalStore(subscribe, getToday, getToday)
}
