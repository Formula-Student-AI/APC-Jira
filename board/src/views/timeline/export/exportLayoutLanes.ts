// The Timeline export's two lanes over the chart, worked out once for the whole document: phases cut to the
// period and packed into tiers, and key dates with labels that never collide, the note for the first key
// date after the period, and where each key date's dashed line can start without crossing a label.

import type { OptionColor } from '../../../types'
import { keyDateLabelGeometry, packTiers, placeKeyDateLabels, type KeyDateLabel } from './exportLanes'
import { barX } from './exportLayoutGrid'
import { inkOf, RING } from './exportLayoutMarks'
import { widthOf, type LayoutFonts } from './exportLayoutText'
import type { SubteamInk } from './exportPalette'
import { dayOffset, needsYear, periodDays, type Scale } from './exportPeriod'
import { cleanText, fitLine, formatDayShort } from './exportText'
import type { KeyDateState, Plan } from './planTypes'
import type { Measure } from './scene'

/** Phases pack into at most three tiers. */
const MAX_TIERS = 3
/** Key-date labels go on at most four lines: a fourth is only used when key dates crowd together, and it
 *  saves a name from being shortened, which matters more to a reader than one line of height. */
const MAX_KEY_LINES = 4
/** A phase's name sits this far inside its segment. */
export const PHASE_PAD = 3
/** The '→' before the next key date after the period, and the gap after it (paper; scaled with the type). */
export const ARROW = { w: 7, gap: 3 }

export interface PhaseView {
  x0: number
  x1: number
  tier: number
  color: OptionColor | null
  ink: SubteamInk
  now: boolean
  name: string
}

export interface KeyDateView {
  /** The diamond's centre, chart points */
  x: number
  state: KeyDateState
  color: OptionColor | null
  ink: SubteamInk
  label: KeyDateLabel
  /** When the label kept its date: the date as shown, then the state's words after it ('· overdue') */
  date: string
  words: string
  /** Its dashed line starts at the diamond, or below the lane when another label lies under it */
  fromDiamond: boolean
}

