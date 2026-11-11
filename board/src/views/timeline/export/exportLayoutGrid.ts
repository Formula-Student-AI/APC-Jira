// The grid of the Timeline export: its columns (the Task column measured from the longest title, the
// others at the sheet's widths, a few allowed to grow to fit their words) and every row fitted to its cells,
// with where its bar lies on the chart, as blocks for the paginator: each group's header (or, in summary
// mode, the subteam row that heads it), then its rows, a parent kept with its first subtask.

import { inkOf, type BarFill } from './exportLayoutMarks'
import {
  dateLines,
  ownerFit,
  runsWidth,
  STATUS_GAP,
  STATUS_ICON,
  titleCell,
  widthOf,
  type CountTone,
  type LayoutFonts,
  type Run,
  type TitleCell,
} from './exportLayoutText'
import type { PaginateBlock } from './exportPaginate'
import { INK, type SubteamInk } from './exportPalette'
import type { Scale } from './exportPeriod'
import type { SheetSpec } from './exportSheets'
import { cleanText, fitLine, formatMonthRange, formatRange } from './exportText'
import type { DateSpan, Plan, PlanGroup, PlanRow, PlanSummaryRow, PlanTaskRow, TaskWord } from './planTypes'
import type { FontSpec, Measure } from './scene'

/** Subtasks and domain rows sit 9 pt in on paper; slides scale it with the type (k). */
export function indentFor(k: number): number {
  return 9 * k
}
/** The colour strip at the left of a group header or subteam row. */
export const STRIP = 3
/** In summary mode, Dates, Done and Issues may grow to fit their words until the grid takes this share of the
 *  width; the chart keeps the rest. */
const GRID_SHARE = 0.52
/** Summary segments closer than this are drawn as one. */
const MERGE_GAP = 4
/** The Done column's bar: 24 × 4 pt beside the count, never narrower than 8. */
export const DONE_BAR = { w: 24, min: 8, gap: 3 }

export type ColumnId = 'number' | 'task' | 'owner' | 'dates' | 'status' | 'lead' | 'done' | 'issues'

export interface Column {
  id: ColumnId
  heading: string
  /** Left edge in page points */
  x: number
  w: number
}

/** A bar's extent in chart points (from the chart's left edge), cut to the chart. */
export interface BarX {
  x0: number
  x1: number
  cutLeft: boolean
  cutRight: boolean
}

export interface HeaderView {
  kind: 'header'
  group: PlanGroup
  name: string
  ink: SubteamInk
  /** The group's summary bar */
  span: BarX | null
}

export interface TaskView {
  kind: 'task'
  group: PlanGroup
  row: PlanTaskRow
  height: number
  stripe: boolean
  titleFont: FontSpec
  title: TitleCell
  /** The Dates cell's lines ([] for none), set in dateFont (red and semibold when overdue) */
  dates: string[]
  dateFont: FontSpec
  owner: string
  bar: BarX | null
  /** Due before the period and still open: no bar, but its slip trail runs in from the chart's left edge */
  slipIn: boolean
  fill: BarFill
  share: number
  ink: SubteamInk
}

export interface SummaryView {
  kind: 'summary'
  group: PlanGroup
  row: PlanSummaryRow
  height: number
  stripe: boolean
  /** The subteam row heading its group: a header block, repeated with '(continued)' on later pages */
  heads: boolean
  name: string
  lead: string
  dates: string
  /** '4/12', 'All done' or '—' */
  done: string
  issues: { text: string; tone: CountTone }[]
  segments: BarX[]
  ink: SubteamInk
}

export type View = HeaderView | TaskView | SummaryView

