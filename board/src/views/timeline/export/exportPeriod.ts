// The export's period (the days it covers) and its timescale: the presets, widening the whole plan to
// cover every row, and the two-tier scale chosen from points per day, with labels that fit.

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  endOfMonth,
  endOfYear,
  format,
  getDate,
  getMonth,
  max as latest,
  min as earliest,
  startOfMonth,
} from 'date-fns'
import { PLAN_END, PLAN_START } from '../../../config'
import { parseDay, toDay } from '../../../lib/format'
import type { MonthValue, PeriodChoice } from './exportSettings'
import { cleanText, fitsWidth, splitGraphemes } from './exportTextCore'
import type { Period } from './planTypes'
import type { FontSpec, Measure } from './scene'

/** A row's dates, for widening Whole plan. */
export interface DatedRow {
  title: string
  start: string | null
  due: string | null
}

/** One row stretching Whole plan past this many months gets a warning in the dialog. */
const LONG_PLAN_MONTHS = 24
/** The longest title the warning quotes, in graphemes. */
const WARNING_TITLE_MAX = 60

/** The plan year from config.ts. Those are valid days (a test checks); the fallback only stops a typo there
 *  from crashing the dialog. */
function planYear(): { start: Date; end: Date } {
  const start = parseDay(PLAN_START) ?? new Date(0)
  return { start, end: parseDay(PLAN_END) ?? start }
}

const monthsCovered = (first: Date, last: Date) => differenceInCalendarMonths(last, first) + 1

/** From the 1st of `from`'s month to the last day of `to`'s. */
function wholeMonths(from: Date, to: Date): Period {
  return { first: toDay(startOfMonth(from)), last: toDay(endOfMonth(to)) }
}

/** The 1st of a 'YYYY-MM' month, or null. */
const monthStart = (month: MonthValue): Date | null => (/^\d{4}-\d{2}$/.test(month) ? parseDay(`${month}-01`) : null)

/**
 * The days a choice covers, in whole months:
 * - plan: PLAN_START to PLAN_END (config.ts), widened to whole months to cover every row's dates. If one
 *   row alone stretches it past 24 months, `warning` names it, e.g. '“Sponsor renewal” (due Mar 2029)
 *   stretches the whole plan to 31 months.'
 * - next3 / next6: from the 1st of today's month, for 3 or 6 whole months.
 * - months: from the 1st of `from` to the last day of `to`.
 */
export function periodFor(choice: PeriodChoice, today: string, rows: DatedRow[]): { period: Period; warning: string | null } {
  if (choice.preset === 'next3' || choice.preset === 'next6') {
    const from = startOfMonth(parseDay(today) ?? planYear().start)
    return { period: wholeMonths(from, addMonths(from, choice.preset === 'next3' ? 2 : 5)), warning: null }
  }
  if (choice.preset === 'months') {
    const from = monthStart(choice.from)
    const to = monthStart(choice.to)
    // The dialog says when To is before From; until that is fixed the two are taken the right way round.
    if (from && to) {
      const inOrder = differenceInCalendarDays(to, from) >= 0
      return { period: inOrder ? wholeMonths(from, to) : wholeMonths(to, from), warning: null }
    }
  }
  return wholePlan(rows)
}

function wholePlan(rows: DatedRow[]): { period: Period; warning: string | null } {
  const plan = planYear()
  const planFirst = startOfMonth(plan.start)
  const planLast = endOfMonth(plan.end)
  let first = planFirst
  let last = planLast
  // The row that on its own stretches the plan furthest past LONG_PLAN_MONTHS, and how many others do too.
  let worst: { row: DatedRow; months: number } | null = null
  let others = 0
  for (const row of rows) {
    const dates = [parseDay(row.start), parseDay(row.due)].filter((date): date is Date => date !== null)
    if (dates.length === 0) continue
    const rowFirst = startOfMonth(earliest([planFirst, ...dates]))
    const rowLast = endOfMonth(latest([planLast, ...dates]))
    first = earliest([first, rowFirst])
    last = latest([last, rowLast])
    const months = monthsCovered(rowFirst, rowLast)
    if (months <= LONG_PLAN_MONTHS) continue
    if (worst) others++
    if (!worst || months > worst.months) worst = { row, months }
  }
  const period = wholeMonths(first, last)
  if (!worst) return { period, warning: null }
  const months = monthsCovered(first, last)
  const who = `${quotedTitle(worst.row.title)} (${datesOutside(worst.row, planFirst, planLast)})`
  const warning =
    others === 0
      ? `${who} stretches the whole plan to ${months} months.`
      : `${who} and ${others} other ${others === 1 ? 'task' : 'tasks'} stretch the whole plan to ${months} months.`
  return { period, warning }
}

