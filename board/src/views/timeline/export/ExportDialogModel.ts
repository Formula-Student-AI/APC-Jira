// The Export dialog's own decisions and wording, kept pure so they are tested in node: the scope line, the
// hints for each browser, the notices only the dialog can give (it alone knows the page and slide counts),
// what an empty export says, the one-click fixes, the counts in the option labels, and the text whose fonts
// must load before anything is measured.

import { format } from 'date-fns'
import { PLAN_LABEL } from '../../../config'
import { errorMessage, parseDay } from '../../../lib/format'
import type { Item, Member } from '../../../types'
import type { DatedRow } from './exportPeriod'
import type { ExportFormat, ExportSettings, MonthValue, PeriodChoice } from './exportSettings'
import type { Notice, NoticeFix, Plan } from './planTypes'

/** A notice as the dialog lists it; `id` lets disabled actions point at the one that says why. */
export interface DialogNotice extends Notice {
  id?: string
}

export const MONTHS_WRONG = 'The end month must be on or after the start month.'

/** Past this many pages, the dialog suggests ways to make the PDF shorter. */
export const MANY_PAGES = 20

/** 'From the Timeline as it is now: Mechanical, Electrical · filter “brake”. Change these with …' */
export function scopeLine(shownTeams: readonly string[], query: string): string {
  const teams = shownTeams.length ? shownTeams.join(', ') : 'All subteams'
  const filter = query.trim().replace(/\s+/g, ' ')
  return (
    `From the Timeline as it is now: ${teams}${filter ? ` · filter “${filter}”` : ''}. ` +
    'Change these with the subteam buttons and the filter box. Collapsed subteams are included.'
  )
}

export interface BrowserTraits {
  /** Chrome, Edge and other Chromium browsers (not on iOS): with zero margins they print no header or footer */
  chromium: boolean
  /** A phone or tablet, which prints through the system's print screen */
  phone: boolean
  /** An app's own browser (Teams, Outlook, Facebook…), which may block printing and downloads */
  inApp: boolean
}

/** From the user agent; iPads report themselves as Macs, so touch points tell them apart. */
export function browserTraits(userAgent: string, touchPoints = 0): BrowserTraits {
  return {
    chromium: /\b(Chrome|Chromium|Edg)\//.test(userAgent),
    phone: /Android|iPhone|iPad|iPod|Mobile/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1),
    inApp: /\bTeams\/|Outlook|FBA[NV]\/|Instagram|LinkedInApp|\bLine\//.test(userAgent),
  }
}

/** The footer's hint for the PDF: what to pick in this browser's print window. */
export function printHint(browser: BrowserTraits): string {
  const parts = ['In the print window choose Save as PDF, or a printer. Leave Margins on Default.']
  if (browser.phone) parts.push('On a phone, choose Save as PDF or Save to Files in the print screen.')
  else if (!browser.chromium) parts.push('Untick Print headers and footers.')
  if (browser.inApp) parts.push('If nothing opens, open the board in Chrome or Edge.')
  return parts.join(' ')
}

/** The footer's hint for images. */
export function imageHint(browser: BrowserTraits, slides = 1): string {
  const parts = ['A 16:9 image, 3840 × 2160 px, that fills a widescreen slide in PowerPoint, Google Slides or Keynote.']
  // Chrome and Edge let one file through per click and ask before the rest.
  if (slides > 1) parts.push('Each slide is its own file: if your browser asks, allow this site to download multiple files.')
  if (browser.inApp) parts.push('If nothing downloads, open the board in Chrome or Edge.')
  return parts.join(' ')
}

/** A layout that can't be made, in a plain sentence (buildPlan and layoutDocument throw when something is wrong). */
export function layoutProblem(error: unknown): string {
  return `Couldn't lay out the export: ${errorMessage(error)}`
}

/** Months chosen with To before From. */
export function monthsOutOfOrder(period: PeriodChoice): boolean {
  return period.preset === 'months' && period.to < period.from
}

