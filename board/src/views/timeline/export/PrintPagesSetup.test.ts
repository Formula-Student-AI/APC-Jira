// The print portal's rules (true mm sizes, no margins, nothing else printed, nothing leaking onto the screen)
// and the title swap that names the PDF.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { A3, A4 } from './exportSheets'
import { printCss, restoreTitle, setPrintTitle } from './PrintPagesSetup'

describe('printCss', () => {
  it('sizes the paper in mm with no margins, and each sheet 0.5 mm short of it', () => {
    const a4 = printCss(A4)
    expect(a4).toContain('@page { size: 297mm 210mm; margin: 0 }')
    expect(a4).toContain('.xp-sheet { width: 297mm; height: 209.5mm; overflow: hidden; break-inside: avoid;')
    const a3 = printCss(A3)
    expect(a3).toContain('@page { size: 420mm 297mm; margin: 0 }')
    expect(a3).toContain('.xp-sheet { width: 420mm; height: 296.5mm;')
  })

  it('hides the pages on screen, and everything but the pages in print', () => {
    const css = printCss(A4)
    expect(css).toContain('@media screen { .xp-print { display: none } }')
    const print = css.slice(css.indexOf('@media print {'))
    expect(print).toContain('body > :not(.xp-print), dialog { display: none !important }')
    expect(print).toContain('html, body { height: auto !important; overflow: visible !important; background: #fff !important }')
    expect(print).toContain('.xp-print { display: block }')
    // A break after every sheet but the last, so there is never a blank page at the end.
    expect(print).toContain('break-after: page; page-break-after: always')
    expect(print).toContain('.xp-sheet:last-child { break-after: auto; page-break-after: auto }')
    expect(print).toContain('.xp-print * { print-color-adjust: exact; -webkit-print-color-adjust: exact }')
  })

  it('keeps every rule but @page inside a media query, so nothing leaks into the app on screen', () => {
    const css = printCss(A4)
    // Outside the two media blocks there is only @page.
    const outside = css.replace(/@media screen \{[^\n]*\}\n/, '').replace(/@media print \{[\s\S]*\}$/, '')
    expect(outside.trim()).toBe('@page { size: 297mm 210mm; margin: 0 }')
    // Braces balance.
    expect(css.split('{').length).toBe(css.split('}').length)
  })
})

describe('the print title', () => {
  afterEach(() => {
    restoreTitle()
    vi.unstubAllGlobals()
  })

  it('shows the file name while printing, then puts the old title back once', () => {
    const doc = { title: 'Bristol FSAI Board' }
    vi.stubGlobal('document', doc)
    const name = 'Bristol FSAI 2026-27 Plan - Timeline - 2026-11-10'
    setPrintTitle(name)
    expect(doc.title).toBe(name)
    // The click and beforeprint both set it; the title kept is still the one from before printing.
    setPrintTitle(name)
    restoreTitle()
    expect(doc.title).toBe('Bristol FSAI Board')
    doc.title = 'Changed since'
    restoreTitle()
    expect(doc.title).toBe('Changed since')
  })

  it('does nothing when there is no title to put back', () => {
    const doc = { title: 'Bristol FSAI Board' }
    vi.stubGlobal('document', doc)
    restoreTitle()
    expect(doc.title).toBe('Bristol FSAI Board')
  })
})