/** A row's title for the warning, cleaned, in curly quotes and shortened if very long. */
function quotedTitle(title: string): string {
  const graphemes = splitGraphemes(cleanText(title))
  if (graphemes.length === 0) return 'A task'
  if (graphemes.length <= WARNING_TITLE_MAX) return `“${graphemes.join('')}”`
  return `“${graphemes.slice(0, WARNING_TITLE_MAX - 1).join('').trimEnd()}…”`
}

/** The row's dates that fall outside the plan year: 'due Mar 2029', or 'starts Jun 2025, due Oct 2027'. */
function datesOutside(row: DatedRow, planFirst: Date, planLast: Date): string {
  const parts: string[] = []
  for (const [word, value] of [['starts', row.start], ['due', row.due]] as const) {
    const date = parseDay(value)
    if (date && (differenceInCalendarDays(date, planFirst) < 0 || differenceInCalendarDays(date, planLast) > 0)) {
      parts.push(`${word} ${format(date, 'MMM yyyy')}`)
    }
  }
  return parts.join(', ')
}

/** Months for the From and To selects: 12 months before PLAN_START (or today, if earlier) to 12 months after PLAN_END. */
export function monthOptions(today: string): { value: MonthValue; label: string }[] {
  const plan = planYear()
  const now = parseDay(today) ?? plan.start
  // The end also reaches 12 months past today, so the selects still offer this month if config.ts is left
  // on an old plan year.
  const from = addMonths(startOfMonth(earliest([plan.start, now])), -12)
  const to = addMonths(startOfMonth(latest([plan.end, now])), 12)
  return eachMonthOfInterval({ start: from, end: to }).map((month) => ({
    value: format(month, 'yyyy-MM'),
    label: format(month, 'MMMM yyyy'),
  }))
}

/** 'Sep 2026 – Aug 2027', or 'Sep 2026' for a single month. */
export function periodLabel(period: Period): string {
  const first = parseDay(period.first)
  const last = parseDay(period.last)
  if (!first || !last) return ''
  const from = format(first, 'MMM yyyy')
  const to = format(last, 'MMM yyyy')
  return from === to ? from : `${from} – ${to}`
}

/** Number of days in the period, inclusive. */
export function periodDays(period: Period): number {
  const first = parseDay(period.first)
  const last = parseDay(period.last)
  return first && last ? Math.max(0, differenceInCalendarDays(last, first) + 1) : 0
}

/** Days from the period's first day to `day` (negative before it, ≥ periodDays after it). */
export function dayOffset(period: Period, day: string): number {
  // NaN for a day that isn't one, so a bad date shows up in tests instead of quietly landing on the edge.
  const first = parseDay(period.first)
  const date = parseDay(day)
  return first && date ? differenceInCalendarDays(date, first) : NaN
}

/** Dates need a year when the period is longer than 12 months, or the date falls outside the period. */
export function needsYear(day: string, period: Period): boolean {
  const date = parseDay(day)
  const first = parseDay(period.first)
  const last = parseDay(period.last)
  if (!date || !first || !last) return false
  if (differenceInCalendarDays(date, first) < 0 || differenceInCalendarDays(date, last) > 0) return true
  // Longer than 12 months means some day and month come round twice, so '4 Nov' alone could be either year.
  return differenceInCalendarDays(addMonths(first, 12), last) <= 0
}

/** A label over a span of the scale: x and width from the chart's left edge, text already fitted (may be ''). */
export interface ScaleLabel {
  x: number
  width: number
  text: string
}

export interface ScaleLine {
  x: number
  kind: 'year' | 'month' | 'week'
}

export type ScaleTiers = 'years-months' | 'months-weeks' | 'months-days'

export interface Scale {
  /** Points per day */
  ppd: number
  /** The chart's width in points */
  width: number
  tiers: ScaleTiers
  /** x of the start of a day ('YYYY-MM-DD') from the chart's left edge: dayOffset × ppd, not clamped */
  x: (day: string) => number
  /** Upper tier: years (years-months) or months; lower tier: months, Monday dates, or days */
  upper: ScaleLabel[]
  lower: ScaleLabel[]
  /** Gridlines: every month start (and year start), plus week starts in months-weeks */
  lines: ScaleLine[]
}

/** Points per day from which the lower tier shows days, and from which it shows Monday dates. A whole plan year
 *  comes to about 1 pt a day on A4 and 1.7 on A3 and slides, and reads best as years over months on all three;
 *  periods of up to about 6 months on A4 (or 10 on a slide) get Monday dates. */
const DAYS_FROM = 9
const WEEKS_FROM = 2

/** Labels fit their span less this many points (half at each side), so neighbouring labels never touch. They
 *  are meant to be centred in their span. */
