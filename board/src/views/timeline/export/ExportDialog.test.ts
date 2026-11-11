// The whole Export dialog rendered once, as markup, with the board, the plan and the layout faked: a failed
// layout is a plain notice rather than a crash, the print portal holds the pages the preview shows (the
// slides while Image is chosen) or one sheet saying why it can't print yet, the actions say why they're off,
// and the print rules live in the portal's own <style>.

import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlanInput } from './exportPlan'
import { SETTINGS_KEY, defaultSettings, type ExportSettings } from './exportSettings'
import type { SheetSpec } from './exportSheets'
import type { Plan, PlanTaskRow } from './planTypes'
import type { FontSpec, Page } from './scene'

const fake = vi.hoisted(() => ({
  plan: null as Plan | null,
  planError: null as Error | null,
  /** Pages laid out for each sheet */
  pages: { a4: 3, a3: 2, slide: 1 } as Record<string, number>,
  inputs: [] as PlanInput[],
  /** The fonts and the logo have loaded */
  ready: true,
}))

vi.mock('../../../store/board', () => ({
  useBoard: (select: (state: unknown) => unknown) => select({ items: {}, options: [], members: {}, live: 'live' }),
  pushToast: () => undefined,
}))
vi.mock('../../../store/hooks', () => ({
  useMe: () => ({ username: 'js12345', full_name: 'Jane Smith', email: '', github_login: null, is_board_admin: false, active: true, created_at: '' }),
}))
vi.mock('./exportPlan', () => ({
  buildPlan: (input: PlanInput) => {
    fake.inputs.push(input)
    if (fake.planError || !fake.plan) throw fake.planError ?? new Error('no plan')
    return { ...fake.plan, format: input.format, mode: input.settings[input.format].rows }
  },
}))
vi.mock('./exportLayout', () => ({
  layoutDocument: (_plan: Plan, sheet: SheetSpec) => ({
    pages: Array.from({ length: fake.pages[sheet.id] }, (_, index): Page => ({
      width: sheet.width,
      height: sheet.height,
      label: `${sheet.id} page ${index + 1}`,
      prims: [{ kind: 'text', x: 30, y: 40, anchor: 'start', family: 'sans', size: 15, weight: 600, text: 'Plan', color: '#160035' }],
    })),
    notes: ['Shortened to fit: “Chassis design review and sign-off”'],
  }),
}))
vi.mock('./useExportAssets', () => ({
  useExportAssets: () => ({
    ready: fake.ready,
    version: 0,
    measure: (text: string, font: FontSpec) => [...text].length * font.size * 0.55,
    logoHref: null,
    logoBitmap: null,
  }),
}))
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  // Rendered in place, so the portal's markup can be read.
  createPortal: (children: ReactNode) => children,
}))

const { ExportDialog } = await import('./ExportDialog')

function taskRow(number: number): PlanTaskRow {
  return {
    kind: 'task', id: `id-${number}`, number, title: `Task ${number}`, nested: false, partOf: null, progress: null,
    start: '2026-10-01', due: '2026-10-20', word: 'Not started', stage: 'Not started',
    flags: { blocked: false, overdue: false, atRisk: false }, owner: 'Jane Smith', color: 'BLUE',
  }
}

function plan(patch: Partial<Plan> = {}): Plan {
  return {
    format: 'pdf', mode: 'tasks', org: 'Bristol Formula Student AI', orgShort: 'Bristol FSAI', title: '2026–27 Plan',
    subtitle: 'Timeline · All subteams · Sep 2026 – Aug 2027', asOf: '2026-11-10', exportedAt: '2026-11-10T14:32:00.000Z',
    preparedBy: 'Jane Smith', note: '', period: { first: '2026-09-01', last: '2027-08-31' },
    columns: { number: true, owner: true, dates: true, status: true }, links: false,
    groups: [
      {
        key: 'Mechanical', name: 'Mechanical', color: 'BLUE', lead: '', counts: { tasks: 2, done: 0, blocked: 0, overdue: 0, atRisk: 0 },
        span: { start: '2026-10-01', end: '2026-10-20' }, rows: [taskRow(1), taskRow(2)], undated: false,
      },
    ],
    keyDates: [], nextKeyDate: null, afterPeriod: null, phases: [], subteams: [{ name: 'Mechanical', color: 'BLUE' }],
    counts: { tasks: 2, done: 0, inProgress: 0, notStarted: 2, blocked: 0, overdue: 0, atRisk: 0 },
    leftOut: { outsidePeriod: 0, undated: 0, rolledUp: 0, archived: 0, keyDatesOutside: 0, phasesOutside: 0 },
    notices: [{ kind: 'info', text: 'The filter is on: only the tasks it matches are exported.' }],
    dependencies: [], scope: { subteams: [], filtered: false, query: '' }, ...patch,
  }
}

