// The words on the Timeline export's pages, set in the sheet's type: the font of each part of a page, where
// a line's baseline sits, cells fitted to their columns (a title wrapped round its '3/5', an owner shortened
// to 'Alexandra S. +2'), counts in words, and lines in several colours set one run after another. Every
// width counts the export's 3% slack, as fitLine and wrapLines do, so text that fits here still fits when
// SVG, the print engine or a fallback font draws it a little wider.

import type { SheetSpec } from './exportSheets'
import { fitLine, isolateOwner, wrapLines } from './exportText'
import { SLACK, splitGraphemes } from './exportTextCore'
import type { FontFamily, FontSpec, Hex, Measure, TextPrim } from './scene'

export interface LayoutFonts {
  /** BRISTOL FORMULA STUDENT AI */
  eyebrow: FontSpec
  title: FontSpec
  subtitle: FontSpec
  /** 'Note:' before the note, which is set in the subtitle's font */
  noteLabel: FontSpec
  asOf: FontSpec
  headline: FontSpec
  /** Column headings, lane names and KEY: small mono capitals */
  heading: FontSpec
  year: FontSpec
  month: FontSpec
  /** Monday dates and days */
  week: FontSpec
  /** 'As of 10 Nov' on its red pill */
  pill: FontSpec
  /** Key-date labels: the name, then the date */
  laneName: FontSpec
  laneDate: FontSpec
  /** Phase names, the current phase's in the heavier weight */
  phase: FontSpec
  phaseNow: FontSpec
  group: FontSpec
  groupDetail: FontSpec
  task: FontSpec
  /** A task with subtasks */
  parent: FontSpec
  subtask: FontSpec
  /** Owner, dates and status cells, and the semibold warning words among them */
  cell: FontSpec
  warning: FontSpec
  /** Item numbers, and a parent's '3/5' */
  number: FontSpec
  legend: FontSpec
  footer: FontSpec
  pageNo: FontSpec
}

const font = (family: FontFamily, size: number, weight: number): FontSpec => ({ family, size, weight })

/** The fonts of every part of a page on `sheet` (its type scale, which slides scale with the row step). */
export function fontsFor(sheet: SheetSpec): LayoutFonts {
  const t = sheet.type
  return {
    eyebrow: font('mono', t.eyebrow, 600),
    title: font('sans', t.title, 600),
    subtitle: font('sans', t.subtitle, 400),
    noteLabel: font('sans', t.subtitle, 600),
    asOf: font('sans', t.asOf, 600),
    headline: font('sans', t.headline, 400),
    heading: font('mono', t.colHead, 600),
    year: font('sans', t.year, 600),
    month: font('sans', t.month, 500),
    week: font('sans', t.week, 400),
    pill: font('sans', t.legend, 600),
    laneName: font('sans', t.lane, 600),
    laneDate: font('sans', t.lane, 400),
    // The contract's weights stop at 600, so the current phase reads bold beside the others at 500.
    phase: font('sans', t.lane, 500),
    phaseNow: font('sans', t.lane, 600),
    group: font('sans', t.group, 600),
    groupDetail: font('sans', t.groupDetail, 400),
    task: font('sans', t.task, 400),
    parent: font('sans', t.task, 500),
    subtask: font('sans', t.subtask, 400),
    cell: font('sans', t.cell, 400),
    warning: font('sans', t.cell, 600),
    number: font('mono', t.number, 400),
    legend: font('sans', t.legend, 400),
    footer: font('sans', t.footer, 400),
    pageNo: font('sans', t.pageNo, 600),
  }
}

/** How far below the middle of its line a baseline sits, as a share of the size: half of Geist's cap
 *  height, so capitals and figures sit centred on the line whatever their size. */
const CAP_HALF = 0.35

/** The baseline of a line of `font` text centred on `centre`. */
export function baselineAt(centre: number, font: FontSpec): number {
  return centre + CAP_HALF * font.size
}

/** The middle of a line of `font` text on `baseline`, where the icons and samples beside it are centred. */
export function middleOf(baseline: number, font: FontSpec): number {
  return baseline - CAP_HALF * font.size
}

/** Line spacing, 1.25 times the size. */
export function lineHeight(font: FontSpec): number {
  return font.size * 1.25
}

/** The width the layout keeps for `text`: its measure with the slack ('' takes none). */
export function widthOf(text: string, font: FontSpec, measure: Measure): number {
  if (!text) return 0
  const width = measure(text, font) * SLACK
  return Number.isFinite(width) && width > 0 ? width : 0
}

