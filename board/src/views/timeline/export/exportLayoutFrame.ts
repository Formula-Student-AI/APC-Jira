// The Timeline export's frame: everything about a document's pages that is the same on every page, worked
// out once before any page is drawn, in the order the layout needs it: the columns (the Task column measured
// from the longest title), the chart's width, the timescale, the lanes, every row fitted to its cells as a
// block for the paginator, the legend, the title block, and the heights of the page's regions with the room
// left for rows. Pure: no clock and no DOM.

import { columnOf, DONE_BAR, layColumns, layEntries, roomIn, type Column, type Entry } from './exportLayoutGrid'
import { layKeyDates, layPhases, type AfterView, type KeyDateView, type LaneInputs, type PhaseView } from './exportLayoutLanes'
import { layLegend, type LegendView } from './exportLayoutLegend'
import { countParts, fontsFor, lineHeight, plural, runsWidth, widthOf, type CountTone, type LayoutFonts, type Run } from './exportLayoutText'
import { INK } from './exportPalette'
import { dayOffset, LABEL_INSET, needsYear, periodDays, scaleFor, tiersFor, type Scale } from './exportPeriod'
import type { SheetSpec } from './exportSheets'
import { cleanText, fitLine, formatAsOf, formatDayShort, isolate, listText, unscheduledCount, wrapLines } from './exportText'
import type { Plan } from './planTypes'
import type { FontSpec, Hex, Measure } from './scene'

/** Room between the timescale or lanes and the first row, and between the last row and the legend. */
const BODY_GAP = 4
const LEGEND_GAP = 6
/** Clear space after the logo, and between the title block's two columns. */
const LOGO_GAP = 8
const COLUMN_GAP = 16
/** The title block's right-hand column never takes more than this share of the width. */
const RIGHT_SHARE = 0.45

export interface ScaleText {
  /** Chart points */
  x: number
  text: string
  anchor: 'start' | 'middle' | 'end'
}

export interface TitleBlockView {
  height: number
  textX: number
  eyebrow: { text: string; y: number }
  title: { text: string; y: number }
  subtitle: { text: string; y: number }
  /** The right-hand column, right-aligned, y from the top of the block */
  right: { runs: Run[]; y: number }[]
}

export interface NoteView {
  top: number
  /** Room taken by 'Note: ' before the lines */
  labelW: number
  lines: string[]
}

