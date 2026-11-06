import { useState } from 'react'

/** Runs one save at a time for a row and reports whether one is in progress. */
export function useBusy(): [boolean, (task: () => Promise<unknown>) => void] {
  const [busy, setBusy] = useState(false)
  const run = (task: () => Promise<unknown>) => {
    setBusy(true)
    void task().finally(() => setBusy(false))
  }
  return [busy, run]
}
