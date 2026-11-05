// React hooks over the stores. Selectors return stable references (no new arrays per render).
import { useMemo } from 'react'
import { combineFilters, matchesFilter, parseFilter } from '../lib/filter'
import { optionsFor } from '../lib/options'
import { byPosition } from '../lib/position'
import type { FieldOption, Item, Member } from '../types'
import { useAuth } from './auth'
import { useBoard, type SaveState } from './board'

export function useMe(): Member | null {
  return useAuth((s) => s.member)
}

/** Board-admin powers the database will honour for this session (use this to show admin tools). */
export function useIsBoardAdmin(): boolean {
  return useAuth((s) => s.adminActive)
}

/** The member is marked as a board admin, even if this session can't use the powers (see AuthState.adminActive). */
export function useHasBoardAdminRole(): boolean {
  return useAuth((s) => s.member?.is_board_admin ?? false)
}

/** Options of one field (status, subteam, priority, ...) in sort order. */
export function useFieldOptions(field: string): FieldOption[] {
  const options = useBoard((s) => s.options)
  return useMemo(() => optionsFor(options, field), [options, field])
}

/** Members sorted by full name. Retired members are left out unless `includeRetired`. */
export function useMembersList(includeRetired = false): Member[] {
  const members = useBoard((s) => s.members)
  return useMemo(
    () =>
      Object.values(members)
        .filter((m) => includeRetired || m.active)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [members, includeRetired],
  )
}

export function useItemByNumber(number: number | null): Item | null {
  const items = useBoard((s) => s.items)
  return useMemo(() => (number ? (Object.values(items).find((i) => i.number === number) ?? null) : null), [items, number])
}

export function useSaveState(itemId: string | null | undefined): SaveState {
  return useBoard((s) => (itemId ? (s.saveState[itemId] ?? 'idle') : 'idle'))
}

/**
 * Items matching a view's built-in filter plus the filter box text, in manual order.
 * Archived items are left out unless the filter says is:archived.
 */
export function useViewItems(viewFilter: string, query: string): Item[] {
  const items = useBoard((s) => s.items)
  const members = useBoard((s) => s.members)
  const me = useAuth((s) => s.member?.username ?? null)
  return useMemo(() => {
    const tokens = parseFilter(combineFilters(viewFilter, query))
    const ctx = { me, members }
    return Object.values(items)
      .filter((item) => matchesFilter(item, tokens, ctx))
      .sort(byPosition)
  }, [items, members, me, viewFilter, query])
}