/** 'Nov 2026' (English month names whatever the browser's locale). */
export function monthLabel(month: MonthValue): string {
  const date = parseDay(`${month}-01`)
  return date ? format(date, 'MMM yyyy') : month
}

export interface MonthOption {
  value: MonthValue
  label: string
}

/** The months for a select, with `values` added in order when missing (months remembered from long ago). */
export function withMonths(options: MonthOption[], values: MonthValue[]): MonthOption[] {
  const known = new Set(options.map((option) => option.value))
  const missing = [...new Set(values)].filter((value) => !known.has(value))
  if (missing.length === 0) return options
  const added = missing.map((value) => ({ value, label: monthLabel(value) }))
  return [...options, ...added].sort((a, b) => a.value.localeCompare(b.value))
}

/** Nothing to show: no task or summary rows in any group. */
export function isEmptyPlan(plan: Plan): boolean {
  return plan.groups.every((group) => group.rows.length === 0)
}

/** Why there is nothing to export, and how to fix it (the actions point here). */
export function emptyNotice(plan: Plan, settings: ExportSettings): Notice {
  if (plan.leftOut.outsidePeriod > 0) {
    const text = "Nothing to export: the Timeline's tasks all fall outside this period."
    return settings.period.preset === 'plan'
      ? { kind: 'warning', text }
      : {
          kind: 'warning',
          text: `${text} Choose a longer period, or the whole plan.`,
          fix: { label: 'Use the whole plan', action: 'plan' },
        }
  }
  if (plan.leftOut.undated > 0 && plan.format === 'pdf' && plan.mode === 'tasks') {
    return {
      kind: 'warning',
      text:
        "Nothing to export: the Timeline's tasks have no dates yet. Add dates on the Timeline, or list the tasks " +
        'without dates.',
      fix: { label: 'List tasks without dates', action: 'undated' },
    }
  }
  return {
    kind: 'warning',
    text: "Nothing to export: no tasks with dates match the Timeline's subteams and filter. Change them on the Timeline.",
  }
}

/** The notices only the dialog can give, from the page count: a long PDF, or rows that need several slides. */
export function lengthNotices(format: ExportFormat, pageCount: number, settings: ExportSettings): Notice[] {
  const everyTask = settings[format].rows === 'tasks'
  const summaryFix = { label: 'Use one row per domain', action: 'summary' } as const
  if (format === 'pdf') {
    if (pageCount <= MANY_PAGES) return []
    const long = `This PDF runs to ${pageCount} pages.`
    if (settings.paper === 'a4') {
      const text = `${long} A3 fits more rows on each page; one row per domain, or fewer subteams, would also make it shorter.`
      return [{ kind: 'warning', text, fix: { label: 'Try A3', action: 'a3' } }]
    }
    return [
      everyTask
        ? { kind: 'warning', text: `${long} One row per domain, or fewer subteams, would make it shorter.`, fix: summaryFix }
        : { kind: 'warning', text: `${long} Fewer subteams would make it shorter.` },
    ]
  }
  if (pageCount <= 1) return []
  const text = `The rows don't fit on one slide, so this makes ${pageCount} images, each with its own Copy and Download.`
  return [
    everyTask
      ? { kind: 'warning', text: `${text} One row per domain fits the whole plan on one slide.`, fix: summaryFix }
      : { kind: 'warning', text: `${text} Fewer subteams would fit on one.` },
  ]
}

/** The settings after a notice's one-click fix. */
export function applyFix(settings: ExportSettings, fix: NoticeFix): ExportSettings {
  switch (fix) {
    case 'summary':
      return settings.format === 'pdf'
        ? { ...settings, pdf: { ...settings.pdf, rows: 'summary' } }
        : { ...settings, png: { ...settings.png, rows: 'summary' } }
    case 'a3':
      return { ...settings, format: 'pdf', paper: 'a3' }
    case 'plan':
      return { ...settings, period: { preset: 'plan' } }
    case 'subtasks':
      return { ...settings, subtasks: true }
    case 'undated':
      return { ...settings, undated: true }
  }
}