export const LABEL_INSET = 1

/** The tiers at `ppd` points per day, as scaleFor picks them (so the layout can choose the tiers' fonts first). */
export function tiersFor(ppd: number): ScaleTiers {
  if (ppd >= DAYS_FROM) return 'months-days'
  return ppd >= WEEKS_FROM ? 'months-weeks' : 'years-months'
}

/** A span of the scale before its label is chosen, with the forms its label can take, longest first. */
interface Slot {
  x: number
  width: number
  forms: string[]
  /** Not cut short by either end of the period */
  whole: boolean
}

/**
 * The timescale for `period` fitted to `width` points. Tiers come from points per day: 9 or more gives
 * months over days; 2 to 9 gives months over Monday dates; below 2 gives years over months. Month names
 * shorten to fit their span ('November 2026', 'Nov 2026', 'Nov', 'N', then none); no quarter tier.
 * Labels use `fonts.upper` and `fonts.lower` and are measured with `measure`.
 */
export function scaleFor(period: Period, width: number, fonts: { upper: FontSpec; lower: FontSpec }, measure: Measure): Scale {
  const days = periodDays(period)
  const ppd = days > 0 && width > 0 ? width / days : 0
  const tiers = tiersFor(ppd)
  const x = (day: string) => dayOffset(period, day) * ppd
  const first = parseDay(period.first)
  const last = parseDay(period.last)
  if (!first || !last || ppd === 0) return { ppd, width, tiers, x, upper: [], lower: [], lines: [] }

  const offset = (date: Date) => differenceInCalendarDays(date, first)
  const slot = (from: Date, to: Date, forms: string[]): Slot => {
    const start = Math.max(0, offset(from))
    const end = Math.min(days - 1, offset(to))
    const whole = start === offset(from) && end === offset(to)
    return { x: start * ppd, width: (end - start + 1) * ppd, forms, whole }
  }
  const interval = { start: first, end: last }
  const months = eachMonthOfInterval(interval)
  const monthSlots = (patterns: string[]) =>
    months.map((month) => slot(month, endOfMonth(month), patterns.map((pattern) => format(month, pattern))))
  const mondays = eachWeekOfInterval(interval, { weekStartsOn: 1 }).filter((monday) => offset(monday) >= 0)

  let upper: Slot[]
  let lower: Slot[]
  if (tiers === 'years-months') {
    upper = eachYearOfInterval(interval).map((year) => slot(year, endOfYear(year), [format(year, 'yyyy')]))
    // The year is in the tier above, so months never repeat it.
    lower = monthSlots(['MMM', 'MMMMM'])
  } else {
    upper = monthSlots(['MMMM yyyy', 'MMM yyyy', 'MMM', 'MMMMM'])
    lower =
      tiers === 'months-weeks'
        ? mondays.map((monday) => slot(monday, addDays(monday, 6), [format(monday, 'd')]))
        : eachDayOfInterval(interval).map((day) => slot(day, day, [format(day, 'd')]))
  }

  const lines: ScaleLine[] = []
  for (const month of months) {
    // None at the chart's left edge, where the grid/chart divider already is.
    if (offset(month) > 0) lines.push({ x: offset(month) * ppd, kind: getMonth(month) === 0 ? 'year' : 'month' })
  }
  if (tiers === 'months-weeks') {
    for (const monday of mondays) {
      // A Monday that starts a month already has the month's line.
      if (offset(monday) > 0 && getDate(monday) !== 1) lines.push({ x: offset(monday) * ppd, kind: 'week' })
    }
    lines.sort((a, b) => a.x - b.x)
  }

  return {
    ppd,
    width,
    tiers,
    x,
    upper: fitSlots(upper, fonts.upper, measure),
    lower: fitSlots(lower, fonts.lower, measure),
    lines,
  }
}

/**
 * Each span's label: the longest form that every whole span in the tier can show, so whole months read
 * alike ('Nov 2026' throughout, never 'November 2026' beside 'Dec 2026'), or a shorter one where an end of
 * the period cuts a span short; '' when no form fits.
 */
function fitSlots(slots: Slot[], font: FontSpec, measure: Measure): ScaleLabel[] {
  const fits = (text: string, slot: Slot) => fitsWidth(text, slot.width - LABEL_INSET, font, measure)
  const whole = slots.filter((slot) => slot.whole)
  const forms = Math.max(0, ...slots.map((slot) => slot.forms.length))
  let level = 0
  while (level < forms && !whole.every((slot) => fits(slot.forms[level] ?? '', slot))) level++
  return slots.map((slot) => ({
    x: slot.x,
    width: slot.width,
    text: slot.forms.slice(level).find((text) => fits(text, slot)) ?? '',
  }))
}
