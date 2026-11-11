// Draws one page of the Timeline export from the document's frame and the rows the paginator gave the page.
// Shapes go in reading order (title block, note, column headings and timescale, lanes, row backgrounds and
// gridlines, dependency lines, each row's cells left to right and then its bar, the lines in front of the
// rows, legend, footer), so the PDF's text reads in order and a screen reader gets the page's label.

import { keyDateLabelGeometry } from './exportLanes'
import { tasksText, type Frame } from './exportLayoutFrame'
import { DONE_BAR, indentFor, issueRuns, STRIP, WARNING_WORDS, type Entry, type HeaderView, type SummaryView, type TaskView } from './exportLayoutGrid'
import { ARROW, PHASE_PAD } from './exportLayoutLanes'
import {
  barPrims,
  diamondPrims,
  linkPrims,
  phasePrims,
  RING,
  samplePrims,
  sampleWidth,
  segmentPrims,
  slipInPrims,
  summaryBarPrims,
} from './exportLayoutMarks'
import {
  baselineAt,
  countParts,
  fits,
  lineHeight,
  middleOf,
  runPrims,
  runsWidth,
  STATUS_GAP,
  STATUS_ICON,
  textPrim,
  widthOf,
  type Run,
} from './exportLayoutText'
import type { PageSlice } from './exportPaginate'
import { INK, NEUTRAL } from './exportPalette'
import { arrowHeadPath, hookPath, statusIconPrims } from './exportShapes'
import { cleanText, fitLine, formatStamp, isolateOwner, listText, wrapLines } from './exportText'
import type { Plan, PlanGroup } from './planTypes'
import type { FontSpec, Hex, LinePrim, Page, Prim, Stroke } from './scene'

const GRID: Record<'year' | 'month' | 'week', Stroke> = {
  year: { color: NEUTRAL.year, width: 0.75 },
  month: { color: NEUTRAL.month, width: 0.5 },
  week: { color: NEUTRAL.week, width: 0.25 },
}

const line = (x1: number, y1: number, x2: number, y2: number, stroke: Stroke, opacity?: number): LinePrim => ({
  kind: 'line',
  x1,
  y1,
  x2,
  y2,
  stroke,
  ...(opacity === undefined ? {} : { opacity }),
})

const rect = (x: number, y: number, w: number, h: number, fill: Hex): Prim => ({ kind: 'rect', x, y, w, h, fill })

/** Subtle grey is kept for text of 7 pt and up; smaller text is muted, for contrast. */
const quiet = (font: FontSpec): Hex => (font.size >= 7 ? INK.subtle : INK.muted)

/** The page's regions, top to bottom: page 1 moves everything below its note down by the note's height. */
interface Regions {
  scaleTop: number
  lowerTop: number
  scaleBottom: number
  phasesTop: number
  keysTop: number
  lanesBottom: number
  bodyTop: number
  /** Where this page's rows end (the lanes' bottom on a page without rows) */
  bodyEnd: number
}

function regions(frame: Frame, slice: PageSlice, index: number): Regions {
  const dy = index === 0 ? frame.noteExtra : 0
  const scaleTop = frame.scaleTop + dy
  const bodyTop = frame.bodyTop + dy
  const lanesBottom = frame.lanesBottom + dy
  const rows = slice.blocks.length > 0 || slice.continued !== null
  return {
    scaleTop,
    lowerTop: scaleTop + frame.sheet.scaleHeight / 2,
    scaleBottom: scaleTop + frame.sheet.scaleHeight,
    phasesTop: frame.phasesTop + dy,
    keysTop: frame.keysTop + dy,
    lanesBottom,
    bodyTop,
    bodyEnd: rows ? bodyTop + slice.height : lanesBottom,
  }
}

/** A block on this page with its top in page points. */
interface Placed {
  entry: Entry
  top: number
}

function drawTitleBlock(prims: Prim[], frame: Frame): void {
  const { titleBlock, fonts, left, right, top, sheet, measure } = frame
  prims.push({ kind: 'image', x: left, y: top, w: sheet.titleBlock.logoWidth, h: sheet.titleBlock.logoHeight, asset: 'logo' })
  const { eyebrow, title, subtitle, textX } = titleBlock
  if (eyebrow.text) prims.push(textPrim(eyebrow.text, textX, top + eyebrow.y, fonts.eyebrow, INK.muted))
  if (title.text) prims.push(textPrim(title.text, textX, top + title.y, fonts.title, INK.navy))
  if (subtitle.text) prims.push(textPrim(subtitle.text, textX, top + subtitle.y, fonts.subtitle, INK.muted))
  for (const row of titleBlock.right) prims.push(...runPrims(row.runs, right, top + row.y, measure, 'end'))
  prims.push(line(left, frame.ruleY, right, frame.ruleY, { color: INK.brand, width: 1.5 }))
}

