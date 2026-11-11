// The Export dialog's own wording and decisions: the scope line, the hints for each browser, what an empty or
// very long export says and how its one-click fixes change the settings, the counts in the labels, and the
// text whose fonts load before measuring.

import { describe, expect, it } from 'vitest'
import { PLAN_LABEL } from '../../../config'
import type { Item, Member } from '../../../types'
import {
  applyFix,
  attempt,
  browserTraits,
  datedRows,
  emptyNotice,
  exportedSettings,
  imageHint,
  includeCounts,
  isEmptyPlan,
  layoutProblem,
  lengthNotices,
  MANY_PAGES,
  monthLabel,
  monthsOutOfOrder,
  planText,
  preparedByText,
  preparedByValue,
  printHint,
  scopeLine,
  slideFileName,
  statusLine,
  withMonths,
} from './ExportDialogModel'
import { defaultSettings, type ExportSettings } from './exportSettings'
import type { Plan, PlanGroup, PlanRow, PlanSummaryRow, PlanTaskRow } from './planTypes'

function plan(patch: Partial<Plan> = {}): Plan {
  return {
    format: 'pdf',
    mode: 'tasks',
    org: 'Bristol Formula Student AI',
    orgShort: 'Bristol FSAI',
    title: '2026–27 Plan',
    subtitle: 'Timeline · All subteams · Sep 2026 – Aug 2027',
    asOf: '2026-11-10',
    exportedAt: '2026-11-10T14:32:00.000Z',
    preparedBy: 'Jane Smith',
    note: '',
    period: { first: '2026-09-01', last: '2027-08-31' },
    columns: { number: true, owner: true, dates: true, status: true },
    links: false,
    groups: [],
    keyDates: [],
    nextKeyDate: null,
    afterPeriod: null,
    phases: [],
    subteams: [],
    counts: { tasks: 0, done: 0, inProgress: 0, notStarted: 0, blocked: 0, overdue: 0, atRisk: 0 },
    leftOut: { outsidePeriod: 0, undated: 0, rolledUp: 0, archived: 0, keyDatesOutside: 0, phasesOutside: 0 },
    notices: [],
    dependencies: [],
    scope: { subteams: [], filtered: false, query: '' },
    ...patch,
  }
}

function taskRow(number: number, patch: Partial<PlanTaskRow> = {}): PlanTaskRow {
  return {
    kind: 'task', id: `id-${number}`, number, title: `Task ${number}`, nested: false, partOf: null, progress: null,
    start: '2026-10-01', due: '2026-10-20', word: 'Not started', stage: 'Not started',
    flags: { blocked: false, overdue: false, atRisk: false }, owner: '', color: 'BLUE', ...patch,
  }
}

function group(key: string, rows: PlanRow[], patch: Partial<PlanGroup> = {}): PlanGroup {
  return {
    key, name: key, color: 'BLUE', lead: '', counts: { tasks: rows.length, done: 0, blocked: 0, overdue: 0, atRisk: 0 },
    span: null, rows, undated: false, ...patch,
  }
}

function item(number: number, patch: Partial<Item> = {}): Item {
  return {
    id: `id-${number}`, number, title: `Item ${number}`, description: '', status: 'Todo', subteam: 'Mechanical',
    domain: null, assignees: [], legacy_assignees: [], labels: [], start_date: '2026-10-01', due_date: '2026-10-20',
    blocked_reason: null, blocked_by: [], related_to: [], is_milestone: false, is_phase: false, parent_id: null, extra: {},
    position: number, archived: false, github_item_id: null, github_url: null, created_by: null, updated_by: null,
    created_at: '', updated_at: '', ...patch,
  }
}

const me: Member = {
  username: 'js12345', full_name: 'Jane Smith', email: 'js12345@bristol.ac.uk', github_login: null,
  is_board_admin: false, active: true, created_at: '',
}