function render(settings?: Partial<ExportSettings>): string {
  // The portal's target; the portal itself is rendered in place.
  vi.stubGlobal('document', { body: {} })
  if (settings) {
    const stored = JSON.stringify({ ...defaultSettings(), ...settings })
    vi.stubGlobal('localStorage', { getItem: (key: string) => (key === SETTINGS_KEY ? stored : null), setItem: () => undefined })
  }
  return renderToStaticMarkup(
    createElement(ExportDialog, { items: [], shownTeams: ['Mechanical'], query: 'brake', today: '2026-11-10', onClose: () => undefined }),
  )
}

/** The opening tag of the dialog's primary action. */
const primary = (html: string) => /<button[^>]*class="btn btn-primary"[^>]*>/.exec(html)?.[0] ?? ''

afterEach(() => {
  fake.plan = null
  fake.planError = null
  fake.pages = { a4: 3, a3: 2, slide: 1 }
  fake.inputs = []
  fake.ready = true
  vi.unstubAllGlobals()
})

describe('ExportDialog', () => {
  it('says plainly when the export can’t be laid out, and keeps the actions off', () => {
    fake.planError = new Error('exportPlan.buildPlan: not written yet')
    const html = render()
    expect(html).toContain('<h2')
    expect(html).toContain('Export timeline')
    expect(html).toMatch(/class="xp-problem" role="alert">.*Couldn&#x27;t lay out the export: exportPlan.buildPlan: not written yet/)
    const button = primary(html)
    expect(button).toContain('aria-disabled="true"')
    const problemId = /id="([^"]+)" class="xp-problem"/.exec(html)?.[1]
    expect(button).toContain(problemId)
    // Ctrl/Cmd+P and File > Print go round the disabled button: they print one sheet saying why, not a blank page.
    expect(html).toContain('<div class="xp-print"><style>@page { size: 297mm 210mm; margin: 0 }')
    expect(html.match(/class="xp-sheet"/g)).toHaveLength(1)
    const portal = html.slice(html.indexOf('<div class="xp-print">'))
    expect(portal).toContain('Can&#x27;t print the export yet')
    expect(portal).toContain('Couldn&#x27;t lay out the export: exportPlan.buildPlan: not written yet')
  })

  it('prints a sheet saying the fonts are still loading, rather than pages measured without them', () => {
    fake.plan = plan()
    fake.ready = false
    const html = render()
    expect(primary(html)).toContain('aria-disabled="true"')
    expect(html).toContain('Preparing…</button>')
    const portal = html.slice(html.indexOf('<div class="xp-print">'))
    expect(portal.match(/class="xp-sheet"/g)).toHaveLength(1)
    expect(portal).toContain('Can&#x27;t print the export yet')
    expect(portal).toContain('The fonts and the logo are still loading.')
  })

  it('shows the PDF pages in the preview and holds the same pages in the print portal', () => {
    fake.plan = plan()
    const html = render()
    expect(html).toContain('From the Timeline as it is now: Mechanical · filter “brake”.')
    expect(html).toContain('<span>A4 · 3 pages</span>')
    expect(html).toContain('<span>A3 · 2 pages</span>')
    expect(html.match(/<li class="xp-page">/g)).toHaveLength(3)
    expect(html.match(/<div class="xp-sheet"><svg[^>]*width="297mm" height="209.5mm"/g)).toHaveLength(3)
    expect(html).toMatch(/role="status">3 pages, A4 landscape\. [^<]* 2 notes to check\.<\/p>/)
    // The plan's notice and the layout's note.
    expect(html).toContain('The filter is on: only the tasks it matches are exported.')
    expect(html).toContain('Shortened to fit: “Chassis design review and sign-off”')
    const button = primary(html)
    expect(button).not.toContain('aria-disabled')
    expect(html).toContain('Print or save as PDF…</button>')
    // Not Chrome or Edge (the tests run in node), so the hint asks for headers and footers to be unticked.
    expect(html).toContain('Leave Margins on Default. Untick Print headers and footers.')
    // The plan is for the Timeline's own subteams, filter and date.
    expect(fake.inputs[0]).toMatchObject({ shownTeams: ['Mechanical'], query: 'brake', today: '2026-11-10', format: 'pdf', connected: true })
  })

  it('prints A3 pages on A3 paper', () => {
    fake.plan = plan()
    const html = render({ paper: 'a3' })
    expect(html).toContain('@page { size: 420mm 297mm; margin: 0 }')
    expect(html.match(/<div class="xp-sheet"><svg[^>]*width="420mm" height="296.5mm"/g)).toHaveLength(2)
  })

  it('prints the slides the preview shows while Image is chosen, on 16:9 pages', () => {
    fake.plan = plan()
    const html = render({ format: 'png' })
    expect(html).toContain('Download PNG</button>')
    expect(html).toContain('<span>Slide 1 of 1</span>')
    expect(html).toContain('16:9 slide, 3840 × 2160 px')
    expect(html).toContain('Copy alt text</button>')
    // Copying images isn't possible here (no ClipboardItem), so Copy image is left out.
    expect(html).not.toContain('Copy image')
    // Ctrl/Cmd+P prints what is previewed: the slide, not the PDF's pages (with columns Image may leave out).
    expect(html).toContain('@page { size: 960pt 540pt; margin: 0 }')
    expect(html.match(/<div class="xp-sheet"><svg[^>]*width="960pt" height="538.5pt"/g)).toHaveLength(1)
    expect(html).not.toMatch(/<div class="xp-sheet"><svg[^>]*width="297mm"/)
    expect(fake.inputs.map((input) => input.format).sort()).toEqual(['pdf', 'png'])
  })

  it('makes several slides, each with its own buttons, and offers one row per domain', () => {
    fake.plan = plan()
    fake.pages = { a4: 3, a3: 2, slide: 3 }
    const html = render({ format: 'png', png: { ...defaultSettings().png, rows: 'tasks' } })
    expect(html).toContain('Download 3 PNGs</button>')
    expect(html.match(/aria-label="Download slide \d of 3"/g)).toHaveLength(3)
    expect(html).toContain('>Use one row per domain</button>')
    // Chrome and Edge ask before letting a page download the second file.
    expect(html).toContain('if your browser asks, allow this site to download multiple files.')
    expect(html.match(/<div class="xp-sheet"><svg[^>]*width="960pt"/g)).toHaveLength(3)
  })

  it('suggests A3 past 20 A4 pages', () => {
    fake.plan = plan()
    fake.pages = { a4: 24, a3: 14, slide: 1 }
    const html = render()
    expect(html).toContain('This PDF runs to 24 pages.')
    expect(html).toContain('>Try A3</button>')
  })

  it('points the actions at the reason when there is nothing to export', () => {
    fake.plan = plan({ groups: [] })
    const html = render()
    const notice = /<li id="([^"]+)" class="xp-notice xp-notice-warning">.*?Nothing to export/.exec(html)
    expect(notice).not.toBeNull()
    const button = primary(html)
    expect(button).toContain('aria-disabled="true"')
    expect(button).toContain(notice?.[1] ?? 'missing')
  })

  it('opens on the whole plan when remembered months are the wrong way round', () => {
    fake.plan = plan()
    const html = render({ period: { preset: 'months', from: '2027-03', to: '2026-12' } })
    expect(html).toMatch(/<input type="radio" name="[^"]+-period" checked=""\/><span>Whole plan/)
    expect(fake.inputs.length).toBeGreaterThan(0)
    for (const input of fake.inputs) expect(input.settings.period).toEqual({ preset: 'plan' })
  })

  it('remembers the title and Prepared by, but starts the note empty', () => {
    fake.plan = plan()
    render({ title: 'Sponsor update, November', preparedBy: 'Chassis team' })
    expect(fake.inputs[0].settings).toMatchObject({ title: 'Sponsor update, November', preparedBy: 'Chassis team' })
    expect(fake.inputs[0].note).toBe('')
  })
})