function drawNote(prims: Prim[], frame: Frame): void {
  const { note, fonts, left } = frame
  if (!note) return
  const step = lineHeight(fonts.subtitle)
  note.lines.forEach((text, i) => {
    const y = baselineAt(note.top + 0.5 + (i + 0.5) * step, fonts.subtitle)
    if (i === 0) prims.push(textPrim('Note:', left, y, fonts.noteLabel, INK.text))
    if (text) prims.push(textPrim(text, left + note.labelW, y, fonts.subtitle, INK.text))
  })
}

/** The column headings, bottom-aligned with the lower tier's labels, and the two-tier timescale with its
 *  elapsed-time shading and the as-of pill. */
function drawScale(prims: Prim[], frame: Frame, r: Regions): void {
  const { chartX, gridRight, scale, sheet, fonts, measure, columns, left, right, pill, scaleFonts } = frame
  const tier = sheet.scaleHeight / 2
  // Elapsed time is shaded from the divider, its gutter included, to the as-of line.
  if (frame.elapsedTo > 0) prims.push(rect(gridRight, r.scaleTop, chartX + frame.elapsedTo - gridRight, sheet.scaleHeight, NEUTRAL.elapsed))
  // Year lines cross both tiers, and so do month lines when months are the upper tier.
  const monthsAbove = scale.tiers !== 'years-months'
  for (const gridline of scale.lines) {
    const from = gridline.kind === 'year' || (gridline.kind === 'month' && monthsAbove) ? r.scaleTop : r.lowerTop
    prims.push(line(chartX + gridline.x, from, chartX + gridline.x, r.scaleBottom, GRID[gridline.kind]))
  }
  const lowerY = baselineAt(r.lowerTop + tier / 2, scaleFonts.lower)
  for (const column of columns) {
    const text = fitLine(column.heading, column.w - 2 * sheet.pad, fonts.heading, measure)
    if (!text) continue
    // Item numbers are right-aligned so their digits line up, and so is their heading.
    if (column.id === 'number') prims.push(textPrim(text, column.x + column.w - sheet.pad, lowerY, fonts.heading, INK.muted, 'end'))
    else prims.push(textPrim(text, column.x + sheet.pad, lowerY, fonts.heading, INK.muted))
  }
  const upperY = baselineAt(r.scaleTop + tier / 2, scaleFonts.upper)
  for (const label of frame.upper) prims.push(textPrim(label.text, chartX + label.x, upperY, scaleFonts.upper, INK.text, label.anchor))
  if (pill) {
    const h = tier - 4
    prims.push({ kind: 'rect', x: chartX + pill.x, y: r.scaleTop + 2, w: pill.w, h, radius: h / 2, fill: INK.brand })
    prims.push(textPrim(pill.text, chartX + pill.x + pill.w / 2, baselineAt(r.scaleTop + tier / 2, fonts.pill), fonts.pill, INK.white, 'middle'))
  }
  for (const label of frame.lower) prims.push(textPrim(label.text, chartX + label.x, lowerY, scaleFonts.lower, INK.muted, label.anchor))
  prims.push(line(left, r.scaleBottom, right, r.scaleBottom, { color: NEUTRAL.year, width: 0.75 }))
}

/** How far the as-of line keeps clear of the lanes' words, and the shortest piece of it worth drawing there */
const AS_OF_CLEAR = 1.5
const AS_OF_MIN = 3

/**
 * What is left of the stretch from `top` to `bottom` once the `gaps` ([top, bottom] each) are taken out,
 * leaving out pieces shorter than AS_OF_MIN, which would read as specks rather than a line.
 */