const settings = (patch: Partial<ExportSettings> = {}): ExportSettings => ({ ...defaultSettings(), ...patch })

const UA = {
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  teams: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Teams/24295.605.3225.8804 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36',
}

describe('scopeLine', () => {
  it('names the subteams and quotes the filter, never as a page would', () => {
    expect(scopeLine([], '')).toBe(
      'From the Timeline as it is now: All subteams. Change these with the subteam buttons and the filter box. Collapsed subteams are included.',
    )
    expect(scopeLine(['Mechanical', 'Electrical'], '  brake   pads ')).toBe(
      'From the Timeline as it is now: Mechanical, Electrical · filter “brake pads”. Change these with the subteam buttons and the filter box. Collapsed subteams are included.',
    )
    expect(scopeLine([], 'status:Blocked')).toContain('All subteams · filter “status:Blocked”.')
  })
})

describe('browser hints', () => {
  it('tells Chromium browsers, phones and in-app browsers apart', () => {
    expect(browserTraits(UA.chromeWindows)).toEqual({ chromium: true, phone: false, inApp: false })
    expect(browserTraits(UA.edge)).toEqual({ chromium: true, phone: false, inApp: false })
    expect(browserTraits(UA.firefox)).toEqual({ chromium: false, phone: false, inApp: false })
    expect(browserTraits(UA.safariMac)).toEqual({ chromium: false, phone: false, inApp: false })
    expect(browserTraits(UA.safariIphone)).toEqual({ chromium: false, phone: true, inApp: false })
    // Chrome on an iPhone is WebKit underneath, and prints like Safari.
    expect(browserTraits(UA.chromeIphone)).toEqual({ chromium: false, phone: true, inApp: false })
    expect(browserTraits(UA.chromeAndroid)).toEqual({ chromium: true, phone: true, inApp: false })
    expect(browserTraits(UA.teams)).toEqual({ chromium: true, phone: false, inApp: true })
    // iPads say they are Macs; only their touch points give them away.
    expect(browserTraits(UA.safariMac, 5).phone).toBe(true)
    expect(browserTraits(UA.safariMac, 0).phone).toBe(false)
  })

  it('says what to pick in the print window', () => {
    const base = 'In the print window choose Save as PDF, or a printer. Leave Margins on Default.'
    expect(printHint(browserTraits(UA.chromeWindows))).toBe(base)
    expect(printHint(browserTraits(UA.firefox))).toBe(`${base} Untick Print headers and footers.`)
    expect(printHint(browserTraits(UA.safariMac))).toBe(`${base} Untick Print headers and footers.`)
    expect(printHint(browserTraits(UA.safariIphone))).toBe(`${base} On a phone, choose Save as PDF or Save to Files in the print screen.`)
    expect(printHint(browserTraits(UA.teams))).toBe(`${base} If nothing opens, open the board in Chrome or Edge.`)
  })

  it('describes the image, and where downloads may be blocked', () => {
    expect(imageHint(browserTraits(UA.chromeWindows))).toBe(
      'A 16:9 image, 3840 × 2160 px, that fills a widescreen slide in PowerPoint, Google Slides or Keynote.',
    )
    expect(imageHint(browserTraits(UA.teams))).toMatch(/If nothing downloads, open the board in Chrome or Edge\.$/)
  })

  it('says, for several slides, that the browser may ask before downloading them all', () => {
    const allow = 'Each slide is its own file: if your browser asks, allow this site to download multiple files.'
    expect(imageHint(browserTraits(UA.chromeWindows), 3)).toContain(allow)
    expect(imageHint(browserTraits(UA.chromeWindows), 1)).not.toContain(allow)
  })
})

