// Why changes to Subteam members couldn't be saved, held by the dialog the editor is in.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pushToast } from '../store/board'

/** Why a change to a subteam's list couldn't be saved, by subteam id, and how to report one (null: it was). */
export interface SaveProblems {
  problems: Record<string, string>
  report: (subteam: string, problem: string | null) => void
  /** Called by the row that shows `subteam`'s problem, while it is on screen; returns its cleanup. */
  watch: (subteam: string) => () => void
}

/**
 * Held by the dialog the editor is in, so the answer to a change still shows when it comes after the editor's
 * tab was left (a toast would be hidden behind the dialog). A problem no row has shown yet becomes a toast
 * when the dialog closes, and so does any answer that comes after that.
 */
export function useSaveProblems(): SaveProblems {
  const [problems, setProblems] = useState<Record<string, string>>({})
  const held = useRef<Record<string, string>>({})
  const open = useRef(false)
  const onScreen = useRef(new Map<string, number>())
  const unseen = useRef(new Set<string>())

  useEffect(() => {
    open.current = true
    const pending = unseen.current
    return () => {
      open.current = false
      for (const subteam of pending) if (held.current[subteam]) pushToast('error', held.current[subteam])
      pending.clear()
    }
  }, [])

  const report = useCallback((subteam: string, problem: string | null) => {
    if (!open.current) {
      if (problem) pushToast('error', problem)
      return
    }
    if (!problem && !(subteam in held.current)) return
    const next = { ...held.current }
    if (problem) next[subteam] = problem
    else delete next[subteam]
    held.current = next
    setProblems(next)
    if (problem && !onScreen.current.get(subteam)) unseen.current.add(subteam)
    else unseen.current.delete(subteam)
  }, [])

  const watch = useCallback((subteam: string) => {
    onScreen.current.set(subteam, (onScreen.current.get(subteam) ?? 0) + 1)
    unseen.current.delete(subteam) // shown now
    return () => {
      const rows = (onScreen.current.get(subteam) ?? 1) - 1
      if (rows > 0) onScreen.current.set(subteam, rows)
      else onScreen.current.delete(subteam)
    }
  }, [])

  return useMemo(() => ({ problems, report, watch }), [problems, report, watch])
}