export interface IncludeCounts {
  subtasks: number | null
  undated: number | null
}

/**
 * The counts in the Also include labels: how many subtasks, and how many tasks without dates, ticking each
 * box adds or (once ticked) shows. null while there is no plan.
 */
export function includeCounts(plan: Plan | null, settings: ExportSettings): IncludeCounts {
  if (!plan) return { subtasks: null, undated: null }
  let nested = 0
  for (const group of plan.groups) for (const row of group.rows) if (row.kind === 'task' && row.nested) nested++
  const listed = plan.groups.find((group) => group.undated)?.rows.length ?? 0
  return {
    subtasks: settings.subtasks ? nested : plan.leftOut.rolledUp,
    undated: settings.undated ? listed : plan.leftOut.undated,
  }
}

/** The status line: the sentence from statusSentence, then how many notes there are to check. */
export function statusLine(sentence: string, notes: number): string {
  if (notes === 0) return sentence
  return `${sentence} ${notes} ${notes === 1 ? 'note' : 'notes'} to check.`.trim()
}

/** A slide image's file name: '<name>.png', or '<name> - slide 2 of 3.png' when there are several. */
export function slideFileName(base: string, index: number, count: number): string {
  return count > 1 ? `${base} - slide ${index + 1} of ${count}.png` : `${base}.png`
}

/** The settings as the export uses them: a blank title falls back to the plan's name. */
export function exportedSettings(settings: ExportSettings): ExportSettings {
  const title = settings.title.trim() || PLAN_LABEL
  return title === settings.title ? settings : { ...settings, title }
}

/** What the Prepared by box shows: the remembered text, or (by default) your own full name. */
export function preparedByText(settings: ExportSettings, me: Member | null): string {
  return settings.preparedBy ?? me?.full_name ?? ''
}

/** What to remember from the Prepared by box: your own name is the default (null), so a rename follows. */
export function preparedByValue(text: string, me: Member | null): string | null {
  return me && text === me.full_name ? null : text
}

/** The Timeline's tasks with dates, which Whole plan is widened to cover (key dates and phases never widen it). */
export function datedRows(items: readonly Item[]): DatedRow[] {
  const task = (item: Item) => !item.archived && item.number > 0 && !item.is_milestone && !item.is_phase
  return items
    .filter((item) => task(item) && (item.start_date || item.due_date))
    .map((item) => ({ title: item.title, start: item.start_date, due: item.due_date }))
}

/** Letters, digits and the symbols of the export's own wording, so their faces load even on an empty board. */
const FIXED_TEXT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 #+/·–—…→:;,.!?&()“”‘’'

/**
 * Every character the plans will draw, once each and in a fixed order, for loading their fonts before
 * measuring. The order keeps the string the same while the text changes within the same characters.
 */
export function planText(plans: readonly (Plan | null | undefined)[]): string {
  const chars = new Set<string>(FIXED_TEXT)
  const add = (text: string | null | undefined) => {
    if (text) for (const char of text) chars.add(char)
  }
  for (const plan of plans) {
    if (!plan) continue
    for (const text of [plan.org, plan.orgShort, plan.title, plan.subtitle, plan.preparedBy, plan.note]) add(text)
    for (const group of plan.groups) {
      add(group.name)
      add(group.lead)
      for (const row of group.rows) {
        if (row.kind === 'task') {
          add(row.title)
          add(row.owner)
          add(row.partOf)
        } else {
          add(row.name)
          add(row.lead)
        }
      }
    }
    for (const keyDate of plan.keyDates) add(keyDate.title)
    add(plan.nextKeyDate?.title)
    add(plan.afterPeriod?.title)
    for (const phase of plan.phases) add(phase.title)
    for (const subteam of plan.subteams) add(subteam.name)
  }
  return [...chars].sort().join('')
}

/** `run()`, or `fallback` if it throws: a fault in one part of the export never takes the app down. */
export function attempt<T>(run: () => T, fallback: T): T {
  try {
    return run()
  } catch {
    return fallback
  }
}