describe('problems', () => {
  it('words a layout that failed as a plain notice', () => {
    expect(layoutProblem(new Error('exportPlan.buildPlan: not written yet'))).toBe(
      "Couldn't lay out the export: exportPlan.buildPlan: not written yet",
    )
    expect(layoutProblem('no sheet')).toBe("Couldn't lay out the export: no sheet")
  })

  it('spots chosen months the wrong way round', () => {
    expect(monthsOutOfOrder({ preset: 'months', from: '2027-02', to: '2026-11' })).toBe(true)
    expect(monthsOutOfOrder({ preset: 'months', from: '2026-11', to: '2026-11' })).toBe(false)
    expect(monthsOutOfOrder({ preset: 'months', from: '2026-11', to: '2027-02' })).toBe(false)
    expect(monthsOutOfOrder({ preset: 'plan' })).toBe(false)
  })

  it('runs a part that may throw, with a fallback', () => {
    expect(attempt(() => 3, 0)).toBe(3)
    expect(
      attempt(() => {
        throw new Error('not yet')
      }, 0),
    ).toBe(0)
  })
})

describe('months for the selects', () => {
  it('labels months in English', () => {
    expect(monthLabel('2026-11')).toBe('Nov 2026')
    expect(monthLabel('2027-01')).toBe('Jan 2027')
    expect(monthLabel('soon')).toBe('soon')
  })

  it('adds remembered months the list lacks, in order and once', () => {
    const options = [
      { value: '2026-09', label: 'Sep 2026' },
      { value: '2026-10', label: 'Oct 2026' },
    ]
    expect(withMonths(options, ['2026-09', '2026-10'])).toBe(options)
    expect(withMonths(options, [])).toBe(options)
    expect(withMonths(options, ['2024-02', '2024-02', '2026-10'])).toEqual([
      { value: '2024-02', label: 'Feb 2024' },
      { value: '2026-09', label: 'Sep 2026' },
      { value: '2026-10', label: 'Oct 2026' },
    ])
  })
})

describe('empty exports', () => {
  it('is empty only when no group has a row', () => {
    expect(isEmptyPlan(plan())).toBe(true)
    expect(isEmptyPlan(plan({ groups: [group('Mechanical', [])] }))).toBe(true)
    expect(isEmptyPlan(plan({ groups: [group('Mechanical', []), group('Electrical', [taskRow(4)])] }))).toBe(false)
  })

  it('says why, with a fix where there is one', () => {
    const outside = plan({ leftOut: { ...plan().leftOut, outsidePeriod: 6 } })
    expect(emptyNotice(outside, settings({ period: { preset: 'next3' } }))).toEqual({
      kind: 'warning',
      text: "Nothing to export: the Timeline's tasks all fall outside this period. Choose a longer period, or the whole plan.",
      fix: { label: 'Use the whole plan', action: 'plan' },
    })
    expect(emptyNotice(outside, settings()).fix).toBeUndefined()

    const undated = plan({ leftOut: { ...plan().leftOut, undated: 3 } })
    expect(emptyNotice(undated, settings()).fix).toEqual({ label: 'List tasks without dates', action: 'undated' })
    // Slides and summaries can't list tasks without dates.
    expect(emptyNotice({ ...undated, format: 'png' }, settings()).fix).toBeUndefined()
    expect(emptyNotice({ ...undated, mode: 'summary' }, settings()).fix).toBeUndefined()

    expect(emptyNotice(plan(), settings())).toEqual({
      kind: 'warning',
      text: "Nothing to export: no tasks with dates match the Timeline's subteams and filter. Change them on the Timeline.",
    })
  })
})

