// The Export dialog's preview as markup: the status line, the notices and their fixes, a problem instead of
// pages, white pages captioned and sized from their sheet, each slide's own buttons, and the alt text box.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExportPreview, type ExportPreviewProps, type SlideActions } from './ExportPreview'
import { A4, SLIDE } from './exportSheets'
import type { Page } from './scene'

const noop = () => undefined

const page = (n: number, of: number, size = A4): Page => ({
  width: size.width,
  height: size.height,
  label: `Page ${n} of ${of}: Mechanical, 4 tasks`,
  prims: [
    { kind: 'text', x: 28, y: 48, anchor: 'start', family: 'sans', size: 15, weight: 600, text: '<b>Plan</b> & co', color: '#160035' },
  ],
})

function render(patch: Partial<ExportPreviewProps> = {}): string {
  const props: ExportPreviewProps = {
    format: 'pdf',
    sheet: A4,
    pages: [page(1, 2), page(2, 2)],
    logoHref: null,
    ready: true,
    updating: false,
    problem: null,
    problemId: 'xp-problem',
    status: '2 pages, A4 landscape. 4 tasks in 1 subteam.',
    notices: [],
    noticesRef: { current: null },
    onFix: noop,
    slideActions: null,
    alt: null,
    ...patch,
  }
  return renderToStaticMarkup(createElement(ExportPreview, props))
}

const slideActions = (patch: Partial<SlideActions> = {}): SlideActions => ({
  canCopy: true,
  busy: null,
  disabled: false,
  onCopy: noop,
  onDownload: noop,
  ...patch,
})

describe('ExportPreview', () => {
  it('stacks the pages as paper sized from their sheet, each captioned', () => {
    const html = render()
    expect(html).toContain('<p class="xp-status" role="status">2 pages, A4 landscape. 4 tasks in 1 subteam.</p>')
    expect(html.match(/<li class="xp-page">/g)).toHaveLength(2)
    expect(html).toContain('<span>Page 1 of 2</span>')
    expect(html).toContain('style="aspect-ratio:841.89 / 593.86"')
    expect(html).toContain('role="img" aria-label="Page 2 of 2: Mechanical, 4 tasks"')
    // User text is drawn as text, never as markup.
    expect(html).toContain('&lt;b&gt;Plan&lt;/b&gt; &amp; co')
    expect(html).not.toContain('<b>')
  })

  it('offers Fit and 100% as pressed buttons', () => {
    const html = render()
    expect(html).toContain('role="group" aria-label="Preview size"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Fit</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>100%</)
  })

  it('lists the notices with their icons and one-click fixes', () => {
    const html = render({
      notices: [
        { kind: 'info', text: 'The filter is on: only matching tasks are shown.' },
        { kind: 'warning', text: 'This PDF runs to 24 pages.', fix: { label: 'Try A3', action: 'a3' }, id: 'xp-long' },
      ],
    })
    expect(html).toContain('<li class="xp-notice xp-notice-info">')
    expect(html).toContain('<li id="xp-long" class="xp-notice xp-notice-warning">')
    expect(html).toContain('octicon-info')
    expect(html).toContain('octicon-alert')
    expect(html).toContain('>Try A3</button>')
    expect(html).toContain('role="group" aria-label="Notes" tabindex="-1"')
  })

  it('shows a problem in place of the pages, for the actions to point at', () => {
    const html = render({ problem: "Couldn't lay out the export: no sheet" })
    expect(html).toContain('id="xp-problem" class="xp-problem" role="alert"')
    expect(html).toContain("Couldn&#x27;t lay out the export: no sheet")
    expect(html).not.toContain('xp-page')
    // Nothing to announce in the status line: the alert says it.
    expect(html).toContain('<p class="xp-status" role="status"></p>')
  })

  it('waits for the fonts and the logo before drawing', () => {
    for (const html of [render({ ready: false }), render({ pages: null })]) {
      expect(html).toContain('<p class="xp-status" role="status">Preparing the preview…</p>')
      expect(html).toContain('class="xp-preparing" aria-hidden="true"')
      expect(html).not.toContain('xp-page')
    }
  })

  it('gives each of several slides its own Copy and Download', () => {
    const slides = [page(1, 3, SLIDE), page(2, 3, SLIDE), page(3, 3, SLIDE)]
    const html = render({ format: 'png', sheet: SLIDE, pages: slides, slideActions: slideActions() })
    expect(html).toContain('<span>Slide 2 of 3</span>')
    expect(html).toContain('style="aspect-ratio:960 / 540"')
    expect(html.match(/aria-label="Copy slide \d of 3"/g)).toHaveLength(3)
    expect(html.match(/aria-label="Download slide \d of 3"/g)).toHaveLength(3)
    // Where images can't be copied, only Download; while one is made, the others wait.
    const busy = render({ format: 'png', sheet: SLIDE, pages: slides, slideActions: slideActions({ canCopy: false, busy: 'download-1' }) })
    expect(busy).not.toContain('Copy slide')
    expect(busy).toMatch(/aria-label="Download slide 2 of 3" aria-disabled="true" aria-busy="true"/)
    expect(busy).toMatch(/aria-label="Download slide 1 of 3" aria-disabled="true">/)
  })

  it('has no slide buttons for a single slide (the footer has them)', () => {
    const html = render({ format: 'png', sheet: SLIDE, pages: [page(1, 1, SLIDE)], slideActions: slideActions() })
    expect(html).not.toContain('Download slide')
  })

  it('comes with the alt text and its Copy button for images', () => {
    const alt = 'Gantt chart of the Bristol Formula Student AI 2026–27 Plan, Sep 2026 to Aug 2027.'
    const html = render({ format: 'png', sheet: SLIDE, pages: [page(1, 1, SLIDE)], alt: { text: alt, onCopy: noop } })
    expect(html).toContain('Alt text, to paste with the slide<')
    expect(html).toMatch(/<textarea[^>]*readOnly=""[^>]*>Gantt chart of the Bristol Formula Student AI 2026–27 Plan/)
    expect(html).toContain('Copy alt text</button>')
    expect(render({ alt: null })).not.toContain('xp-alt')
  })
})
