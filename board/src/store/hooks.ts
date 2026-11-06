// React hooks over the stores. Selectors return stable references (no new arrays per render).
import { useMemo } from 'react'
import { combineFilters, matchesFilter, parseFilter } from '../lib/filter'
import { canManageDomains, domainsOf, optionsFor, subteamLeads } from '../lib/options'
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

/** Usernames of a subteam's leads (none when there's no subteam or it has no leads). */
export function useSubteamLeads(subteam: string | null | undefined): string[] {
  const options = useBoard((s) => s.options)
  return useMemo(() => subteamLeads(options, subteam), [options, subteam])
}

/** A subteam's domains in order (none when there's no subteam). */
export function useDomains(subteam: string | null | undefined): FieldOption[] {
  const options = useBoard((s) => s.options)
  return useMemo(() => domainsOf(options, subteam), [options, subteam])
}

/** The subteams whose domains you may manage: every one for a board admin, otherwise the ones you lead. */
export function useDomainSubteams(): FieldOption[] {
  const subteams = useFieldOptions('subteam')
  const me = useAuth((s) => s.member)
  const adminActive = useAuth((s) => s.adminActive)
  const sessionTrusted = useAuth((s) => s.sessionTrusted)
  return useMemo(
    () => subteams.filter((subteam) => canManageDomains(subteam, me, { adminActive, sessionTrusted })),
    [subteams, me, adminActive, sessionTrusted],
  )
}

/** May you add domains to this subteam (and rename, reorder or delete them)? */
export function useCanManageDomains(subteam: string | null | undefined): boolean {
  const managed = useDomainSubteams()
  return !!subteam && managed.some((option) => option.name === subteam)
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
  const options = useBoard((s) => s.options)
  const me = useAuth((s) => s.member?.username ?? null)
  return useMemo(() => {
    const tokens = parseFilter(combineFilters(viewFilter, query))
    const ctx = { me, members, options }
    return Object.values(items)
      .filter((item) => matchesFilter(item, tokens, ctx))
      .sort(byPosition)
  }, [items, members, options, me, viewFilter, query])
}
