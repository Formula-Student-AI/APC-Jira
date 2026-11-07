// Debounced saving for fields people type into.
//
// Whatever is waiting to be saved always gets saved in the end: when the field is left (commit),
// when the component unmounts (the panel closes or shows another item), and when the page is hidden.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface Debounced<T> {
  /** Run the function with `value` once nothing new has been scheduled for `delay` ms. */
  schedule: (value: T) => void
  /** Keep `value` waiting with no timer: it runs on flush (and on unmount). */
  hold: (value: T) => void
  /** Run what is waiting now, if anything. */
  flush: () => void
  /** Forget what is waiting. */
  cancel: () => void
}

export function useDebounced<T>(fn: (value: T) => void, delay: number): Debounced<T> {
  const fnRef = useRef(fn)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ value: T } | null>(null)

  // Always call the latest function (it may close over newer props).
  useEffect(() => {
    fnRef.current = fn
  })

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = null
  }, [])

  const flush = useCallback(() => {
    const pending = pendingRef.current
    cancel()
    if (pending) fnRef.current(pending.value)
  }, [cancel])

  const schedule = useCallback(
    (value: T) => {
      pendingRef.current = { value }
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  const hold = useCallback(
    (value: T) => {
      cancel()
      pendingRef.current = { value }
    },
    [cancel],
  )

  // Save what is still waiting when the component goes away.
  useEffect(() => flush, [flush])

  // ...and when the page is hidden or closed. (A closing page may not finish the save.)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  return useMemo(() => ({ schedule, hold, flush, cancel }), [schedule, hold, flush, cancel])
}

export interface Draft {
  /** What the control shows: the draft while someone is typing, otherwise the saved value. */
  value: string
  /** Call from onChange. */
  change: (next: string) => void
  /** Call from onBlur (or Enter): saves at once and goes back to showing the saved value. */
  commit: () => void
}

/**
 * A text field's local draft. From the first keystroke until the field is left, `value` is what the
 * person typed, so live changes from others never overwrite it; `save` runs `delay` ms after typing
 * stops, on commit, and on unmount. `save` should compare with the stored value itself.
 */
export function useDraft(saved: string, save: (value: string) => void, delay: number): Draft {
  const [draft, setDraft] = useState<string | null>(null)
  const debounced = useDebounced(save, delay)
  return {
    value: draft ?? saved,
    change: (next) => {
      setDraft(next)
      debounced.schedule(next)
    },
    commit: () => {
      debounced.flush()
      setDraft(null)
    },
  }
}
