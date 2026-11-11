// The Export dialog's options as markup: the controls in the spec's order, counts in the labels, options that
// don't apply disabled with their reason, every hint linked, and no form (so Enter in a text box never prints).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExportOptions, type ExportOptionsProps } from './ExportOptions'
import { defaultSettings, type ExportSettings } from './exportSettings'

const noop = () => undefined

function render(patch: Partial<ExportOptionsProps> = {}): string {
  const props: ExportOptionsProps = {
    settings: defaultSettings(),
    note: '',
    preparedBy: 'Jane Smith',
    scope: 'From the Timeline as it is now: All subteams. Change these with the subteam buttons and the filter box.',
    pageCounts: { a4: 3, a3: 2, a2: 1 },
    periodLabels: {
      plan: 'Whole plan (Sep 2026 – Aug 2027)',
      next3: 'Next 3 months (Nov 2026 – Jan 2027)',
      next6: 'Next 6 months (Nov 2026 – Apr 2027)',
    },
    months: [
      { value: '2026-09', label: 'Sep 2026' },
      { value: '2026-10', label: 'Oct 2026' },
      { value: '2026-11', label: 'Nov 2026' },
    ],
    counts: { subtasks: 12, undated: 7 },
    phone: false,
    onChange: noop,
    onChooseMonths: noop,
    onNote: noop,
    onPreparedBy: noop,
    ...patch,
  }
  return renderToStaticMarkup(createElement(ExportOptions, props))
}

const withSettings = (patch: Partial<ExportSettings>) => render({ settings: { ...defaultSettings(), ...patch } })

/** The opening tag of the <input> whose label holds `label`. */
function inputFor(html: string, label: string): string {
  const at = html.indexOf(`<span>${label}</span>`)
  expect(at).toBeGreaterThan(-1)
  const start = html.lastIndexOf('<input', at)
  return html.slice(start, html.indexOf('>', start) + 1)
}

/** The first <input> tag that has `attribute` (whatever order the attributes come in). */
function inputWith(html: string, attribute: string): string {
  const tag = [...html.matchAll(/<input[^>]*>/g)].map((match) => match[0]).find((input) => input.includes(attribute))
  expect(tag).toBeDefined()
  return tag ?? ''
}

describe('ExportOptions', () => {
  it('puts the scope first, then the fieldsets in order', () => {
    const html = render()
    expect(html.indexOf('From the Timeline as it is now')).toBeLessThan(html.indexOf('<fieldset'))
    const legends = [...html.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((match) => match[1])
    expect(legends).toEqual(['Format', 'Paper', 'Rows', 'Period', 'Columns', 'Also include', 'Title block'])
    expect(html).not.toContain('<form')
  })

  it('starts focus on the checked format, a radio card', () => {
    const pdf = render()
    expect(pdf.match(/data-autofocus/g)).toHaveLength(1)
    expect(inputWith(pdf, 'data-autofocus="true"')).toMatch(/type="radio".*checked=""/)
    const png = withSettings({ format: 'png' })
    expect(png.match(/data-autofocus/g)).toHaveLength(1)
    expect(png.indexOf('data-autofocus')).toBeGreaterThan(png.indexOf('To email or print'))
  })

  it('labels the papers with their page counts, or none while unknown', () => {
    const html = render()
    expect(html).toContain('<span>A4 · 3 pages</span>')
    expect(html).toContain('<span>A3 · 2 pages</span>')
    expect(html).toContain('<span>A2 · 1 page</span>')
    expect(render({ pageCounts: { a4: 1, a3: null, a2: null } })).toContain('<span>A4 · 1 page</span>')
    expect(render({ pageCounts: { a4: 1, a3: null, a2: null } })).toContain('<span>A3</span>')
  })

  it('shows the fixed image size instead of the papers for an image', () => {
    const html = withSettings({ format: 'png' })
    expect(html).toContain('16:9 slide, 3840 × 2160 px')
    expect(html).not.toContain('A4 · 3 pages')
  })

  it('puts the counts in the labels and links each hint to its control', () => {
    const html = render()
    expect(html).toContain('<span>Subtasks, under their task (12)</span>')
    expect(html).toContain('<span>Tasks without dates, listed last (7)</span>')
    expect(html).toContain('<span>Whole plan (Sep 2026 – Aug 2027)</span>')
    const owner = inputFor(html, 'Owner')
    const hint = /aria-describedby="([^"]+)"/.exec(owner)?.[1]
    expect(hint).toBeTruthy()
    expect(html).toContain(`id="${hint}" class="xp-hint">Exports can be forwarded: check names before sending outside the team.`)
    // No hint points at nothing.
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]))
    for (const match of html.matchAll(/aria-describedby="([^"]+)"/g)) {
      for (const id of match[1].split(' ')) expect(ids.has(id)).toBe(true)
    }
  })

  it('switches the columns for one row per domain and disables what no longer applies', () => {
    const html = withSettings({ pdf: { ...defaultSettings().pdf, rows: 'summary' } })
    expect(inputFor(html, '# (item number)')).toContain('disabled=""')
    expect(html).toContain('<span>Lead</span>')
    expect(html).toContain('<span>Done and Issues</span>')
    expect(html).toContain('Workstream is always shown.')
    // No counts on options that don't apply, and the reason beside them.
    expect(inputFor(html, 'Subtasks, under their task')).toContain('disabled=""')
    expect(inputFor(html, 'Dependency lines')).toContain('disabled=""')
    expect(html).toContain('Only with Every task.')
  })

  it('lists tasks without dates only for a PDF', () => {
    const html = withSettings({ format: 'png', png: { ...defaultSettings().png, rows: 'tasks' } })
    expect(inputFor(html, 'Tasks without dates, listed last')).toContain('disabled=""')
    expect(html).toContain('Only in a PDF.')
    expect(inputFor(html, 'Subtasks, under their task (12)')).not.toContain('disabled')
  })

  it('shows the month selects for chosen months, with remembered months kept', () => {
    const html = withSettings({ period: { preset: 'months', from: '2025-01', to: '2026-10' } })
    expect(html).toContain('<option value="2025-01" selected="">Jan 2025</option>')
    expect(html).toContain('<option value="2026-10" selected="">Oct 2026</option>')
    expect(html).not.toContain('role="alert"')
    expect(render()).not.toContain('<select')
  })

  it('says when the end month comes before the start month', () => {
    const html = withSettings({ period: { preset: 'months', from: '2026-11', to: '2026-09' } })
    expect(html).toContain('role="alert">The end month must be on or after the start month.</p>')
    expect(html).toMatch(/<select[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]+"/)
  })

  it('limits the text boxes and suggests an image on a phone', () => {
    const html = render({ note: 'Chassis dates moved two weeks.' })
    expect(inputWith(html, 'maxLength="80"')).toContain('placeholder="2026–27 Plan"')
    expect(inputWith(html, 'maxLength="140"')).toContain('value="Chassis dates moved two weeks."')
    expect(inputWith(html, 'maxLength="60"')).toContain('value="Jane Smith"')
    expect(html).not.toContain('On a phone')
    expect(render({ phone: true })).toContain('On a phone, an image is the easiest to share.')
  })
})
