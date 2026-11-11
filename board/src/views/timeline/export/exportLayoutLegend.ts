// The Timeline export's legend, the same on every page: KEY, a swatch for each subteam drawn, then only the
// markings this document uses, each with a sample drawn by the chart's own shape functions, flowing onto up
// to three lines, and the definitions of Overdue and At risk when either appears.

import type { Entry, TaskView } from './exportLayoutGrid'
import type { KeyDateView, PhaseView } from './exportLayoutLanes'
import { inkOf, SAMPLE_KINDS, sampleWidth, type SampleKind } from './exportLayoutMarks'
import { widthOf, type LayoutFonts } from './exportLayoutText'
import type { SubteamInk } from './exportPalette'
import { cleanText, fitLine, formatDayShort } from './exportText'
import type { Plan } from './planTypes'
import type { Measure } from './scene'

/** The legend's most lines, the definitions of Overdue and At risk among them. */
const LEGEND_LINES = 3

export interface LegendItem {
  /** A subteam's swatch, or a sample of a marking */
  swatch: SubteamInk | null
  sample: SampleKind | null
  label: string
  line: number
  /** Left edge, page points */
  x: number
}

export interface LegendView {
  lines: number
  /** The samples' scale: 1 on paper */
  k: number
  items: LegendItem[]
  definitions: { text: string; line: number } | null
  /** The rule above the legend, and the top of its first line */
  ruleY: number
  top: number
}

export interface LegendInputs {
  plan: Plan
  fonts: LayoutFonts
  measure: Measure
  left: number
  right: number
  entries: Entry[]
  phases: PhaseView[]
  keyDates: KeyDateView[]
  asOfX: number | null
}

/** The markings this document uses (fixed for every page), so the legend lists only those. */
function usedMarkings({ plan, entries, phases, keyDates, asOfX }: LegendInputs): Set<SampleKind> {
  const used = new Set<SampleKind>()
  const bars = new Map<number, TaskView>()
  for (const { view } of entries) {
    if (view.kind !== 'task' || !view.bar) continue
    bars.set(view.row.number, view)
    const flags = view.row.flags
    if (flags.blocked) used.add('blocked')
    else used.add(view.fill === 'hollow' ? 'notStarted' : view.fill === 'solid' ? 'done' : view.fill === 'partial' ? 'partDone' : 'inProgress')
    if (flags.overdue) used.add('overdue')
    if (flags.atRisk) used.add('atRisk')
  }
  if (keyDates.some((keyDate) => keyDate.state !== 'done')) used.add('keyDate')
  if (keyDates.some((keyDate) => keyDate.state === 'done')) used.add('keyDateDone')
  if (phases.length > 0) used.add('phase')
  if (asOfX !== null) used.add('asOf')
  if (plan.links) {
    for (const dependency of plan.dependencies) {
      const from = bars.get(dependency.from)
      const to = bars.get(dependency.to)
      if (from?.bar && to?.bar && !from.bar.cutRight && !to.bar.cutLeft) used.add(dependency.clash ? 'clash' : 'dependency')
    }
  }
  return used
}

const SAMPLE_LABELS: Record<SampleKind, string> = {
  notStarted: 'Not started',
  inProgress: 'In progress',
  done: 'Done',
  partDone: 'Part done',
  blocked: 'Blocked',
  overdue: 'Overdue',
  atRisk: 'At risk',
  keyDate: 'Key date',
  keyDateDone: 'Key date done',
  phase: 'Phase',
  asOf: 'As of',
  dependency: 'Dependency',
  clash: 'Dates clash',
}

/** The legend: KEY, a swatch for each subteam drawn (in board order), then the markings used, flowing onto
 *  up to three lines with the definitions of Overdue and At risk last when they appear. */
export function layLegend(input: LegendInputs): Omit<LegendView, 'ruleY' | 'top'> {
  const { plan, fonts, measure, left, right, entries, phases, keyDates } = input
  const k = fonts.legend.size / 6.5
  const used = usedMarkings(input)
  const rows = entries.map((entry) => entry.view)
  // Colours that something on the chart is drawn in: bars, summary bars and segments, key dates, phases.
  const drawn = new Set<string | null>([
    ...rows.flatMap((view) => {
      if (view.kind === 'task') return view.bar ? [view.row.color] : []
      if (view.kind === 'summary') return view.segments.length ? [view.row.color] : []
      return view.span ? [view.group.color] : []
    }),
    ...keyDates.map((keyDate) => keyDate.color),
    ...phases.map((phase) => phase.color),
  ])
  const groupNames = new Set(rows.filter((view) => !view.group.undated).map((view) => view.group.name))
  const swatches = plan.subteams
    .filter((subteam) => groupNames.has(subteam.name) || drawn.has(subteam.color))
    .map((subteam) => ({ swatch: inkOf(subteam.color), label: cleanText(subteam.name) }))
  if (drawn.has(null)) swatches.push({ swatch: inkOf(null), label: 'Whole team' })
  const asOf = formatDayShort(plan.asOf, true)
  const markings = SAMPLE_KINDS.filter((kind) => used.has(kind)).map((kind) => ({
    sample: kind,
    label: kind === 'asOf' ? `As of ${asOf}` : SAMPLE_LABELS[kind],
  }))

  const overdue =
    used.has('overdue') ||
    plan.counts.overdue > 0 ||
    plan.keyDates.some((keyDate) => keyDate.state === 'overdue') ||
    rows.some((view) => view.kind === 'summary' && view.row.overdue > 0)
  const atRisk =
    used.has('atRisk') ||
    plan.counts.atRisk > 0 ||
    plan.keyDates.some((keyDate) => keyDate.state === 'atRisk') ||
    rows.some((view) => view.kind === 'summary' && view.row.atRisk > 0)
  const definitions = [
    overdue ? `Overdue: due before ${asOf} and not done.` : '',
    atRisk ? 'At risk: waits on work that is blocked, overdue, or due after it starts.' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Every marking drawn is explained, on slides too, so the legend takes a third line when two can't hold it.
  const itemLines = Math.max(1, LEGEND_LINES - (definitions ? 1 : 0))
  const start = left + widthOf('KEY', fonts.heading, measure) + 8 * k
  const gap = 10 * k
  const items: LegendItem[] = []
  let line = 0
  let x = start
  for (const item of [
    ...swatches.map((swatch) => ({ ...swatch, sample: null })),
    ...markings.map((marking) => ({ ...marking, swatch: null })),
  ]) {
    const sample = item.sample ? sampleWidth(item.sample, k) : 12 * k
    let label = item.label
    const width = () => sample + 3 * k + widthOf(label, fonts.legend, measure)
    if (x > start && x + width() > right) {
      line++
      x = start
    }
    if (line >= itemLines) break
    if (x + width() > right) label = fitLine(label, right - x - sample - 3 * k, fonts.legend, measure)
    items.push({ swatch: item.swatch, sample: item.sample, label, line, x })
    x += width() + gap
  }
  const itemCount = items.length ? items[items.length - 1].line + 1 : 0
  const lines = itemCount + (definitions ? 1 : 0)
  return {
    lines,
    k,
    items,
    definitions: definitions ? { text: fitLine(definitions, right - left, fonts.legend, measure), line: itemCount } : null,
  }
}