export function stretchesAround(top: number, bottom: number, gaps: [number, number][]): [number, number][] {
  const parts: [number, number][] = []
  let from = top
  for (const [y0, y1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (from >= bottom) break
    if (y0 > from) parts.push([from, Math.min(y0, bottom)])
    from = Math.max(from, y1)
  }
  if (from < bottom) parts.push([from, bottom])
  return parts.filter(([y0, y1]) => y1 - y0 >= AS_OF_MIN)
}

/** The phases and key-dates lanes, the same on every page. */
function drawLanes(prims: Prim[], frame: Frame, r: Regions): void {
  if (r.lanesBottom <= r.phasesTop) return
  const { chartX, chartW, scale, sheet, fonts, measure, left } = frame
  for (const gridline of scale.lines) {
    prims.push(line(chartX + gridline.x, r.scaleBottom, chartX + gridline.x, r.lanesBottom, GRID[gridline.kind]))
  }
  // Each tier holds its segments 1 pt in from its edges.
  const tierH = sheet.lanes.phaseTier
  const segmentH = tierH - 2
  const segmentTop = (tier: number) => r.phasesTop + 1 + tier * tierH + 1
  if (frame.phaseTiers > 0) {
    prims.push(textPrim('PHASES', left + sheet.pad, baselineAt(segmentTop(0) + segmentH / 2, fonts.phase), fonts.heading, INK.muted))
    for (const phase of frame.phases) {
      // Phases that follow one another are parted by a hairline of white.
      const inset = phase.x1 - phase.x0 > 2 ? 0.5 : 0
      prims.push(...phasePrims(chartX + phase.x0 + inset, chartX + phase.x1 - inset, segmentTop(phase.tier), segmentH, phase.ink, phase.now))
    }
  }
  const names = frame.phases.flatMap((phase) => {
    if (!phase.name) return []
    const font = phase.now ? fonts.phaseNow : fonts.phase
    const x = chartX + phase.x0 + PHASE_PAD
    return [{ phase, font, x, end: x + widthOf(phase.name, font, measure) }]
  })
  const lineH = sheet.lanes.keyDateLine
  const lineTop = (l: number) => r.keysTop + 1.5 + l * lineH
  const middle = (l: number) => lineTop(l) + lineH / 2
  // The as-of line runs through the lanes behind their words, and stops short of any name or label in its
  // way: glyphs are too thin to hide a line behind them, and a struck-through name is hard to read.
  if (frame.asOfX !== null) {
    const x = chartX + frame.asOfX
    const words: { x0: number; x1: number; y0: number; y1: number }[] = [
      ...names.map(({ phase, x: x0, end }) => ({ x0, x1: end, y0: segmentTop(phase.tier) - 1, y1: segmentTop(phase.tier) + segmentH + 1 })),
      ...frame.keyDates.flatMap(({ label }) => {
        if (!label.width || frame.keyLines === 0) return []
        const x0 = chartX + (label.anchor === 'start' ? label.x : label.x - label.width)
        return [{ x0, x1: x0 + label.width, y0: lineTop(label.line), y1: lineTop(label.line) + lineH }]
      }),
      ...(frame.after && frame.keyLines > 0
        ? [{ x0: chartX + frame.after.x, x1: chartX + chartW, y0: lineTop(frame.after.line), y1: lineTop(frame.after.line) + lineH }]
        : []),
    ]
    const gaps = words.filter((word) => word.x0 - AS_OF_CLEAR < x && x < word.x1 + AS_OF_CLEAR).map((word): [number, number] => [word.y0, word.y1])
    for (const [y0, y1] of stretchesAround(r.scaleBottom, r.lanesBottom, gaps)) prims.push(line(x, y0, x, y1, { color: INK.brand, width: 0.75 }))
  }
  for (const { phase, font, x, end } of names) {
    const color = phase.color === null ? INK.navy : INK.text
    // A name that runs on past its segment has white behind the part outside it, so the segment's edge (the
    // current phase's outline) never cuts through a letter; the segment itself still shows the real dates.
    const edge = chartX + phase.x1
    if (end > edge) prims.push({ kind: 'rect', x: edge - 0.5, y: segmentTop(phase.tier), w: end - edge + 1.5, h: segmentH, fill: INK.white })
    prims.push(textPrim(phase.name, x, baselineAt(segmentTop(phase.tier) + segmentH / 2, font), font, color))
  }
  if (frame.keyLines > 0) {
    const { half } = keyDateLabelGeometry(fonts.laneName)
    prims.push(textPrim('KEY DATES', left + sheet.pad, baselineAt(middle(0), fonts.laneName), fonts.heading, INK.muted))
    for (const keyDate of frame.keyDates) {
      const { label } = keyDate
      const cy = middle(label.line)
      prims.push(...diamondPrims(chartX + keyDate.x, cy, half, keyDate.state, keyDate.ink))
      if (!label.width) continue
      const runs: Run[] = []
      if (label.name) runs.push({ text: label.name, font: fonts.laneName, color: INK.text })
      if (keyDate.date) runs.push({ text: `${label.name ? ' ' : ''}${keyDate.date}`, font: fonts.laneDate, color: INK.muted })
      if (keyDate.words) {
        runs.push({ text: keyDate.words, font: fonts.laneDate, color: keyDate.state === 'overdue' ? INK.problemText : INK.amberText })
      }
      prims.push(...runPrims(runs, chartX + label.x, baselineAt(cy, fonts.laneName), measure, label.anchor))
    }
    const after = frame.after
    if (after) {
      const k = fonts.laneName.size / 7
      const y = baselineAt(middle(after.line), fonts.laneName)
      const mid = middleOf(y, fonts.laneName)
      const x = chartX + after.x
      const tip = x + ARROW.w * k
      prims.push(line(x, mid, tip - 2.5 * k, mid, { color: INK.muted, width: 0.75 }))
      prims.push({ kind: 'path', d: arrowHeadPath(tip, mid, 2.5 * k), fill: INK.muted })
      const runs: Run[] = []
      if (after.name) runs.push({ text: after.name, font: fonts.laneName, color: INK.text })
      runs.push({ text: `${after.name ? ' ' : ''}${after.date}`, font: fonts.laneDate, color: INK.muted })
      prims.push(...runPrims(runs, x + (ARROW.w + ARROW.gap) * k, y, measure))
    }
  }
}

/** The bands behind group headers and subteam rows, and the stripes behind every other row. */
function drawBackgrounds(prims: Prim[], frame: Frame, placed: Placed[], continued: Entry | null, bodyTop: number): void {
  const { left, right } = frame
  if (continued) prims.push(rect(left, bodyTop, right - left, frame.continuedHeight, NEUTRAL.groupBand))
  for (const { entry, top } of placed) {
    const view = entry.view
    const band = view.kind === 'header' || (view.kind === 'summary' && view.row.level === 'subteam')
    if (band) prims.push(rect(left, top, right - left, entry.block.height, NEUTRAL.groupBand))
    else if (view.stripe) prims.push(rect(left, top, right - left, entry.block.height, NEUTRAL.zebra))
  }
}

/** Dependency lines between rows on this page, under the bars. */
function drawLinks(prims: Prim[], frame: Frame, placed: Placed[]): void {
  if (!frame.plan.links) return
  const { chartX, gridRight, right, sheet } = frame
  const rows = new Map<number, { view: TaskView; cy: number }>()
  for (const { entry, top } of placed) {
    if (entry.view.kind === 'task' && entry.view.bar) rows.set(entry.view.row.number, { view: entry.view, cy: top + entry.view.height / 2 })
  }
  const k = sheet.rows.task / 15
  for (const dependency of frame.plan.dependencies) {
    const from = rows.get(dependency.from)
    const to = rows.get(dependency.to)
    const fromBar = from?.view.bar
    const toBar = to?.view.bar
    // A bar the period cuts off has its end off the chart, where no line can reach it.
    if (!from || !to || !fromBar || !toBar || fromBar.cutRight || toBar.cutLeft || from === to) continue
    const x1 = chartX + fromBar.x1
    const x2 = chartX + toBar.x0
    prims.push(...linkPrims(x1, from.cy, x2, to.cy, from.view.height, k, gridRight + 1, right - 1, dependency.clash))
  }
}

/** '12 tasks · 4 done · 1 overdue' for a group (its rows when the counts leave them out). */
function groupCounts(group: PlanGroup): string {
  const rows = group.rows.filter((row) => row.kind !== 'task' || !row.nested).length
  const tasks = group.counts.tasks > 0 ? group.counts.tasks : rows
  return countParts({ ...group.counts, tasks })
    .map((part) => part.text)
    .join(' · ')
}

/** A group's name, with '(continued)' on pages it runs on to, fitted to `room`. */
function nameFitted(name: string, continued: boolean, room: number, font: FontSpec, frame: Frame): string {
  const suffix = continued ? ' (continued)' : ''
  const fitted = fitLine(name, room - widthOf(suffix, font, frame.measure), font, frame.measure)
  return continued ? `${fitted}${suffix}`.trim() : fitted
}

/** A group header: the colour strip, the name, 'Lead: …' and the counts; the summary bar, or 'No dates yet'
 *  for tasks without dates. */
function drawHeader(prims: Prim[], frame: Frame, view: HeaderView, top: number, height: number, continued: boolean): void {
  const { left, fonts, sheet, measure, chartX, chartW, k } = frame
  const pad = sheet.pad
  prims.push(rect(left, top, STRIP, height, view.ink.solid))
  const y = baselineAt(top + height / 2, fonts.group)
  const nameX = left + STRIP + pad
  const name = nameFitted(view.name, continued, chartX - pad - nameX, fonts.group, frame)
  if (name) prims.push(textPrim(name, nameX, y, fonts.group, INK.navy))
  const detailsX = nameX + widthOf(name, fonts.group, measure) + 6 * k
  const room = chartX - pad - detailsX
  const counts = groupCounts(view.group)
  // The lead's name is set apart, so a right-to-left one doesn't pull the counts after it to its far side.
  const lead = isolateOwner(cleanText(view.group.lead))
  const details = [lead ? `Lead: ${lead} · ${counts}` : '', counts].find((text) => text && fits(text, room, fonts.groupDetail, measure))
  const shown = details ?? fitLine(counts, room, fonts.groupDetail, measure)
  if (shown) prims.push(textPrim(shown, detailsX, y, fonts.groupDetail, INK.muted))
  if (view.group.undated) {
    const text = fitLine('No dates yet', chartW, fonts.groupDetail, measure)
    if (text) prims.push(textPrim(text, chartX, y, fonts.groupDetail, INK.muted))
  } else if (view.span) {
    const span = view.span
    prims.push(...summaryBarPrims(chartX + span.x0, chartX + span.x1, top + height / 2, span.cutLeft, span.cutRight, view.ink, k))
  }
}

/** A task row: #, the title (wrapped, with a parent's '3/5' or a '· part of' note), owner, dates and status,
 *  then its bar with every marking. Single-line cells share the first line's baseline. */
function drawTask(prims: Prim[], frame: Frame, view: TaskView, top: number): void {
  const { sheet, fonts, measure, columns, chartX, k } = frame
  const pad = sheet.pad
  const { row, height } = view
  const step = lineHeight(view.titleFont)
  const lines = Math.max(view.title.lines.length, view.dates.length, 1)
  const firstMiddle = top + (height - lines * step) / 2 + step / 2
  const y = baselineAt(firstMiddle, view.titleFont)
  for (const column of columns) {
    const x = column.x + pad
    switch (column.id) {
      case 'number':
        if (row.number > 0) prims.push(textPrim(`#${row.number}`, column.x + column.w - pad, y, fonts.number, quiet(fonts.number), 'end'))
        break
      case 'task': {
        const indent = row.nested ? indentFor(k) : 0
        if (row.nested) {
          const size = 5 * k
          const foot = middleOf(y, view.titleFont)
          prims.push({ kind: 'path', d: hookPath(x + k, foot - size * 0.75, size), stroke: { color: INK.muted, width: 0.6 } })
        }
        view.title.lines.forEach((cellLine, i) => {
          const runs: Run[] = cellLine.map((run) => ({ text: run.text, font: view.titleFont, color: run.muted ? INK.muted : INK.text }))
          const lineY = y + i * step
          prims.push(...runPrims(runs, x + indent, lineY, measure))
          if (i === view.title.lines.length - 1 && view.title.suffix) {
            const after = x + indent + runsWidth(runs, measure) + (runs.length ? widthOf(' ', view.titleFont, measure) : 0)
            prims.push(textPrim(view.title.suffix, after, lineY, fonts.number, INK.muted))
          }
        })
        break
      }
      case 'owner':
        if (view.owner) prims.push(textPrim(view.owner, x, y, fonts.cell, INK.text))
        else prims.push(textPrim('—', x, y, fonts.cell, INK.muted))
        break
      case 'dates':
        if (view.dates.length === 0) prims.push(textPrim('—', x, y, fonts.cell, INK.muted))
        view.dates.forEach((text, i) => {
          if (text) prims.push(textPrim(text, x, y + i * step, view.dateFont, row.flags.overdue ? INK.problemText : INK.text))
        })
        break
      case 'status': {
        const size = STATUS_ICON * fonts.cell.size
        prims.push(...statusIconPrims(row.word, x + size / 2, middleOf(y, fonts.cell), size))
        const warning = WARNING_WORDS.has(row.word)
        const font = warning ? fonts.warning : fonts.cell
        const color = row.word === 'At risk' ? INK.amberText : warning ? INK.problemText : INK.text
        const wordX = x + size + STATUS_GAP * k
        const text = fitLine(row.word, column.x + column.w - pad - wordX, font, measure)
        if (text) prims.push(textPrim(text, wordX, y, font, color))
        break
      }
      default:
        break
    }
  }
  const bar = view.bar
  const barH = row.nested ? sheet.bar.subtaskHeight : sheet.bar.height
  if (!bar) {
    // Due before the period and still open: its slip comes in from the left edge to the as-of line.
    if (view.slipIn && frame.trailTo !== null) prims.push(...slipInPrims(chartX, top + height / 2, chartX + frame.trailTo, barH / 8))
    return
  }
  prims.push(
    ...barPrims({
      x: chartX + bar.x0,
      y: top + (height - barH) / 2,
      w: bar.x1 - bar.x0,
      h: barH,
      radius: (sheet.bar.radius * barH) / sheet.bar.height,
      cutLeft: bar.cutLeft,
      cutRight: bar.cutRight,
      ink: view.ink,
      fill: view.fill,
      share: view.share,
      blocked: row.flags.blocked,
      overdue: row.flags.overdue,
      trailTo: frame.trailTo === null ? null : chartX + frame.trailTo,
      atRisk: row.flags.atRisk,
      minX: frame.gridRight + 1,
    }),
  )
}

/** A summary row: a subteam (strip, name, leads) or one of its domains, with its dates, done count and
 *  issues, then its merged segments. */
function drawSummary(prims: Prim[], frame: Frame, view: SummaryView, top: number, height: number, continued: boolean): void {
  const { sheet, fonts, measure, columns, chartX, left, k } = frame
  const pad = sheet.pad
  const subteam = view.row.level === 'subteam'
  const nameFont = subteam ? fonts.group : fonts.task
  const y = baselineAt(top + height / 2, nameFont)
  if (subteam) prims.push(rect(left, top, STRIP, height, view.ink.solid))
  for (const column of columns) {
    const x = column.x + pad
    const room = column.w - 2 * pad
    switch (column.id) {
      case 'task': {
        const indent = subteam ? STRIP : indentFor(k)
        const name = nameFitted(view.name, continued, room - indent, nameFont, frame)
        if (name) prims.push(textPrim(name, x + indent, y, nameFont, subteam ? INK.navy : INK.text))
        break
      }
      case 'lead':
        if (subteam) prims.push(view.lead ? textPrim(view.lead, x, y, fonts.cell, INK.text) : textPrim('—', x, y, fonts.cell, INK.muted))
        break
      case 'dates':
        if (view.dates) prims.push(textPrim(view.dates, x, y, fonts.cell, INK.text))
        break
      case 'done': {
        if (!view.done.includes('/')) {
          prims.push(textPrim(view.done, x, y, fonts.cell, view.done === '—' ? INK.muted : INK.text))
          break
        }
        const barW = frame.doneBar
        const barX = column.x + column.w - pad - barW
        prims.push(textPrim(view.done, barW > 0 ? barX - DONE_BAR.gap : column.x + column.w - pad, y, fonts.number, INK.text, 'end'))
        if (barW > 0) {
          const mid = middleOf(y, fonts.cell)
          const share = view.row.total > 0 ? Math.min(1, Math.max(0, view.row.done / view.row.total)) : 0
          prims.push({ kind: 'rect', x: barX, y: mid - 2, w: barW, h: 4, fill: view.ink.tint })
          if (share > 0) prims.push({ kind: 'rect', x: barX, y: mid - 2, w: barW * share, h: 4, fill: view.ink.solid })
          prims.push({ kind: 'rect', x: barX, y: mid - 2, w: barW, h: 4, stroke: { color: view.ink.ink, width: 0.5 } })
        }
        break
      }
      case 'issues': {
        const runs = issueRuns(view.issues, fonts)
        if (runsWidth(runs, measure) <= room + 1e-9) prims.push(...runPrims(runs, x, y, measure))
        else {
          // Too many kinds of issue for the cell: one colour, cut with '…'.
          const problem = view.issues.some((part) => part.tone === 'problem')
          const text = fitLine(runs.map((run) => run.text).join(''), room, fonts.warning, measure)
          if (text) prims.push(textPrim(text, x, y, fonts.warning, problem ? INK.problemText : INK.amberText))
        }
        break
      }
      default:
        break
    }
  }
  if (view.segments.length === 0) return
  const barH = sheet.bar.height
  const segments = view.segments.map((segment) => ({ ...segment, x0: chartX + segment.x0, x1: chartX + segment.x1 }))
  prims.push(...segmentPrims(segments, top + (height - barH) / 2, barH, sheet.bar.radius, view.ink))
}

function drawRows(prims: Prim[], frame: Frame, placed: Placed[], continued: Entry | null, bodyTop: number): void {
  if (continued) {
    const view = continued.view
    if (view.kind === 'header') drawHeader(prims, frame, view, bodyTop, frame.continuedHeight, true)
    else if (view.kind === 'summary') drawSummary(prims, frame, view, bodyTop, frame.continuedHeight, true)
  }
  for (const { entry, top } of placed) {
    const view = entry.view
    if (view.kind === 'header') drawHeader(prims, frame, view, top, entry.block.height, false)
    else if (view.kind === 'task') drawTask(prims, frame, view, top)
    else drawSummary(prims, frame, view, top, entry.block.height, false)
  }
}

/** Why there is nothing to export, and how to fix it. */
function emptyReason(plan: Plan): string {
  if (plan.leftOut.outsidePeriod > 0) {
    return 'The Timeline’s tasks all fall outside this period. Choose a longer period, or the whole plan.'
  }
  if (plan.leftOut.undated > 0) {
    const listing = plan.format === 'pdf' && plan.mode === 'tasks' ? ', or list the tasks without dates' : ''
    return `The Timeline’s tasks have no dates yet. Add dates on the Timeline${listing}.`
  }
  return 'No tasks with dates match the Timeline’s subteams and filter. Change them on the Timeline.'
}

function drawNothing(prims: Prim[], frame: Frame, bodyTop: number): void {
  const { left, right, fonts, measure, k } = frame
  const centre = (left + right) / 2
  const y = bodyTop + 24 * k
  prims.push(textPrim('Nothing to export', centre, y, fonts.group, INK.navy, 'middle'))
  const lines = wrapLines(emptyReason(frame.plan), Math.min(right - left, 420 * k), fonts.cell, measure, 3)
  lines.forEach((text, i) => {
    if (text) prims.push(textPrim(text, centre, y + lineHeight(fonts.group) + 2 + i * lineHeight(fonts.cell), fonts.cell, INK.muted, 'middle'))
  })
}

/** In front of the rows: the grid/chart divider, the key dates' dashed lines and the as-of line. */
function drawOverlays(prims: Prim[], frame: Frame, r: Regions): void {
  const { chartX, gridRight, sheet, fonts } = frame
  prims.push(line(gridRight, r.scaleTop, gridRight, r.bodyEnd, { color: NEUTRAL.year, width: 0.75 }))
  const lineH = sheet.lanes.keyDateLine
  const { half } = keyDateLabelGeometry(fonts.laneName)
  for (const keyDate of frame.keyDates) {
    const diamondBottom = r.keysTop + 1.5 + keyDate.label.line * lineH + lineH / 2 + half * (keyDate.state === 'atRisk' ? RING : 1)
    const from = keyDate.fromDiamond ? diamondBottom : r.lanesBottom
    if (r.bodyEnd <= from + 0.5) continue
    const x = chartX + keyDate.x
    prims.push(line(x, from, x, r.bodyEnd, { color: keyDate.ink.solid, width: 0.5, dash: [2, 2] }, 0.5))
  }
  if (frame.asOfX !== null && r.bodyEnd > r.lanesBottom) {
    const x = chartX + frame.asOfX
    prims.push(line(x, r.lanesBottom, x, r.bodyEnd, { color: INK.brand, width: 0.75 }))
  }
}

function drawLegend(prims: Prim[], frame: Frame): void {
  const { legend, left, right, sheet, fonts } = frame
  if (legend.lines === 0) return
  const { k } = legend
  prims.push(line(left, legend.ruleY, right, legend.ruleY, { color: NEUTRAL.rule, width: 0.5 }))
  const lineY = (l: number) => baselineAt(legend.top + l * sheet.legendLine + sheet.legendLine / 2, fonts.legend)
  if (legend.items.length) prims.push(textPrim('KEY', left, lineY(0), fonts.heading, INK.muted))
  for (const item of legend.items) {
    const y = lineY(item.line)
    const mid = middleOf(y, fonts.legend)
    let width = 12 * k
    if (item.swatch) {
      prims.push({ kind: 'rect', x: item.x, y: mid - 3 * k, w: 12 * k, h: 6 * k, fill: item.swatch.solid, stroke: { color: item.swatch.ink, width: 0.5 } })
    } else if (item.sample) {
      prims.push(...samplePrims(item.sample, item.x, mid, k))
      width = sampleWidth(item.sample, k)
    }
    if (item.label) prims.push(textPrim(item.label, item.x + width + 3 * k, y, fonts.legend, INK.text))
  }
  if (legend.definitions) prims.push(textPrim(legend.definitions.text, left, lineY(legend.definitions.line), fonts.legend, INK.muted))
}

/** 'Bristol FSAI · 2026–27 Plan · Exported 10 Nov 2026, 14:32', the title shortened first if it must be. */
function sourceLine(frame: Frame, room: number): string {
  const { plan, fonts, measure } = frame
  const org = cleanText(plan.orgShort)
  const title = cleanText(plan.title)
  const stamp = formatStamp(plan.exportedAt)
  const named = org && !title.toLowerCase().startsWith(org.toLowerCase()) ? org : ''
  const joined = (middle: string) => [named, middle, stamp ? `Exported ${stamp}` : ''].filter(Boolean).join(' · ')
  const whole = joined(title)
  if (fits(whole, room, fonts.footer, measure)) return whole
  const others = joined('')
  const short = fitLine(title, room - widthOf(`${others} · `, fonts.footer, measure), fonts.footer, measure)
  return short && short !== '…' ? joined(short) : fitLine(others, room, fonts.footer, measure)
}

function drawFooter(prims: Prim[], frame: Frame, index: number, count: number): void {
  const { left, right, fonts, sheet, measure } = frame
  prims.push(line(left, frame.footerRuleY, right, frame.footerRuleY, { color: NEUTRAL.rule, width: 0.5 }))
  const y = baselineAt(frame.footerTop + sheet.footerHeight / 2, fonts.footer)
  // Slides number themselves only when there are several.
  const number = frame.noun === 'Page' ? `Page ${index + 1} of ${count}` : count > 1 ? `Slide ${index + 1} of ${count}` : ''
  const numberW = widthOf(number, fonts.pageNo, measure)
  const source = sourceLine(frame, right - left - (numberW ? numberW + 16 : 0))
  if (source) prims.push(textPrim(source, left, y, fonts.footer, INK.muted))
  if (number) prims.push(textPrim(number, right, y, fonts.pageNo, INK.text, 'end'))
}

/** 'Page 2 of 3: Powertrain (continued) and Electrical, 23 tasks' */
function pageLabel(frame: Frame, index: number, count: number, placed: Placed[], continued: Entry | null): string {
  const head = `${frame.noun} ${index + 1} of ${count}`
  if (frame.empty) return `${head}: Nothing to export`
  const names: string[] = []
  const groups = new Set<PlanGroup>()
  const nameOf = (entry: Entry) => (entry.view.kind === 'task' ? '' : entry.view.name)
  if (continued) {
    names.push(`${nameOf(continued)} (continued)`.trim())
    groups.add(continued.view.group)
  }
  for (const { entry } of placed) {
    const view = entry.view
    if (view.kind === 'header' || (view.kind === 'summary' && view.heads)) names.push(nameOf(entry))
    groups.add(view.group)
  }
  const tasks = frame.summary
    ? [...groups].reduce((sum, group) => sum + Math.max(0, group.counts.tasks), 0)
    : placed.filter(({ entry }) => entry.view.kind === 'task' && !entry.view.row.nested).length
  const parts = [listText(names.filter(Boolean)), tasks > 0 ? tasksText(tasks) : ''].filter(Boolean)
  return parts.length ? `${head}: ${parts.join(', ')}` : head
}

/** Page `index` of `count`: its shapes in reading order and its label. */
export function drawPage(frame: Frame, slice: PageSlice, index: number, count: number): Page {
  const prims: Prim[] = []
  const r = regions(frame, slice, index)
  const placed = slice.blocks.map((block) => ({ entry: frame.entries[block.index], top: r.bodyTop + block.y }))
  const continued = slice.continued === null ? null : (frame.entries.find((entry) => entry.block.group === slice.continued) ?? null)

  drawTitleBlock(prims, frame)
  if (index === 0) drawNote(prims, frame)
  drawScale(prims, frame, r)
  drawLanes(prims, frame, r)
  drawBackgrounds(prims, frame, placed, continued, r.bodyTop)
  if (r.bodyEnd > r.lanesBottom) {
    for (const gridline of frame.scale.lines) {
      const x = frame.chartX + gridline.x
      prims.push(line(x, r.lanesBottom, x, r.bodyEnd, GRID[gridline.kind]))
    }
  }
  drawLinks(prims, frame, placed)
  drawRows(prims, frame, placed, continued, r.bodyTop)
  if (frame.empty) drawNothing(prims, frame, r.bodyTop)
  drawOverlays(prims, frame, r)
  drawLegend(prims, frame)
  drawFooter(prims, frame, index, count)
  return { width: frame.sheet.width, height: frame.sheet.height, label: pageLabel(frame, index, count, placed, continued), prims }
}