/** A block for the paginator and what it draws. */
export interface Entry {
  block: PaginateBlock
  view: View
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** Where a bar from `start` to `due` (whole days, inclusive) lies on the chart: null without dates or wholly
 *  outside the period; cut to the chart, and at least `minW` wide. */
export function barX(start: string | null, due: string | null, scale: Scale, chartW: number, minW: number): BarX | null {
  const first = start || due
  const last = due || start
  if (!first || !last || !(scale.ppd > 0)) return null
  let a = scale.x(first)
  let b = scale.x(last) + scale.ppd
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  // Dates given the wrong way round are read the right way round.
  if (b <= a) [a, b] = [scale.x(last), scale.x(first) + scale.ppd]
  if (b <= 0 || a >= chartW) return null
  let x0 = Math.max(0, a)
  let x1 = Math.min(chartW, b)
  if (x1 - x0 < minW) {
    const w = Math.min(minW, chartW)
    x0 = clamp((x0 + x1) / 2 - w / 2, 0, chartW - w)
    x1 = x0 + w
  }
  return { x0, x1, cutLeft: a < 0, cutRight: b > chartW }
}

/** Status words set in red or amber, and semibold. */
export const WARNING_WORDS: ReadonlySet<TaskWord> = new Set<TaskWord>(['Blocked', 'Overdue', 'At risk'])

/** A parent's '3/5' (done of its subtasks), or ''. */
function progressText(row: PlanTaskRow): string {
  const progress = row.progress
  return progress && progress.total > 0 ? `${Math.max(0, progress.done)}/${progress.total}` : ''
}

/** Fill by how far the work has got: solid for Done, part done for a parent with subtasks done, hollow when not
 *  started, a tint once under way. An Overdue or At risk task keeps its stage's fill; its markings add the
 *  warning, so a late task that never began still reads as not started. */
function fillOf(row: PlanTaskRow): { fill: BarFill; share: number } {
  if (row.stage === 'Done') return { fill: 'solid', share: 1 }
  const progress = row.progress
  if (progress && progress.total > 0 && progress.done > 0) return { fill: 'partial', share: Math.min(1, progress.done / progress.total) }
  return row.stage === 'Not started' ? { fill: 'hollow', share: 0 } : { fill: 'tint', share: 0 }
}

/** The Dates column may grow up to this many times the sheet's width to keep every range on one line. */
const DATES_GROWTH = 1.6

function doneText(row: PlanSummaryRow): string {
  if (!(row.total > 0)) return '—'
  return row.done >= row.total ? 'All done' : `${Math.max(0, row.done)}/${row.total}`
}

function issueParts(row: PlanSummaryRow): { text: string; tone: CountTone }[] {
  const parts: { text: string; tone: CountTone }[] = []
  if (row.overdue > 0) parts.push({ text: `${row.overdue} overdue`, tone: 'problem' })
  if (row.blocked > 0) parts.push({ text: `${row.blocked} blocked`, tone: 'problem' })
  if (row.atRisk > 0) parts.push({ text: `${row.atRisk} at risk`, tone: 'risk' })
  return parts.length ? parts : [{ text: '—', tone: 'plain' }]
}

/** The Issues cell as runs: problems in red, risks in amber, joined by muted dots. */
export function issueRuns(parts: { text: string; tone: CountTone }[], fonts: LayoutFonts): Run[] {
  const runs: Run[] = []
  parts.forEach((part, i) => {
    if (i > 0) runs.push({ text: ' · ', font: fonts.cell, color: INK.muted })
    const color = part.tone === 'problem' ? INK.problemText : part.tone === 'risk' ? INK.amberText : INK.muted
    runs.push({ text: part.text, font: part.tone === 'plain' ? fonts.cell : fonts.warning, color })
  })
  return runs
}

export interface ColumnInputs {
  plan: Plan
  groups: PlanGroup[]
  sheet: SheetSpec
  fonts: LayoutFonts
  measure: Measure
  left: number
  contentW: number
  k: number
}

/** The width a row's first cell needs: its title (or name) with any indent, note and suffix, and padding. */
function firstCellNeed(row: PlanRow, input: ColumnInputs): number {
  const { fonts, measure, sheet, k } = input
  const pad = 2 * sheet.pad
  if (row.kind === 'summary') {
    const subteam = row.level === 'subteam'
    return pad + (subteam ? STRIP : indentFor(k)) + widthOf(cleanText(row.name), subteam ? fonts.group : fonts.task, measure)
  }
  const suffix = progressText(row)
  const font = row.nested ? fonts.subtask : suffix ? fonts.parent : fonts.task
  const title = cleanText(row.title)
  const partOf = row.partOf ? cleanText(row.partOf) : ''
  const text = partOf ? `${title} · part of ${partOf}` : title
  const after = suffix ? widthOf(' ', font, measure) + widthOf(suffix, fonts.number, measure) : 0
  return pad + (row.nested ? indentFor(k) : 0) + widthOf(text, font, measure) + after
}

/** The grid's columns, left to right. */
export function layColumns(input: ColumnInputs): Column[] {
  const { plan, groups, sheet, fonts, measure, left, contentW } = input
  const { cols, pad } = sheet
  const shown = plan.columns
  const summary = plan.mode === 'summary'
  const rows = groups.flatMap((group) => group.rows)
  const heading = (text: string) => 2 * pad + widthOf(text, fonts.heading, measure)
  const need = Math.max(heading(summary ? 'WORKSTREAM' : 'TASK'), ...rows.map((row) => firstCellNeed(row, input)))
  // Dates are what stakeholders quote back, so a range stays on one line: the column grows to the widest one
  // (in its own weight: overdue dates are semibold) and the Task column, whose titles wrap anyway, gives up
  // the room, so the chart keeps its width.
  const taskRows = rows.filter((row): row is PlanTaskRow => row.kind === 'task')
  const datesNeed = shown.dates && !summary
    ? 2 * pad + Math.max(0, ...taskRows.map((row) => widthOf(formatRange(row.start, row.due, plan.period), row.flags.overdue ? fonts.warning : fonts.cell, measure)))
    : 0
  const datesW = clamp(datesNeed, cols.dates, cols.dates * DATES_GROWTH)
  const taskMax = Math.max(cols.taskMin, cols.taskMax - (datesW - cols.dates))
  // Summary names are short, so the Workstream column may be narrower than a Task column ever is.
  const task = clamp(need, summary ? cols.taskMin * 0.6 : cols.taskMin, summary ? cols.taskMax : taskMax)
  const list: { id: ColumnId; heading: string; w: number }[] = []
  if (!summary) {
    // The status word is the cell's whole point, so the column is never too narrow for the longest one used.
    const words = rows.flatMap((row) => (row.kind === 'task' ? [row.word] : []))
    const wordW = Math.max(0, ...words.map((word) => widthOf(word, WARNING_WORDS.has(word) ? fonts.warning : fonts.cell, measure)))
    const statusNeed = 2 * pad + STATUS_ICON * fonts.cell.size + STATUS_GAP * input.k + wordW
    // Nor is the # column too narrow for the longest item number, once the board reaches #1000.
    const numbers = rows.flatMap((row) => (row.kind === 'task' && row.number > 0 ? [`#${row.number}`] : []))
    const numberNeed = 2 * pad + Math.max(0, ...numbers.map((text) => widthOf(text, fonts.number, measure)))
    if (shown.number) list.push({ id: 'number', heading: '#', w: clamp(numberNeed, cols.number, cols.number * 1.5) })
    list.push({ id: 'task', heading: 'TASK', w: task })
    if (shown.owner) list.push({ id: 'owner', heading: 'OWNER', w: cols.owner })
    if (shown.dates) list.push({ id: 'dates', heading: 'DATES', w: datesW })
    if (shown.status) list.push({ id: 'status', heading: 'STATUS', w: clamp(statusNeed, cols.status, cols.status * 1.25) })
  } else {
    const summaries = rows.filter((row): row is PlanSummaryRow => row.kind === 'summary')
    const most = (widths: number[]) => Math.max(0, ...widths)
    const datesNeed = 2 * pad + most(summaries.map((row) => widthOf(formatMonthRange(row.first, row.last, plan.period), fonts.cell, measure)))
    const doneNeed =
      2 * pad +
      most(
        summaries.map((row) => {
          const text = doneText(row)
          return text.includes('/') ? widthOf(text, fonts.number, measure) + DONE_BAR.gap + DONE_BAR.w : widthOf(text, fonts.cell, measure)
        }),
      )
    const issuesNeed = 2 * pad + most(summaries.map((row) => runsWidth(issueRuns(issueParts(row), fonts), measure)))
    const wanted: Partial<Record<ColumnId, number>> = {
      dates: clamp(datesNeed, cols.dates, cols.dates * 1.5),
      done: clamp(doneNeed, cols.summaryDone, cols.summaryDone * 1.5),
      issues: clamp(issuesNeed, cols.summaryIssues, cols.summaryIssues * 2),
    }
    list.push({ id: 'task', heading: 'WORKSTREAM', w: task })
    if (shown.owner) list.push({ id: 'lead', heading: 'LEAD', w: cols.owner })
    if (shown.dates) list.push({ id: 'dates', heading: 'DATES', w: cols.dates })
    if (shown.status) {
      list.push({ id: 'done', heading: 'DONE', w: cols.summaryDone })
      list.push({ id: 'issues', heading: 'ISSUES', w: cols.summaryIssues })
    }
    let spare = contentW * GRID_SHARE - list.reduce((sum, column) => sum + column.w, 0)
    for (const id of ['dates', 'issues', 'done'] as const) {
      const column = list.find((item) => item.id === id)
      const want = wanted[id]
      if (!column || want === undefined || spare <= 0) continue
      const extra = Math.min(Math.max(0, want - column.w), spare)
      column.w += extra
      spare -= extra
    }
  }
  let x = left
  return list.map((column) => {
    const placed = { ...column, x }
    x += column.w
    return placed
  })
}

export interface RowInputs {
  plan: Plan
  sheet: SheetSpec
  fonts: LayoutFonts
  measure: Measure
  columns: Column[]
  scale: Scale
  chartW: number
  k: number
}

export const columnOf = (columns: Column[], id: ColumnId) => columns.find((column) => column.id === id) ?? null

/** A column's room for text, inside its padding. */
export const roomIn = (column: Column | null, pad: number) => (column ? Math.max(0, column.w - 2 * pad) : 0)

function taskView(row: PlanTaskRow, group: PlanGroup, stripe: boolean, input: RowInputs): TaskView {
  const { plan, sheet, fonts, measure, columns, k } = input
  const suffix = progressText(row)
  const titleFont = row.nested ? fonts.subtask : suffix ? fonts.parent : fonts.task
  const indent = row.nested ? indentFor(k) : 0
  const partOf = row.partOf ? cleanText(row.partOf) : null
  const title = titleCell(cleanText(row.title), partOf, suffix, roomIn(columnOf(columns, 'task'), sheet.pad) - indent, titleFont, fonts.number, 2, measure)
  const datesColumn = columnOf(columns, 'dates')
  const dateFont = row.flags.overdue ? fonts.warning : fonts.cell
  const range = datesColumn ? formatRange(row.start, row.due, plan.period) : ''
  const dates = range ? dateLines(range, roomIn(datesColumn, sheet.pad), dateFont, measure) : []
  const ownerColumn = columnOf(columns, 'owner')
  const owner = ownerColumn ? ownerFit(cleanText(row.owner), roomIn(ownerColumn, sheet.pad), fonts.cell, measure) : ''
  const wrapped = title.lines.length > 1 || dates.length > 1
  const height = (row.nested ? sheet.rows.subtask : sheet.rows.task) + (wrapped ? sheet.rows.taskWrapped - sheet.rows.task : 0)
  const bar = group.undated ? null : barX(row.start, row.due, input.scale, input.chartW, sheet.bar.minWidth)
  // An overdue task is a row while its slip reaches the period (buildPlan), so one with no bar ended before it.
  const last = row.due ?? row.start
  const slipIn = !group.undated && bar === null && row.flags.overdue && last !== null && input.scale.x(last) + input.scale.ppd <= 0
  return { kind: 'task', group, row, height, stripe, titleFont, title, dates, dateFont, owner, bar, slipIn, ...fillOf(row), ink: inkOf(row.color) }
}

/** A summary row's merged bars on the chart: spans cut to the period, and any closer than 4 pt drawn as one. */
function segmentsFor(spans: readonly DateSpan[], input: RowInputs): BarX[] {
  const bars = spans
    .map((span) => barX(span.start, span.end, input.scale, input.chartW, input.sheet.bar.minWidth))
    .filter((bar): bar is BarX => bar !== null)
    .sort((a, b) => a.x0 - b.x0)
  const merged: BarX[] = []
  for (const bar of bars) {
    const last = merged[merged.length - 1]
    if (!last || bar.x0 - last.x1 >= MERGE_GAP) merged.push({ ...bar })
    else if (bar.x1 > last.x1) {
      last.x1 = bar.x1
      last.cutRight = bar.cutRight
    } else if (bar.x1 === last.x1) last.cutRight ||= bar.cutRight
  }
  return merged
}

function summaryView(row: PlanSummaryRow, group: PlanGroup, heads: boolean, stripe: boolean, input: RowInputs): SummaryView {
  const { plan, sheet, fonts, measure, columns } = input
  const leadColumn = columnOf(columns, 'lead')
  const lead = leadColumn && row.level === 'subteam' ? ownerFit(cleanText(row.lead), roomIn(leadColumn, sheet.pad), fonts.cell, measure) : ''
  const datesColumn = columnOf(columns, 'dates')
  const dates = datesColumn ? fitLine(formatMonthRange(row.first, row.last, plan.period), roomIn(datesColumn, sheet.pad), fonts.cell, measure) : ''
  const height = row.level === 'subteam' ? sheet.rows.summarySubteam : sheet.rows.summaryDomain
  return {
    kind: 'summary',
    group,
    row,
    height,
    stripe,
    heads,
    name: cleanText(row.name),
    lead,
    dates,
    done: doneText(row),
    issues: issueParts(row),
    segments: segmentsFor(row.spans, input),
    ink: inkOf(row.color),
  }
}

/** Every row as a block for the paginator: each group's header (or the subteam row that heads it in summary
 *  mode) and its rows, a parent kept with its first subtask. */
export function layEntries(groups: PlanGroup[], input: RowInputs): { entries: Entry[]; continuedHeight: number } {
  const { sheet, scale, chartW } = input
  const rows = sheet.rows
  const entries: Entry[] = []
  let continuedHeight = rows.group
  groups.forEach((group, index) => {
    // Group keys could repeat; the paginator tells groups apart by this.
    const key = `${index}:${group.key}`
    const first = group.rows[0]
    const heads = first.kind === 'summary' && first.level === 'subteam'
    if (heads) continuedHeight = Math.max(continuedHeight, rows.summarySubteam)
    else {
      const span = group.undated || !group.span ? null : barX(group.span.start, group.span.end, scale, chartW, 0)
      entries.push({
        block: { kind: 'header', height: rows.group, gapBefore: rows.groupGap, group: key },
        view: { kind: 'header', group, name: cleanText(group.name), ink: inkOf(group.color), span },
      })
    }
    // Stripes restart in each group, on every other row.
    let striped = 0
    group.rows.forEach((row, r) => {
      if (row.kind === 'task') {
        const view = taskView(row, group, striped % 2 === 1, input)
        const next = group.rows[r + 1]
        const block: PaginateBlock = { kind: 'row', height: view.height, gapBefore: 0, group: key }
        if (!row.nested && next?.kind === 'task' && next.nested) block.keepWithNext = true
        entries.push({ block, view })
        striped++
        return
      }
      const headsHere = heads && r === 0
      const view = summaryView(row, group, headsHere, !headsHere && striped % 2 === 1, input)
      entries.push({
        block: headsHere
          ? { kind: 'header', height: view.height, gapBefore: rows.groupGap, group: key }
          : { kind: 'row', height: view.height, gapBefore: 0, group: key },
        view,
      })
      if (!headsHere) striped++
    })
  })
  return { entries, continuedHeight }
}
