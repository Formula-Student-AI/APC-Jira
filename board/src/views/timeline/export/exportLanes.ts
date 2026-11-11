// The export's two lanes over the chart: phases packed into tiers so none overlap, and key-date labels
// placed so none collide. Also merging task spans into a summary row's segments.

import { compareAsc, differenceInCalendarDays } from 'date-fns'
import { parseDay } from '../../../lib/format'
import { SLACK, splitGraphemes } from './exportTextCore'
import type { DateSpan } from './planTypes'
import type { FontSpec, Measure } from './scene'

/** Allowance when comparing positions, so rounding never refuses an exact fit */
const EPS = 1e-6

const round2 = (value: number) => {
  const rounded = Math.round(value * 100) / 100
  return rounded === 0 ? 0 : rounded
}

/**
 * Packs spans (x0 ≤ x1, in points, given in order of start) into at most `maxTiers` tiers so that spans in
 * the same tier are at least `gap` apart; a span that fits no tier goes in the last one. Returns each span's
 * tier (0 = top) and the number of tiers used (0 when there are no spans).
 */
export function packTiers(spans: { x0: number; x1: number }[], maxTiers: number, gap: number): { tiers: number[]; count: number } {
  const limit = Math.max(1, Math.floor(maxTiers))
  const tiers = spans.map(() => 0)
  // The right end of what each tier holds so far.
  const ends: number[] = []
  // Taken in order of start whatever order they come in, which is what makes first fit safe.
  const order = spans.map((_, index) => index).sort((a, b) => spans[a].x0 - spans[b].x0 || a - b)
  for (const index of order) {
    const { x0, x1 } = spans[index]
    let tier = ends.findIndex((end) => end + gap <= x0 + EPS)
    if (tier < 0) tier = ends.length < limit ? ends.length : limit - 1
    tiers[index] = tier
    ends[tier] = Math.max(ends[tier] ?? -Infinity, x1)
  }
  return { tiers, count: ends.length }
}

export interface KeyDateLabelInput {
  /** The diamond's centre, in points from the chart's left edge */
  x: number
  name: string
  /** e.g. '15 Dec' */
  date: string
}

export interface KeyDateLabel {
  /** Which line of the lane the key date sits on, diamond and label together (0 is the top line) */
  line: number
  /** The label's anchor x: just right of the diamond (anchor start) or just left of it (anchor end) */
  x: number
  anchor: 'start' | 'end'
  /** Possibly shortened with '…'; '' when cut back to the date alone */
  name: string
  date: string
  /** Total width in points (name, a space and the date) */
  width: number
}

/** The least space between neighbouring key dates on a line, diamond and label included */
const LABEL_GAP = 4
/** A shortened name keeps at least this many characters before its '…' */
const MIN_NAME = 6

/**
 * Where a key date's label goes for names in `font`: half the diamond's width (a 7 pt diamond beside 7 pt
 * labels, growing with them on slides) and how far the label's anchor is from the diamond's centre.
 */
export function keyDateLabelGeometry(font: FontSpec): { half: number; offset: number } {
  return { half: font.size / 2, offset: font.size * 0.8 }
}

/**
 * How far earlier labels in the way may give way, in the order they are tried: not at all, shortened (never
 * below 6 characters), cut back to their date, or, only to make room for a later diamond with no label of
 * its own, giving up whatever text that diamond would land on.
 */
type Remedy = 'none' | 'shorten' | 'cut' | 'drop'

/** A key date on its line: its label, and the stretch it takes there (its diamond and, beside it, the label). */
interface Slot {
  index: number
  x: number
  line: number
  anchor: 'start' | 'end'
  name: string
  date: string
  width: number
  from: number
  to: number
}

/**
 * Places a label beside each key date on up to `maxLines` lines so labels never overlap (at least 4 pt
 * apart) and never run past the chart (0 to chartWidth): a label that would pass the right edge goes left of
 * its diamond. When they still collide, the earlier label's name is shortened (never below 6 characters,
 * ending '…'), then the later one is cut back to its date. `shortened` lists the full names that were cut.
 * `lines` is the number of lines used (at least 1 when there are inputs). Inputs are in date order.
 */