export interface Frame {
  plan: Plan
  sheet: SheetSpec
  measure: Measure
  fonts: LayoutFonts
  noun: 'Page' | 'Slide'
  summary: boolean
  /** The type's scale against paper (1 on paper), for indents and marks */
  k: number
  /** The content box: nothing is drawn in the margins */
  left: number
  right: number
  top: number
  bottom: number
  columns: Column[]
  /** The grid/chart divider */
  gridRight: number
  /** The period's first day starts at chartX and its last ends chartW later; a gutter of blank chart lies
   *  either side */
  chartX: number
  chartW: number
  gutter: number
  scale: Scale
  scaleFonts: { upper: FontSpec; lower: FontSpec }
  upper: ScaleText[]
  lower: ScaleText[]
  /** The as-of line in chart points (null when the as-of date is outside the period) */
  asOfX: number | null
  /** Where the elapsed-time shading ends, chart points (it starts at the divider; 0: none) */
  elapsedTo: number
  /** Where overdue bars' slip trails end: the as-of line, or the chart's right edge when the period is past */
  trailTo: number | null
  pill: { x: number; w: number; text: string } | null
  titleBlock: TitleBlockView
  /** The red rule under the title block (its centre) */
  ruleY: number
  note: NoteView | null
  /** The height page 1 gives its note (0 without one): page 1's regions below it move down by this much */
  noteExtra: number
  scaleTop: number
  phasesTop: number
  phaseTiers: number
  phases: PhaseView[]
  keysTop: number
  keyLines: number
  keyDates: KeyDateView[]
  after: AfterView | null
  lanesBottom: number
  bodyTop: number
  bodyBottom: number
  legend: LegendView
  footerTop: number
  footerRuleY: number
  entries: Entry[]
  continuedHeight: number
  /** The Done column's bar width, the same on every row so the bars line up (0: no room for one) */
  doneBar: number
  firstCapacity: number
  capacity: number
  /** Nothing to show: no rows at all */
  empty: boolean
  /** For the dialog, e.g. the key dates whose names were shortened */
  notes: string[]
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** Baselines in the title block, from its top. Paper uses the spec's; slides, whose type grows with the row
 *  step, stack their lines by their sizes and let the block grow when the type needs it. */
function titleBaselines(sheet: SheetSpec, fonts: LayoutFonts): { height: number; eyebrow: number; title: number; subtitle: number; right: number[] } {
  const block = sheet.titleBlock
  if (sheet.id !== 'slide') return { height: block.height, eyebrow: 7, title: 22, subtitle: 33, right: [9, 19, 28, 37] }
  const ascent = 0.76
  const descent = 0.22
  const eyebrow = 1 + 0.72 * fonts.eyebrow.size
  const title = eyebrow + 2.5 + ascent * fonts.title.size
  const subtitle = title + descent * fonts.title.size + 1 + ascent * fonts.subtitle.size
  const asOf = 1 + ascent * fonts.asOf.size
  const headline = asOf + descent * fonts.asOf.size + 2 + ascent * fonts.headline.size
  const needed = Math.max(subtitle + descent * fonts.subtitle.size, headline + descent * fonts.headline.size) + 0.5
  return { height: Math.max(block.height, block.logoHeight, Math.ceil(needed)), eyebrow, title, subtitle, right: [asOf, headline] }
}

/** The title block: the eyebrow, title and subtitle beside the logo; on the right the as-of date, the headline
 *  counts, the next key date and who prepared it (slides keep the first two). */
function layTitleBlock(plan: Plan, sheet: SheetSpec, fonts: LayoutFonts, measure: Measure, left: number, right: number): TitleBlockView {
  const slide = sheet.id === 'slide'
  const cap = (right - left) * RIGHT_SHARE
  const lines: Run[][] = []
  const asOf = formatAsOf(plan.asOf)
  if (asOf) lines.push([{ text: fitLine(`Status as of ${asOf}`, cap, fonts.asOf, measure), font: fonts.asOf, color: INK.text }])

  const colors: Record<CountTone, Hex> = { plain: INK.text, problem: INK.problemText, risk: INK.amberText }
  const headline: Run[] = []
  // Tasks without dates aren't in the counts, but when they are listed the headline says so, and never says
  // 'No tasks' above them.
  const parts = countParts(plan.counts)
  const unscheduled = unscheduledCount(plan)
  if (unscheduled > 0) {
    if (plan.counts.tasks <= 0) parts[0] = { text: 'No scheduled tasks', tone: 'plain' }
    parts.push({ text: `${unscheduled} not yet scheduled`, tone: 'plain' })
  }
  parts.forEach((part, i) => {
    if (i > 0) headline.push({ text: ' · ', font: fonts.headline, color: INK.text })
    headline.push({ text: part.text, font: fonts.headline, color: colors[part.tone] })
  })
  lines.push(
    runsWidth(headline, measure) <= cap
      ? headline
      : [{ text: fitLine(headline.map((run) => run.text).join(''), cap, fonts.headline, measure), font: fonts.headline, color: INK.text }],
  )

  const next = plan.nextKeyDate
  if (!slide && next) {
    const date = `, ${formatDayShort(next.date, true)}`
    const risk = next.state === 'atRisk' ? ' · at risk' : ''
    const prefix = 'Next key date: '
    const room = cap - widthOf(prefix, fonts.headline, measure) - widthOf(date, fonts.headline, measure) - widthOf(risk, fonts.headline, measure)
    const name = fitLine(cleanText(next.title), room, fonts.headline, measure)
    // The name is set apart, so a right-to-left one doesn't pull the day after it to its far side.
    const runs: Run[] = [{ text: `${prefix}${isolate(name)}${date}`, font: fonts.headline, color: INK.text }]
    if (risk) runs.push({ text: risk, font: fonts.headline, color: INK.amberText })
    if (name) lines.push(runs)
  }
  const preparedBy = cleanText(plan.preparedBy)
  if (!slide && preparedBy) {
    const prefix = 'Prepared by '
    const name = fitLine(preparedBy, cap - widthOf(prefix, fonts.headline, measure), fonts.headline, measure)
    if (name) lines.push([{ text: `${prefix}${name}`, font: fonts.headline, color: INK.text }])
  }

  const at = titleBaselines(sheet, fonts)
  const column = lines.slice(0, at.right.length).map((runs, i) => ({ runs, y: at.right[i] }))
  const columnW = Math.max(0, ...column.map((line) => runsWidth(line.runs, measure)))
  const textX = left + sheet.titleBlock.logoWidth + LOGO_GAP
  // The left-hand text is cut with '…' before it can reach the right-hand column.
  const room = Math.max(0, right - textX - (columnW > 0 ? columnW + COLUMN_GAP : 0))
  return {
    height: at.height,
    textX,
    eyebrow: { text: fitLine(cleanText(plan.org).toUpperCase(), room, fonts.eyebrow, measure), y: at.eyebrow },
    title: { text: fitLine(cleanText(plan.title), room, fonts.title, measure), y: at.title },
    subtitle: { text: fitLine(cleanText(plan.subtitle), room, fonts.subtitle, measure), y: at.subtitle },
    right: column,
  }
}

/** 'Key dates shortened to fit: “A”, “B” and 2 more.' */
function shortenedNote(names: string[]): string[] {
  if (names.length === 0) return []
  const shown = names.slice(0, 3).map((name) => `“${name}”`)
  if (names.length > 3) shown.push(`${names.length - 3} more`)
  return [`${names.length === 1 ? 'Key date' : 'Key dates'} shortened to fit: ${listText(shown)}.`]
}

/** Everything about the document's pages that is the same on every page, for `plan` on `sheet`. */
export function buildFrame(plan: Plan, sheet: SheetSpec, measure: Measure): Frame {
  const fonts = fontsFor(sheet)
  const slide = sheet.id === 'slide'
  const summary = plan.mode === 'summary'
  const left = sheet.margin.left
  const right = sheet.width - sheet.margin.right
  const top = sheet.margin.top
  const bottom = sheet.height - sheet.margin.bottom
  const contentW = right - left
  const k = fonts.task.size / 8
  const groups = plan.groups.filter((group) => group.rows.length > 0)

  // The columns, then the chart takes the rest of the width, so the period always fits it. The period is
  // set in by the cell padding at each end, so bars and diamonds on its first and last days never touch
  // the divider or the margin (with every column, the plan year then gets the spec's 376 pt on A4, 616 on A3).
  const columns = layColumns({ plan, groups, sheet, fonts, measure, left, contentW, k })
  const gridRight = columns.length ? columns[columns.length - 1].x + columns[columns.length - 1].w : left
  const gutter = sheet.pad
  const chartX = gridRight + gutter
  const chartW = Math.max(1, right - gutter - chartX)

  // The timescale, its tiers chosen from points per day before its fonts.
  const days = periodDays(plan.period)
  const tiers = tiersFor(days > 0 ? chartW / days : 0)
  const scaleFonts = tiers === 'years-months' ? { upper: fonts.year, lower: fonts.month } : { upper: fonts.month, lower: fonts.week }
  const scale = scaleFor(plan.period, chartW, scaleFonts, measure)
  const asOffset = dayOffset(plan.period, plan.asOf)
  let asOfX: number | null = null
  let elapsedTo = 0
  let trailTo: number | null = null
  if (Number.isFinite(asOffset) && scale.ppd > 0) {
    if (asOffset >= days) {
      // The whole period has passed: all of it is shaded, and late bars trail off to its end.
      elapsedTo = chartW + gutter
      trailTo = chartW
    } else if (asOffset >= 0) {
      asOfX = (asOffset + 0.5) * scale.ppd
      elapsedTo = asOfX
      trailTo = asOfX
    }
  }
  let pill: Frame['pill'] = null
  if (asOfX !== null) {
    const text = `As of ${formatDayShort(plan.asOf, needsYear(plan.asOf, plan.period))}`
    const w = widthOf(text, fonts.pill, measure) + 7 * (fonts.pill.size / 6.5)
    // The pill may use the gutters, but never crosses the divider or the margin.
    if (w <= chartW + 2 * gutter - 2) pill = { x: clamp(asOfX - w / 2, 1 - gutter, chartW + gutter - 1 - w), w, text }
  }
  const upper = scale.upper.flatMap((label): ScaleText[] => {
    if (!label.text) return []
    const width = widthOf(label.text, scaleFonts.upper, measure)
    const centre = label.x + label.width / 2
    if (!pill || centre + width / 2 <= pill.x - 2 || centre - width / 2 >= pill.x + pill.w + 2) {
      return [{ x: centre, text: label.text, anchor: 'middle' }]
    }
    // A label the pill would cover moves to its right, or else its left, within its own span, shortened to
    // its first word ('Nov 2026' to 'Nov') if it must be.
    const start = Math.max(0, label.x + LABEL_INSET / 2)
    const end = Math.min(chartW, label.x + label.width - LABEL_INSET / 2)
    const first = label.text.split(' ')[0]
    const forms = [label.text, first, /^\p{L}{4,}$/u.test(first) ? first.slice(0, 3) : ''].filter((form, i, all) => form && all.indexOf(form) === i)
    for (const text of forms) {
      const w = widthOf(text, scaleFonts.upper, measure)
      if (pill.x + pill.w + 3 + w <= end) return [{ x: pill.x + pill.w + 3, text, anchor: 'start' }]
      if (pill.x - 3 - w >= start) return [{ x: pill.x - 3, text, anchor: 'end' }]
    }
    return []
  })
  const lower = scale.lower.flatMap((label): ScaleText[] => (label.text ? [{ x: label.x + label.width / 2, text: label.text, anchor: 'middle' }] : []))

  // The lanes, the same on every page.
  const lanes: LaneInputs = { plan, fonts, measure, scale, chartW, gutter }
  const { phases, tiers: phaseTiers } = layPhases(lanes)
  const keys = layKeyDates(lanes)

  const { entries, continuedHeight } = layEntries(groups, { plan, sheet, fonts, measure, columns, scale, chartW, k })
  const legend = layLegend({ plan, fonts, measure, left, right, entries, phases, keyDates: keys.keyDates, asOfX })
  const titleBlock = layTitleBlock(plan, sheet, fonts, measure, left, right)

  const noteText = cleanText(plan.note)
  const labelW = widthOf('Note: ', fonts.noteLabel, measure)
  const noteLines = noteText ? wrapLines(noteText, contentW - labelW, fonts.subtitle, measure, slide ? 1 : 2) : []
  const afterRule = top + titleBlock.height + 1.5
  const note: NoteView | null = noteText ? { top: afterRule + 4, labelW, lines: noteLines } : null
  const noteExtra = note ? note.lines.length * lineHeight(fonts.subtitle) + 1 + 4 : 0

  // The regions from the top (page 1 moves them down by noteExtra), and from the bottom.
  const scaleTop = afterRule + sheet.titleBlock.gapAfter
  const phasesTop = scaleTop + sheet.scaleHeight
  const keysTop = phasesTop + (phaseTiers ? phaseTiers * sheet.lanes.phaseTier + 2 : 0)
  const lanesBottom = keysTop + (keys.lines ? keys.lines * sheet.lanes.keyDateLine + 3 : 0)
  const bodyTop = lanesBottom + BODY_GAP
  const footerTop = bottom - sheet.footerHeight
  const footerRuleY = footerTop - 1
  const legendTop = footerRuleY - 2 - legend.lines * sheet.legendLine
  const legendRuleY = legendTop - 2
  const bodyBottom = (legend.lines ? legendRuleY : footerRuleY) - LEGEND_GAP
  const capacity = bodyBottom - bodyTop

  const doneColumn = columnOf(columns, 'done')
  const fractions = entries.flatMap(({ view }) => (view.kind === 'summary' && view.done.includes('/') ? [widthOf(view.done, fonts.number, measure)] : []))
  const doneRoom = doneColumn ? roomIn(doneColumn, sheet.pad) - Math.max(0, ...fractions) - DONE_BAR.gap : 0
  const doneBar = doneRoom >= DONE_BAR.min ? Math.min(DONE_BAR.w, doneRoom) : 0

  return {
    plan,
    sheet,
    measure,
    fonts,
    noun: slide ? 'Slide' : 'Page',
    summary,
    k,
    left,
    right,
    top,
    bottom,
    columns,
    gridRight,
    chartX,
    chartW,
    gutter,
    scale,
    scaleFonts,
    upper,
    lower,
    asOfX,
    elapsedTo,
    trailTo,
    pill,
    titleBlock,
    ruleY: top + titleBlock.height + 0.75,
    note,
    noteExtra,
    scaleTop,
    phasesTop,
    phaseTiers,
    phases,
    keysTop,
    keyLines: keys.lines,
    keyDates: keys.keyDates,
    after: keys.after,
    lanesBottom,
    bodyTop,
    bodyBottom,
    legend: { ...legend, ruleY: legendRuleY, top: legendTop },
    footerTop,
    footerRuleY,
    entries,
    continuedHeight,
    doneBar,
    firstCapacity: capacity - noteExtra,
    capacity,
    empty: entries.length === 0,
    notes: shortenedNote(keys.shortened),
  }
}

/** '23 tasks', for a page's label. */
export function tasksText(count: number): string {
  return plural(count, 'task')
}