/** Whether `text` fits `width` points, with the slack. */
export function fits(text: string, width: number, font: FontSpec, measure: Measure): boolean {
  return widthOf(text, font, measure) <= width + 1e-9
}

export function textPrim(text: string, x: number, y: number, font: FontSpec, color: Hex, anchor: TextPrim['anchor'] = 'start'): TextPrim {
  return { kind: 'text', x, y, anchor, family: font.family, size: font.size, weight: font.weight, text, color }
}

/** A stretch of a line in its own font and colour. */
export interface Run {
  text: string
  font: FontSpec
  color: Hex
}

export function runsWidth(runs: readonly Run[], measure: Measure): number {
  return runs.reduce((sum, run) => sum + widthOf(run.text, run.font, measure), 0)
}

/**
 * Text prims for runs set one after another on one baseline, from x (or ending at x), in reading order. Each
 * run takes its kept width, slack included, so runs never touch. A line ending at x has each run anchored at
 * its own right end, so the slack falls at the line's open left end instead of as a gap before a short run
 * ('…, 15 Dec 2026 · at risk'). Spaces at either end of a run keep their room but are never drawn: SVG would
 * drop them and canvas keep them, which would move the text.
 */
export function runPrims(runs: readonly Run[], x: number, y: number, measure: Measure, anchor: 'start' | 'end' = 'start'): TextPrim[] {
  const prims: TextPrim[] = []
  if (anchor === 'start') {
    let left = x
    for (const run of runs) {
      const shown = run.text.trim()
      if (shown) {
        const lead = run.text.slice(0, run.text.length - run.text.trimStart().length)
        prims.push(textPrim(shown, left + widthOf(lead, run.font, measure), y, run.font, run.color))
      }
      left += widthOf(run.text, run.font, measure)
    }
    return prims
  }
  let right = x
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]
    const shown = run.text.trim()
    if (shown) {
      const trail = run.text.slice(run.text.trimEnd().length)
      prims.unshift(textPrim(shown, right - widthOf(trail, run.font, measure), y, run.font, run.color, 'end'))
    }
    right -= widthOf(run.text, run.font, measure)
  }
  return prims
}

const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0)

