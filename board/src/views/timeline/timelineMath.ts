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

// ------------------------------------------------------------------------------------------ links

/** Heights in px of a row and of a subteam heading. Set on the timeline as CSS variables, so the
 *  drawing of the links and the layout always agree. */
export const ROW_H = 36
export const GROUP_H = 46

/** Where each shown item's row is: the y of its centre, from the top of the rows, plus the total height. */
export function rowLayout(groups: TimelineGroup[], collapsed: ReadonlySet<string>): { centres: Map<number, number>; height: number } {
  const centres = new Map<number, number>()
  let y = 0
  for (const group of groups) {
    y += GROUP_H
    if (collapsed.has(group.key)) continue
    for (const item of group.items) {
      centres.set(item.number, y + ROW_H / 2)
      y += ROW_H
    }
  }
  return { centres, height: y }
}

/**
 * An SVG path from the end of one bar (x1, y1) to the start of another (x2, y2), in Jira's style: a
 * smooth S when there's room, or out to the right, along the gap between the rows and back in when the
 * second bar starts too early.
 */
export function linkPath(x1: number, y1: number, x2: number, y2: number): string {
  const r = (n: number) => Math.round(n * 10) / 10
  if (x2 - x1 >= 16) {
    const bend = Math.min(40, (x2 - x1) / 2)
    return `M${r(x1)} ${r(y1)}C${r(x1 + bend)} ${r(y1)} ${r(x2 - bend)} ${r(y2)} ${r(x2)} ${r(y2)}`
  }
  const gap = y2 > y1 ? y1 + ROW_H / 2 : y1 - ROW_H / 2
  return (
    `M${r(x1)} ${r(y1)}C${r(x1 + 14)} ${r(y1)} ${r(x1 + 14)} ${r(gap)} ${r(x1)} ${r(gap)}` +
    `L${r(x2)} ${r(gap)}C${r(x2 - 14)} ${r(gap)} ${r(x2 - 14)} ${r(y2)} ${r(x2)} ${r(y2)}`
  )
}

export interface LinkLine {
  key: string
  /** Number of the blocking item (the line starts at the end of its bar) */
  from: number
  /** Number of the blocked item (the line ends at the start of its bar) */
  to: number
  path: string
  /** The blocked item starts before the blocking one ends */
  clash: boolean
}

/** The links to draw: both items have a bar in an open group. */
export function timelineLinks(
  groups: TimelineGroup[],
  centres: ReadonlyMap<number, number>,
  range: Range,
  px: number,
  clashes: (blocker: Item, blocked: Item) => boolean,
): LinkLine[] {
  const shown = new Map<number, { item: Item; bar: Bar; y: number }>()
  for (const group of groups) {
    for (const item of group.items) {
      const y = centres.get(item.number)
      const bar = shownBar(item, range)
      if (y !== undefined && bar) shown.set(item.number, { item, bar, y })
    }
  }
  const lines: LinkLine[] = []
  for (const blocked of shown.values()) {
    for (const number of blocked.item.blocked_by) {
      const blocker = shown.get(number)
      if (!blocker) continue
      lines.push({
        key: `${number}>${blocked.item.number}`,
        from: number,
        to: blocked.item.number,
        path: linkPath(
          linkX(blocker.item, blocker.bar, 'end', px),
          blocker.y,
          linkX(blocked.item, blocked.bar, 'start', px),
          blocked.y,
        ),
        clash: clashes(blocker.item, blocked.item),
      })
    }
  }
  return lines
}

// ------------------------------------------------------------------------------------------ milestones

type Dated = Pick<Item, 'start_date' | 'due_date' | 'is_milestone'>

/** Half the width of a milestone's diamond, in px. */
export const DIAMOND_R = 8

/** The bar drawn for an item. A milestone is a single day: its due date (or else its start date). */
export function shownBar(item: Dated, range: Range): Bar | null {
  const bar = barFor(item, range)
  return bar && item.is_milestone ? { start: bar.end, end: bar.end } : bar
}

/** Where a link meets an item: the end or start of its bar, or the tips of a milestone's diamond. */
export function linkX(item: Dated, bar: Bar, side: 'start' | 'end', px: number): number {
  if (item.is_milestone) {
    const centre = (bar.start + 0.5) * px
    return side === 'end' ? centre + DIAMOND_R : centre - DIAMOND_R
  }
  return side === 'end' ? (bar.end + 1) * px : bar.start * px
}

export interface MilestoneMarker {
  id: string
  number: number
  title: string
  subteam: string | null
  /** 'YYYY-MM-DD' */
  date: string
  /** Centre of the milestone's day, in px from the timeline's start */
  x: number
}

/** Every dated milestone on the board (whatever the view shows), as a line across the timeline. */
export function milestoneMarkers(items: Iterable<Item>, range: Range, px: number): MilestoneMarker[] {
  const markers: MilestoneMarker[] = []
  for (const item of items) {
    if (!item.is_milestone || item.archived) continue
    const bar = shownBar(item, range)
    const date = item.due_date ?? item.start_date
    if (!bar || !date || bar.start < 0 || bar.start >= range.days) continue
    markers.push({ id: item.id, number: item.number, title: item.title, subteam: item.subteam, date, x: (bar.start + 0.5) * px })
  }
  return markers.sort((a, b) => a.x - b.x || a.number - b.number)
}

// ------------------------------------------------------------------------------------------ phases

export interface PhaseBand {
  id: string
  number: number
  title: string
  subteam: string | null
  /** 'YYYY-MM-DD' */
  start: string
  /** 'YYYY-MM-DD' */
  end: string
  /** Left edge and width in px, kept within the timeline */
  x: number
  width: number
}

/** Every dated phase on the board (whatever the view shows), as a band shaded across the timeline. */
export function phaseBands(items: Iterable<Item>, range: Range, px: number): PhaseBand[] {
  const bands: PhaseBand[] = []
  for (const item of items) {
    if (!item.is_phase || item.archived) continue
    const bar = barFor(item, range)
    if (!bar) continue
    const first = Math.max(0, bar.start)
    const last = Math.min(range.days - 1, bar.end)
    if (last < first) continue
    bands.push({
      id: item.id,
      number: item.number,
      title: item.title,
      subteam: item.subteam,
      start: item.start_date ?? item.due_date ?? '',
      end: item.due_date ?? item.start_date ?? '',
      x: first * px,
      width: (last - first + 1) * px,
    })
  }
  return bands.sort((a, b) => a.x - b.x || a.number - b.number)
}