/** The note at the lane's right edge naming the next key date after the period. */
export interface AfterView {
  line: number
  /** Left edge, chart points (it ends at the chart's right edge) */
  x: number
  name: string
  date: string
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export interface LaneInputs {
  plan: Plan
  fonts: LayoutFonts
  measure: Measure
  scale: Scale
  chartW: number
  /** The blank strip at each end of the chart, outside the period */
  gutter: number
}

/** Phases cut to the period and packed into tiers, each named as far as its segment (and the next phase on
 *  its tier) allows. */
export function layPhases({ plan, fonts, measure, scale, chartW }: LaneInputs): { phases: PhaseView[]; tiers: number } {
  const spans = plan.phases
    .flatMap((phase) => {
      const bar = barX(phase.start, phase.end, scale, chartW, 0)
      return bar ? [{ phase, x0: bar.x0, x1: bar.x1 }] : []
    })
    .sort((a, b) => a.x0 - b.x0)
  const { tiers, count } = packTiers(spans, MAX_TIERS, 0)
  const phases = spans.map((span, i): PhaseView => ({
    x0: span.x0,
    x1: span.x1,
    tier: tiers[i],
    color: span.phase.color,
    ink: inkOf(span.phase.color),
    now: span.phase.state === 'now',
    name: '',
  }))
  phases.forEach((phase, i) => {
    // A name too long for its segment runs on into the free lane after it, up to the next phase on its tier
    // (or the chart's end), rather than being cut: readers find their way by the phases' names. A tier that
    // ran out of room holds phases that overlap, so there a name still stops where the next one starts.
    const next = phases.slice(i + 1).find((other) => other.tier === phase.tier)
    const end = next ? next.x0 - PHASE_PAD : chartW
    const room = end - phase.x0 - 2 * PHASE_PAD
    phase.name = fitLine(cleanText(spans[i].phase.title), room, phase.now ? fonts.phaseNow : fonts.phase, measure)
  })
  return { phases, tiers: count }
}

/** A label's text as a stretch of the chart, or null when it has none. */
function textSpan(label: KeyDateLabel): [number, number] | null {
  if (!label.width) return null
  return label.anchor === 'start' ? [label.x, label.x + label.width] : [label.x - label.width, label.x]
}

/** Key dates on their lines with labels that never collide, the note for the next key date after the period,
 *  and the names that had to be shortened. */
export function layKeyDates({ plan, fonts, measure, scale, chartW, gutter }: LaneInputs): {
  keyDates: KeyDateView[]
  lines: number
  after: AfterView | null
  shortened: string[]
} {
  const { half } = keyDateLabelGeometry(fonts.laneName)
  const days = periodDays(plan.period)
  // A diamond on the period's first or last days may use the chart's gutter, but stays whole on the page.
  const low = half * RING + 0.5 - gutter
  const high = chartW + gutter - half * RING - 0.5
  const items = plan.keyDates
    .flatMap((keyDate) => {
      const offset = dayOffset(plan.period, keyDate.date)
      if (!Number.isFinite(offset) || offset < 0 || offset >= days || !(scale.ppd > 0)) return []
      const x = low <= high ? clamp((offset + 0.5) * scale.ppd, low, high) : chartW / 2
      const words = keyDate.state === 'overdue' ? ' · overdue' : keyDate.state === 'atRisk' ? ' · at risk' : ''
      return [{ keyDate, x, name: cleanText(keyDate.title), date: formatDayShort(keyDate.date, needsYear(keyDate.date, plan.period)), words }]
    })
    .sort((a, b) => a.x - b.x)
  const placed = placeKeyDateLabels(
    items.map((item) => ({ x: item.x, name: item.name, date: `${item.date}${item.words}` })),
    chartW,
    fonts.laneName,
    fonts.laneDate,
    measure,
    MAX_KEY_LINES,
  )
  const spans = placed.labels.map(textSpan)

  let lines = placed.lines
  let after: AfterView | null = null
  const shortened = [...placed.shortened]
  const next = plan.afterPeriod
  if (next) {
    const k = fonts.laneName.size / 7
    const lead = (ARROW.w + ARROW.gap) * k
    const name = cleanText(next.title)
    const date = formatDayShort(next.date, needsYear(next.date, plan.period))
    const space = widthOf(' ', fonts.laneDate, measure)
    const widthFor = (shown: string) => lead + widthOf(shown, fonts.laneName, measure) + (shown ? space : 0) + widthOf(date, fonts.laneDate, measure)
    // How far right each line is taken, by label text (4 pt apart) and diamonds (1 pt).
    const taken = (line: number) =>
      Math.max(
        0,
        ...placed.labels.flatMap((label, i) => {
          if (label.line !== line) return []
          const span = spans[i]
          return [items[i].x + half + 1, ...(span ? [span[1] + 4] : [])]
        }),
      )
    const free = (line: number, width: number) => taken(line) <= chartW - width + 1e-6
    /** The name shortened to fit `room` beside the arrow and the date ('' when only they fit). */
    const fitIn = (room: number) => {
      const text = fitLine(name, room - (lead + space + widthOf(date, fonts.laneDate, measure)), fonts.laneName, measure)
      return text === '…' ? '' : text
    }
    const full = widthFor(name)
    let line = -1
    for (let l = 0; l < lines && line < 0; l++) if (free(l, full)) line = l
    let shown = name
    if (line < 0 && lines < MAX_KEY_LINES) {
      // A line of its own, where a name longer than the chart is wide is shortened all the same: the note
      // ends at the chart's right edge, so unfitted it would start left of the chart, or off the page.
      shown = fitIn(chartW)
      if (free(lines, widthFor(shown))) line = lines
    } else if (line < 0) {
      // Every line is full: the line with most room at the right end takes the note, shortened.
      let best = 0
      for (let l = 1; l < lines; l++) if (taken(l) < taken(best)) best = l
      shown = fitIn(chartW - taken(best))
      if (free(best, widthFor(shown))) line = best
    }
    if (line >= 0) {
      if (shown !== name) shortened.push(name)
      after = { line, x: chartW - widthFor(shown), name: shown, date }
      lines = Math.max(lines, line + 1)
    }
  }

  // Text on the lines below a key date, which its dashed line must not cross.
  const below = (line: number): [number, number][] => [
    ...placed.labels.flatMap((other, j) => {
      const span = spans[j]
      return other.line > line && span ? [span] : []
    }),
    ...(after && after.line > line ? [[after.x, chartW] as [number, number]] : []),
  ]
  const keyDates = items.map((item, i): KeyDateView => {
    const label = placed.labels[i]
    // Where it would cross text, the dashed line starts below the lane instead of at the diamond.
    const crossed = below(label.line).some(([from, to]) => from - 1 < item.x && item.x < to + 1)
    return {
      x: item.x,
      state: item.keyDate.state,
      color: item.keyDate.color,
      ink: inkOf(item.keyDate.color),
      label,
      date: label.date ? item.date : '',
      words: label.date ? item.words : '',
      fromDiamond: !crossed,
    }
  })
  return { keyDates, lines, after, shortened: [...new Set(shortened)].filter(Boolean) }
}