export function placeKeyDateLabels(
  items: KeyDateLabelInput[],
  chartWidth: number,
  nameFont: FontSpec,
  dateFont: FontSpec,
  measure: Measure,
  maxLines: number,
): { labels: KeyDateLabel[]; lines: number; shortened: string[] } {
  if (!items.length) return { labels: [], lines: 0, shortened: [] }
  const lineCount = Math.max(1, Math.floor(maxLines))
  const { half, offset } = keyDateLabelGeometry(nameFont)
  const space = measure(' ', dateFont)
  // Widths carry the export's 3% slack, so text measured on a canvas and drawn by SVG still clears.
  const widthOf = (name: string, date: string) => {
    const text = (name ? measure(name, nameFont) : 0) + (name && date ? space : 0) + (date ? measure(date, dateFont) : 0)
    return round2(text * SLACK)
  }

  const slots: Slot[] = []
  const byLine: Slot[][] = Array.from({ length: lineCount }, () => [])
  const cut = new Set<number>()

  const slotFor = (index: number, line: number, name: string, date: string): Slot => {
    const x = items[index].x
    const width = widthOf(name, date)
    const anchor = x + offset + width <= chartWidth + EPS ? 'start' : 'end'
    const from = width && anchor === 'end' ? x - offset - width : x - half
    const to = width && anchor === 'start' ? x + offset + width : x + half
    return { index, x, line, anchor, name, date, width, from, to }
  }
  const clashes = (slot: Slot) => byLine[slot.line].filter((other) => slot.from < other.to + LABEL_GAP && other.from < slot.to + LABEL_GAP)

  /** The longest shortening of `name` (MIN_NAME characters or more, then '…') whose label fits `room`. */
  const shorten = (name: string, date: string, room: number): string | null => {
    const chars = splitGraphemes(name)
    for (let keep = chars.length - 1; keep >= MIN_NAME; keep--) {
      const prefix = chars.slice(0, keep).join('')
      // A cut never ends on a space, which would show a gap before the '…' and fewer characters than kept.
      if (prefix.trimEnd() !== prefix) continue
      if (widthOf(`${prefix}…`, date) <= room + EPS) return `${prefix}…`
    }
    return null
  }

  /** How the earlier labels in the slot's way could give way, and the width they would lose; null if they can't. */
  const makeRoom = (slot: Slot, remedy: Remedy) => {
    const changes: { other: Slot; name: string; date: string }[] = []
    let lost = 0
    for (const other of clashes(slot)) {
      if (other.anchor === 'end') {
        // Its text is left of its diamond, so it can't make room on the right; but it is clear of a later
        // diamond with no label, which may then sit close to (or on) its diamond.
        if (remedy === 'drop') continue
        return null
      }
      if (remedy === 'drop') {
        // Diamonds a few days apart may meet; only text that the new diamond would land on has to go.
        if (!other.width || slot.to + 1 <= other.x + offset + EPS) continue
      } else if (!other.name || other.x + half + LABEL_GAP > slot.from + EPS) return null
      const room = slot.from - LABEL_GAP - (other.x + offset)
      const options: { name: string; date: string }[] = []
      if (other.name) {
        const short = shorten(items[other.index].name, other.date, room)
        if (short !== null) options.push({ name: short, date: other.date })
        if (remedy !== 'shorten') options.push({ name: '', date: other.date })
      }
      if (remedy === 'drop') options.push({ name: '', date: '' })
      const next = options.find((option) => (!option.name && !option.date) || widthOf(option.name, option.date) <= room + EPS)
      if (!next) return null
      changes.push({ other, ...next })
      lost += other.width - widthOf(next.name, next.date)
    }
    return { changes, lost }
  }

  /** On the top line where it fits; with a remedy, on the line where the labels in its way lose the least
   *  (then the one where it meets the fewest other key dates). */
  const tryPlace = (index: number, name: string, date: string, remedy: Remedy): boolean => {
    let best: { slot: Slot; changes: { other: Slot; name: string; date: string }[]; lost: number; crowd: number } | null = null
    for (let line = 0; line < lineCount; line++) {
      const slot = slotFor(index, line, name, date)
      const crowd = clashes(slot).length
      if (remedy === 'none') {
        if (crowd) continue
        best = { slot, changes: [], lost: 0, crowd }
        break
      }
      const room = makeRoom(slot, remedy)
      if (!room) continue
      if (!best || room.lost < best.lost - EPS || (room.lost <= best.lost + EPS && crowd < best.crowd)) best = { slot, ...room, crowd }
    }
    if (!best) return false
    for (const { other, name: shorter, date: kept } of best.changes) {
      // Labels that give way are all right of their diamonds, so only their right ends move.
      other.name = shorter
      other.date = kept
      other.width = widthOf(shorter, kept)
      other.to = other.width ? other.x + offset + other.width : other.x + half
      cut.add(other.index)
    }
    slots[index] = best.slot
    byLine[best.slot.line].push(best.slot)
    return true
  }

  items.forEach((item, index) => {
    let name = item.name
    let date = item.date
    // A label wider than the room on either side of its diamond is first shortened to fit the wider side.
    const room = Math.max(chartWidth - item.x - offset, item.x - offset)
    if (widthOf(name, date) > room + EPS) {
      name = shorten(name, date, room) ?? ''
      if (widthOf(name, date) > room + EPS) date = ''
    }
    // Shortening the earlier label comes first, then cutting this one back to its date. That only helps a
    // label left of its diamond (one on the right starts at its diamond, however long it is), so next the
    // earlier label is cut back to its date as well. Last of all, a key date only days after the others keeps
    // just its diamond and any text it would land on gives way, so no text ever lies over anything; that
    // last attempt always succeeds.
    const attempts: [string, string, Remedy][] = [
      [name, date, 'none'],
      [name, date, 'shorten'],
      ['', date, 'none'],
      ['', date, 'shorten'],
      [name, date, 'cut'],
      ['', date, 'cut'],
      ['', '', 'none'],
      ['', '', 'shorten'],
      ['', '', 'cut'],
      ['', '', 'drop'],
    ]
    const tried = new Set<string>()
    for (const [n, d, remedy] of attempts) {
      const key = `${n}\n${d}\n${remedy}`
      if (tried.has(key)) continue
      tried.add(key)
      if (tryPlace(index, n, d, remedy)) break
    }
    const placed = slots[index]
    if (placed.name !== item.name || placed.date !== item.date) cut.add(index)
  })

  const labels = slots.map(
    (slot): KeyDateLabel => ({
      line: slot.line,
      x: round2(slot.anchor === 'start' ? slot.x + offset : slot.x - offset),
      anchor: slot.anchor,
      name: slot.name,
      date: slot.date,
      width: slot.width,
    }),
  )
  const shortened = [...new Set([...cut].sort((a, b) => a - b).map((index) => items[index].name))].filter(Boolean)
  return { labels, lines: Math.max(...slots.map((slot) => slot.line)) + 1, shortened }
}

/** Spans (inclusive days) merged when they overlap or the gap between them is under `gapDays` days; in order. */
export function mergeSpans(spans: DateSpan[], gapDays: number): DateSpan[] {
  const days = spans.flatMap((span) => {
    const start = parseDay(span.start)
    const end = parseDay(span.end)
    if (!start || !end) return []
    // A span given back to front is read the right way round.
    if (compareAsc(start, end) > 0) return [{ start: end, end: start, span: { start: span.end, end: span.start } }]
    return [{ start, end, span: { start: span.start, end: span.end } }]
  })
  days.sort((a, b) => compareAsc(a.start, b.start) || compareAsc(a.end, b.end))
  const merged: { span: DateSpan; end: Date }[] = []
  for (const day of days) {
    const last = merged[merged.length - 1]
    // Days strictly between the two: 0 when they touch, negative when they overlap.
    if (last && differenceInCalendarDays(day.start, last.end) - 1 < gapDays) {
      if (compareAsc(day.end, last.end) > 0) {
        last.span = { start: last.span.start, end: day.span.end }
        last.end = day.end
      }
    } else merged.push({ span: day.span, end: day.end })
  }
  return merged.map((entry) => entry.span)
}