describe('lengthNotices', () => {
  it('suggests A3 past 20 A4 pages, A2 past 20 A3 pages, and one row per domain past 20 A2 pages', () => {
    expect(lengthNotices('pdf', MANY_PAGES, settings())).toEqual([])
    const [a4] = lengthNotices('pdf', 24, settings())
    expect(a4).toMatchObject({ kind: 'warning', fix: { label: 'Try A3', action: 'a3' } })
    expect(a4.text).toMatch(/^This PDF runs to 24 pages\./)
    const [a3] = lengthNotices('pdf', 21, settings({ paper: 'a3' }))
    expect(a3).toMatchObject({ kind: 'warning', fix: { label: 'Try A2', action: 'a2' } })
    expect(a3.text).toMatch(/A2 fits more rows on each page/)
    const [a2] = lengthNotices('pdf', 21, settings({ paper: 'a2' }))
    expect(a2.fix).toEqual({ label: 'Use one row per domain', action: 'summary' })
    const summary = settings({ paper: 'a2', pdf: { ...defaultSettings().pdf, rows: 'summary' } })
    expect(lengthNotices('pdf', 21, summary)[0].fix).toBeUndefined()
  })

  it('offers one row per domain when the rows need several slides', () => {
    const tasks = settings({ format: 'png', png: { ...defaultSettings().png, rows: 'tasks' } })
    expect(lengthNotices('png', 1, tasks)).toEqual([])
    const [several] = lengthNotices('png', 3, tasks)
    expect(several.text).toMatch(/makes 3 images, each with its own Copy and Download/)
    expect(several.fix).toEqual({ label: 'Use one row per domain', action: 'summary' })
    expect(lengthNotices('png', 2, settings({ format: 'png' }))[0].fix).toBeUndefined()
  })
})

describe('applyFix', () => {
  it('changes just what the fix says, for the format chosen', () => {
    const pdf = settings()
    expect(applyFix(pdf, 'summary')).toEqual({ ...pdf, pdf: { ...pdf.pdf, rows: 'summary' } })
    const png = settings({ format: 'png', png: { ...pdf.png, rows: 'tasks' } })
    expect(applyFix(png, 'summary')).toEqual({ ...png, png: { ...png.png, rows: 'summary' } })
    expect(applyFix(png, 'a3')).toEqual({ ...png, format: 'pdf', paper: 'a3' })
    expect(applyFix(pdf, 'a2')).toEqual({ ...pdf, format: 'pdf', paper: 'a2' })
    expect(applyFix(settings({ period: { preset: 'next6' } }), 'plan').period).toEqual({ preset: 'plan' })
    expect(applyFix(pdf, 'subtasks').subtasks).toBe(true)
    expect(applyFix(pdf, 'undated').undated).toBe(true)
    // The settings given are left as they were.
    expect(pdf).toEqual(defaultSettings())
  })
})

describe('includeCounts', () => {
  const rows = [taskRow(1), taskRow(2, { nested: true }), taskRow(3, { nested: true }), taskRow(4, { partOf: 'Brakes' })]
  const counted = plan({
    groups: [group('Mechanical', rows), group('undated', [taskRow(9, { start: null, due: null })], { undated: true })],
    leftOut: { ...plan().leftOut, rolledUp: 5, undated: 7 },
  })

  it('counts what ticking each box would add, and then what it shows', () => {
    expect(includeCounts(counted, settings())).toEqual({ subtasks: 5, undated: 7 })
    expect(includeCounts(counted, settings({ subtasks: true, undated: true }))).toEqual({ subtasks: 2, undated: 1 })
    expect(includeCounts(null, settings())).toEqual({ subtasks: null, undated: null })
  })

  it('does not count summary rows as subtasks', () => {
    const summary: PlanSummaryRow = {
      kind: 'summary', level: 'subteam', key: 'Mechanical', name: 'Mechanical', color: 'BLUE', lead: '', spans: [],
      first: null, last: null, done: 0, total: 0, overdue: 0, blocked: 0, atRisk: 0,
    }
    expect(includeCounts(plan({ mode: 'summary', groups: [group('Mechanical', [summary])] }), settings({ subtasks: true })).subtasks).toBe(0)
  })
})