/** '1 task', '12 tasks' */
export function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`
}

export interface CountsLike {
  tasks: number
  done: number
  blocked: number
  overdue: number
  atRisk: number
}

/** Problems read in red and risks in amber wherever counts are coloured (the title block's headline). */
export type CountTone = 'plain' | 'problem' | 'risk'

/** '12 tasks', '4 done', '1 blocked', '1 overdue', '1 at risk', leaving out counts of zero after the tasks. */
export function countParts(counts: CountsLike): { text: string; tone: CountTone }[] {
  const tasks = whole(counts.tasks)
  const parts: { text: string; tone: CountTone }[] = [{ text: tasks === 0 ? 'No tasks' : plural(tasks, 'task'), tone: 'plain' }]
  const add = (n: number, words: string, tone: CountTone) => {
    if (whole(n) > 0) parts.push({ text: `${whole(n)} ${words}`, tone })
  }
  add(counts.done, 'done', 'plain')
  add(counts.blocked, 'blocked', 'problem')
  add(counts.overdue, 'overdue', 'problem')
  add(counts.atRisk, 'at risk', 'risk')
  return parts
}

/**
 * The owner fitted to `width`: 'Alexandra Smith +2', else the first name and the last initial
 * ('Alexandra S. +2'), else as much of the name as fits before the '+2', ending '…'.
 */
export function ownerFit(owner: string, width: number, font: FontSpec, measure: Measure): string {
  // The name is set apart last (isolate), so a right-to-left name keeps its '+2' after it.
  return isolateOwner(ownerFitted(owner, width, font, measure))
}

function ownerFitted(owner: string, width: number, font: FontSpec, measure: Measure): string {
  if (fits(owner, width, font, measure)) return owner
  const match = /^(.*?)(?: (\+\d+))?$/u.exec(owner)
  const name = match?.[1] ?? owner
  const extra = match?.[2] ? ` ${match[2]}` : ''
  const words = name.split(' ').filter(Boolean)
  if (words.length > 1) {
    const initial = splitGraphemes(words[words.length - 1])[0] ?? ''
    const short = `${words[0]} ${initial}.${extra}`
    if (fits(short, width, font, measure)) return short
  }
  const cut = fitLine(name, width - widthOf(extra, font, measure), font, measure)
  if (cut && cut !== '…') return `${cut}${extra}`
  return fitLine(owner, width, font, measure)
}

/**
 * The Dates cell: one line when the range fits, else broken after its dash ('20 Dec 2026 –' over
 * '14 Jan 2027') so no date is ever split; other wording wraps between words. At most two lines.
 */
export function dateLines(text: string, width: number, font: FontSpec, measure: Measure): string[] {
  if (fits(text, width, font, measure)) return [text]
  const dash = text.indexOf(' – ')
  if (dash > 0) return [fitLine(`${text.slice(0, dash)} –`, width, font, measure), fitLine(text.slice(dash + 3), width, font, measure)]
  return wrapLines(text, width, font, measure, 2)
}

/** A status icon is this share of the cell's type size across, with 3 pt (times k) before its word. */
export const STATUS_ICON = 0.8
export const STATUS_GAP = 3

/** A stretch of a title cell's line: the title itself, or the muted '· part of …' note after it. */
export interface CellRun {
  text: string
  muted: boolean
}

export interface TitleCell {
  lines: CellRun[][]
  /** The muted '3/5' after the last line, or '' */
  suffix: string
}

/** Where each line lies in `text` (lines are stretches of it, the last perhaps ending with an added '…'). */
function locate(text: string, lines: readonly string[]): { spans: [number, number][]; end: number; complete: boolean } {
  const spans: [number, number][] = []
  let pos = 0
  for (const line of lines) {
    let body = line
    let at = text.indexOf(body, pos)
    if (at < 0 && body.endsWith('…')) {
      body = body.slice(0, -1)
      at = text.indexOf(body, pos)
    }
    if (at < 0 || !body) {
      spans.push([pos, pos])
      continue
    }
    spans.push([at, at + body.length])
    pos = at + body.length
  }
  return { spans, end: pos, complete: text.slice(pos).trim() === '' }
}

/** Each line split into the title and the note after it, which starts at `noteFrom`. */
function toRuns(text: string, lines: readonly string[], noteFrom: number): CellRun[][] {
  const { spans } = locate(text, lines)
  return lines.map((line, i) => {
    const [start, end] = spans[i]
    const runs: CellRun[] = []
    const titleEnd = Math.min(end, noteFrom)
    if (titleEnd > start) runs.push({ text: text.slice(start, titleEnd), muted: false })
    const noteStart = Math.max(start, noteFrom)
    if (end > noteStart) runs.push({ text: text.slice(noteStart, end), muted: true })
    if (runs.length === 0) return line ? [{ text: line, muted: false }] : []
    // The '…' fitLine added after the stretch.
    if (line.length > end - start) runs[runs.length - 1].text += line.slice(end - start)
    return runs
  })
}

/**
 * A title fitted to its cell: up to `maxLines` lines broken between words, ending '…' if it doesn't fit,
 * with a muted '· part of <parent>' note running on after it, and `suffix` (a parent's '3/5', in
 * `suffixFont`) kept whole at the end of the last line. When the last line has no room for the suffix, the
 * title is first wrapped narrower so it does, and only if that can't hold it all is the last line cut.
 */
export function titleCell(
  title: string,
  partOf: string | null,
  suffix: string,
  width: number,
  font: FontSpec,
  suffixFont: FontSpec,
  maxLines: number,
  measure: Measure,
): TitleCell {
  const note = partOf ? `· part of ${partOf}` : ''
  const text = title && note ? `${title} ${note}` : title || note
  const noteFrom = note ? text.length - note.length : text.length
  let lines = wrapLines(text, width, font, measure, maxLines)
  let kept = suffix
  if (suffix) {
    const room = width - widthOf(' ', font, measure) - widthOf(suffix, suffixFont, measure)
    if (room <= 0) kept = ''
    else if (!fits(lines[lines.length - 1], room, font, measure)) {
      const narrow = wrapLines(text, room, font, measure, maxLines)
      if (locate(text, narrow).complete) lines = narrow
      else {
        const head = lines.slice(0, -1)
        const rest = text.slice(locate(text, head).end).trimStart()
        lines = [...head, fitLine(rest, room, font, measure)]
      }
    }
  }
  return { lines: toRuns(text, lines, noteFrom), suffix: kept }
}
