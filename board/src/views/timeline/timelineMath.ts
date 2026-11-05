// Pure date/pixel helpers for the Timeline. Day indexes count whole days from the range start.

import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  format,
  getDaysInMonth,
  max as latest,
  min as earliest,
  startOfMonth,
} from 'date-fns'
import { parseDay, toDay } from '../../lib/format'
import { byPosition } from '../../lib/position'
import type { FieldOption, Item } from '../../types'

export type Zoom = 'month' | 'quarter' | 'year'

export const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
]

export const PX_PER_DAY: Record<Zoom, number> = { month: 36, quarter: 12, year: 3.2 }

export interface Range {
  start: Date
  /** Number of days shown */
  days: number
}

/** A bar as inclusive day indexes. */
export interface Bar {
  start: number
  end: number
}

export type DragMode = 'move' | 'start' | 'end'

/**
 * The days to show: the 2026–27 plan year (Sep–Aug) at least, widened to cover every item's dates
 * (plus some room) and today, in whole months.
 */
export function computeRange(items: Item[], today: Date): Range {
  const dates = items.flatMap((item) => [parseDay(item.start_date), parseDay(item.due_date)]).filter((d): d is Date => d !== null)
  const start = startOfMonth(earliest([new Date(2026, 8, 1), addDays(today, -30), ...dates.map((d) => addDays(d, -14))]))
  const end = endOfMonth(latest([new Date(2027, 7, 31), addDays(today, 60), ...dates.map((d) => addDays(d, 30))]))
  return { start, days: differenceInCalendarDays(end, start) + 1 }
}

export function dayIndex(range: Range, day: Date): number {
  return differenceInCalendarDays(day, range.start)
}

export function dayString(range: Range, index: number): string {
  return toDay(addDays(range.start, index))
}

/** The item's bar; an item with one date gets a one-day bar. Null without dates. */
export function barFor(item: Pick<Item, 'start_date' | 'due_date'>, range: Range): Bar | null {
  const start = parseDay(item.start_date)
  const due = parseDay(item.due_date)
  const first = start ?? due
  const last = due ?? start
  if (!first || !last) return null
  return { start: dayIndex(range, first), end: dayIndex(range, last) }
}

/** The bar after dragging by `delta` days; the start never passes the end. */
export function dragBar(bar: Bar, mode: DragMode, delta: number): Bar {
  if (mode === 'move') return { start: bar.start + delta, end: bar.end + delta }
  if (mode === 'start') return { start: Math.min(bar.start + delta, bar.end), end: bar.end }
  return { start: bar.start, end: Math.max(bar.end + delta, bar.start) }
}

/**
 * Dates to save for a bar. Moving keeps whichever dates the item had (a due-date-only item stays
 * due-date-only); stretching an end sets both.
 */
export function datesForBar(
  item: Pick<Item, 'start_date' | 'due_date'>,
  bar: Bar,
  range: Range,
  mode: DragMode,
): { start_date: string | null; due_date: string | null } {
  const start = dayString(range, bar.start)
  const end = dayString(range, bar.end)
  if (mode === 'move') {
    return { start_date: item.start_date ? start : null, due_date: item.due_date ? end : null }
  }
  return { start_date: start, due_date: end }
}

export interface Span {
  key: string
  label: string
  /** First day index */
  start: number
  days: number
}

export function monthSpans(range: Range, zoom: Zoom): Span[] {
  const last = addDays(range.start, range.days - 1)
  return eachMonthOfInterval({ start: range.start, end: last }).map((month) => ({
    key: toDay(month),
    label: format(month, zoom === 'year' ? 'MMM yy' : 'MMMM yyyy'),
    start: dayIndex(range, month),
    days: getDaysInMonth(month),
  }))
}

/** Week starts (Mondays) for the Quarter zoom's second header row. */
export function weekTicks(range: Range): Span[] {
  const last = addDays(range.start, range.days - 1)
  return eachWeekOfInterval({ start: range.start, end: last }, { weekStartsOn: 1 })
    .map((week) => ({ key: toDay(week), label: format(week, 'd'), start: dayIndex(range, week), days: 7 }))
    .filter((week) => week.start >= 0)
}

export interface TimelineGroup {
  key: string
  /** Subteam, or null for "No subteam" */
  value: string | null
  name: string
  items: Item[]
}

/**
 * Items with dates grouped by subteam in option order (GitHub sorts this view by Subsystems), each
 * group by start date; and the items without any date.
 */
export function groupForTimeline(items: Item[], subteams: FieldOption[]): { groups: TimelineGroup[]; undated: Item[] } {
  const groups: TimelineGroup[] = subteams.map((option) => ({ key: option.id, value: option.name, name: option.name, items: [] }))
  const none: TimelineGroup = { key: 'none', value: null, name: 'No subteam', items: [] }
  const byName = new Map(groups.map((group) => [group.value, group]))
  const undated: Item[] = []
  for (const item of items) {
    if (!item.start_date && !item.due_date) undated.push(item)
    else ((item.subteam && byName.get(item.subteam)) || none).items.push(item)
  }
  const firstDay = (item: Item) => item.start_date ?? item.due_date ?? ''
  for (const group of [...groups, none]) {
    group.items.sort((a, b) => firstDay(a).localeCompare(firstDay(b)) || byPosition(a, b))
  }
  return { groups: none.items.length ? [...groups, none] : groups, undated }
}