describe('wording', () => {
  it('adds the notes to check to the status sentence', () => {
    const sentence = '3 pages, A4 landscape. 48 tasks in 5 subteams, 6 key dates, 3 phases.'
    expect(statusLine(sentence, 0)).toBe(sentence)
    expect(statusLine(sentence, 1)).toBe(`${sentence} 1 note to check.`)
    expect(statusLine(sentence, 2)).toBe(`${sentence} 2 notes to check.`)
    expect(statusLine('', 2)).toBe('2 notes to check.')
  })

  it('names slides by number only when there are several', () => {
    const base = 'Bristol FSAI 2026-27 Plan - Timeline - 2026-11-10'
    expect(slideFileName(base, 0, 1)).toBe(`${base}.png`)
    expect(slideFileName(base, 1, 3)).toBe(`${base} - slide 2 of 3.png`)
  })

  it('falls back to the plan label for a blank title', () => {
    const d = defaultSettings()
    expect(exportedSettings(d)).toBe(d)
    expect(exportedSettings({ ...d, title: '   ' }).title).toBe(PLAN_LABEL)
    expect(exportedSettings({ ...d, title: ' Sponsor update ' }).title).toBe('Sponsor update')
  })

  it('shows your name in Prepared by by default, and remembers it as the default', () => {
    expect(preparedByText(settings(), me)).toBe('Jane Smith')
    expect(preparedByText(settings(), null)).toBe('')
    expect(preparedByText(settings({ preparedBy: '' }), me)).toBe('')
    expect(preparedByText(settings({ preparedBy: 'Chassis team' }), me)).toBe('Chassis team')
    expect(preparedByValue('Jane Smith', me)).toBeNull()
    expect(preparedByValue('', me)).toBe('')
    expect(preparedByValue('Chassis team', me)).toBe('Chassis team')
    expect(preparedByValue('Jane Smith', null)).toBe('Jane Smith')
  })
})

describe('datedRows', () => {
  it('keeps the Timeline tasks with a date, which Whole plan widens to cover', () => {
    const items = [
      item(1),
      item(2, { start_date: null }),
      item(3, { start_date: null, due_date: null }),
      item(4, { archived: true }),
      item(0, { id: 'new' }),
      item(5, { is_milestone: true }),
      item(6, { is_phase: true }),
      item(7, { title: 'Sponsor renewal', start_date: null, due_date: '2029-03-01' }),
    ]
    expect(datedRows(items)).toEqual([
      { title: 'Item 1', start: '2026-10-01', due: '2026-10-20' },
      { title: 'Item 2', start: null, due: '2026-10-20' },
      { title: 'Sponsor renewal', start: null, due: '2029-03-01' },
    ])
  })
})

describe('planText', () => {
  it('holds every character the plans draw, once each, in a fixed order', () => {
    const cyrillic = plan({
      title: 'План',
      groups: [group('Электрика', [taskRow(1, { title: 'Ячейка 🔋 тест', owner: 'Ольга', partOf: 'Ёж' })], { lead: 'Іван' })],
      keyDates: [{ id: 'k', number: 9, title: 'Freeze ẞ', date: '2026-12-15', color: null, state: 'upcoming' }],
      phases: [{ id: 'p', number: 8, title: 'Thiết kế', start: '2026-09-01', end: '2026-12-20', color: null, state: 'now' }],
    })
    const text = planText([cyrillic, null, undefined])
    for (const char of 'ПланЭлектрикаЯчейкатестОльгаЁжІванẞThiếtkế🔋') expect(text).toContain(char)
    // Each character once (emoji kept whole), sorted, so the same characters give the same string.
    const chars = [...text]
    expect(new Set(chars).size).toBe(chars.length)
    expect(chars).toEqual([...chars].sort())
    expect(planText([cyrillic])).toBe(text)
    expect(planText([plan({ ...cyrillic, title: 'лПан' })])).toBe(text)
  })

  it('always covers the export’s own wording, even with nothing to draw', () => {
    const text = planText([])
    for (const char of 'BRISTOL FORMULA STUDENT AI Status as of 0123456789 #+/·–…→') expect(text).toContain(char)
  })
})
