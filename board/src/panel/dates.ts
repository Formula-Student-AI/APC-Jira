// Start and due dates. Half-typed dates wait until they're whole, and a start date after the due
// date is shown with an error but never saved.

import type { Item, ItemPatch } from '../types'

export type DateKey = 'start_date' | 'due_date'

/** What a date box shows instead of the saved date: a date string, or null while it's half-typed. */
export type DateDrafts = Partial<Record<DateKey, string | null>>

type Dates = Pick<Item, 'start_date' | 'due_date'>

const KEYS: DateKey[] = ['start_date', 'due_date']

/** '' or a whole date. While a year is typed the box reports values such as "0002-11-05" on the way. */
export function isWholeDayOrEmpty(value: string): boolean {
  return value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900)
}

/** The value a date box shows. */
export function shownDate(item: Dates, drafts: DateDrafts, key: DateKey): string {
  const draft = drafts[key]
  if (draft === null) return ''
  return draft ?? item[key] ?? ''
}

/** Both dates are whole and the start is after the due date. */
export function datesOutOfOrder(start: string, due: string): boolean {
  return start !== '' && due !== '' && isWholeDayOrEmpty(start) && isWholeDayOrEmpty(due) && start > due
}

export interface DatePlan {
  /** Drafts to keep showing */
  drafts: DateDrafts
  /** What to save, if anything */
  patch: ItemPatch | null
}

/** After a date box changed (`value` null = half-typed): which drafts to keep and what to save. */
export function planDateChange(item: Dates, drafts: DateDrafts, key: DateKey, value: string | null): DatePlan {
  const next: DateDrafts = { ...drafts, [key]: value }
  // A half-typed box counts as its saved date until it's finished.
  const effective = (k: DateKey): string => {
    const draft = next[k]
    return typeof draft === 'string' ? draft : (item[k] ?? '')
  }
  const start = effective('start_date')
  const due = effective('due_date')
  if (!isWholeDayOrEmpty(start) || !isWholeDayOrEmpty(due) || datesOutOfOrder(start, due)) {
    return { drafts: next, patch: null }
  }
  const patch: ItemPatch = {}
  const kept: DateDrafts = {}
  for (const k of KEYS) {
    const draft = next[k]
    if (draft === null) kept[k] = null
    else if (draft !== undefined && (draft || null) !== item[k]) patch[k] = draft || null
  }
  return { drafts: kept, patch: Object.keys(patch).length > 0 ? patch : null }
}

/** When a box is left, a half-typed date in it is dropped: the box shows the saved date again. */
export function dropUnfinished(drafts: DateDrafts, key: DateKey): DateDrafts {
  const draft = drafts[key]
  if (draft === undefined || (draft !== null && isWholeDayOrEmpty(draft))) return drafts
  const next = { ...drafts }
  delete next[key]
  return next
}

/** Names the change in error messages. */
export function datesWhat(patch: ItemPatch): string {
  if ('start_date' in patch && 'due_date' in patch) return 'the dates'
  return 'start_date' in patch ? 'the start date' : 'the due date'
}
