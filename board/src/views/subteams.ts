// The subteam bar: the Subteam Board shows one subteam at a time, the Timeline any number of them.
// The pick lives in the address (#/timeline?team=Mechanical&team=Electrical), so it can be shared.

import { useMemo } from 'react'
import { combineFilters } from '../lib/filter'
import { useFieldOptions } from '../store/hooks'
import type { FieldOption } from '../types'
import type { BoardViewConfig, ViewConfig } from './config'

/** Filter text for "any of these subteams", e.g. subteam:"Braking System","Mechanical" ('' for none). */
export function subteamsFilter(names: string[]): string {
  const values = names.map((name) => name.replace(/"/g, '').trim()).filter(Boolean)
  return values.length ? `subteam:${values.map((value) => `"${value}"`).join(',')}` : ''
}

/**
 * The subteams a view shows: the picked ones that still exist, in board order. A view that shows one
 * subteam at a time uses the pick only when exactly one is picked. Empty means all subteams.
 */
export function shownSubteams(view: ViewConfig, picked: string[], options: FieldOption[]): string[] {
  if (!view.subteamPicker || picked.length === 0) return []
  const names = options.filter((o) => o.field === 'subteam' && picked.includes(o.name)).map((o) => o.name)
  return view.subteamPicker === 'one' && names.length !== 1 ? [] : names
}

/** shownSubteams as a hook, returning the same array while the result doesn't change. */
export function useShownSubteams(view: ViewConfig, picked: string[]): string[] {
  const options = useFieldOptions('subteam')
  const key = shownSubteams(view, picked, options).join('\n')
  return useMemo(() => (key ? key.split('\n') : []), [key])
}

/** The view's own filter plus the shown subteams. */
export function filterWithSubteams(view: ViewConfig, shown: string[]): string {
  return combineFilters(view.filter, subteamsFilter(shown))
}

/** The Subteam Board for one subteam: just its items, in Status columns. Other boards are unchanged. */
export function boardForSubteams(view: BoardViewConfig, shown: string[]): BoardViewConfig {
  if (view.subteamPicker !== 'one' || shown.length !== 1) return view
  return { ...view, filter: filterWithSubteams(view, shown), columnField: 'status', swimlaneField: null }
}
