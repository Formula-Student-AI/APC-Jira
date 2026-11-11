// What the Timeline export's print portal (PrintPages.tsx) puts in place for printing: its print rules and
// the page's title. The rules go in the portal's own <style>, so they exist only while the Export dialog is
// open: CSS that comes with a lazy chunk stays in the document for good, so rules in export.css would hide
// the app, or change the paper size, in every later print. The title is what browsers offer as the PDF's name.

import { INK } from './exportPalette'
import type { SheetSpec } from './exportSheets'
import { cleanText, fitLine, wrapLines } from './exportText'
import type { FontSpec, Measure, Page, Prim } from './scene'

/** The heading of the sheet printed in place of the export when it can't be printed yet. */
export const CANT_PRINT = "Can't print the export yet"

/**
 * The one sheet the print portal holds when the export can't be printed yet (the fonts and logo still
 * loading, or a problem the dialog states): Ctrl/Cmd+P and File > Print go round the dialog's disabled button,
 * and this way they print why, rather than a blank page or pages measured before the fonts were ready.
 */
export function noticePage(sheet: SheetSpec, why: string, measure: Measure): Page {
  const head: FontSpec = { family: 'sans', size: 16, weight: 600 }
  const body: FontSpec = { family: 'sans', size: 11, weight: 400 }
  const width = Math.min(480, sheet.width - sheet.margin.left - sheet.margin.right)
  const centre = sheet.width / 2
  const top = sheet.height / 3
  const prims: Prim[] = [{ kind: 'text', x: centre, y: top, anchor: 'middle', ...head, text: fitLine(CANT_PRINT, width, head, measure), color: INK.navy }]
  wrapLines(cleanText(why), width, body, measure, 4).forEach((line, i) => {
    if (line) prims.push({ kind: 'text', x: centre, y: top + 26 + i * 16, anchor: 'middle', ...body, text: line, color: INK.text })
  })
  return { width: sheet.width, height: sheet.height, label: `${CANT_PRINT}: ${cleanText(why)}`, prims }
}

/**
 * The portal's CSS for one paper. Sizes are explicit mm, because Safari ignores the landscape keyword, and
 * the margins are zero, so Chrome and Edge have no room to add their own header and footer (the board's
 * address among them). Each sheet is 0.5 mm shorter than the paper and the last has no break after it, so
 * rounding never adds a blank page. Hidden on screen; when printing, only the sheets are shown.
 */
export function printCss(sheet: SheetSpec): string {
  return [
    `@page { size: ${sheet.pageSize}; margin: 0 }`,
    '@media screen { .xp-print { display: none } }',
    '@media print {',
    '  body > :not(.xp-print), dialog { display: none !important }',
    '  html, body { height: auto !important; overflow: visible !important; background: #fff !important }',
    '  .xp-print { display: block }',
    `  .xp-sheet { width: ${sheet.cssWidth}; height: ${sheet.cssHeight}; overflow: hidden; break-inside: avoid;` +
      ' break-after: page; page-break-after: always }',
    '  .xp-sheet:last-child { break-after: auto; page-break-after: auto }',
    '  .xp-sheet > svg { display: block }',
    '  .xp-print * { print-color-adjust: exact; -webkit-print-color-adjust: exact }',
    '}',
  ].join('\n')
}

// The title before printing began, while the export's file name stands in for it.
let savedTitle: string | null = null

/**
 * Shows `title` as the page's title for printing. The click and beforeprint can both call it: the title
 * kept to put back is the one from before the first call.
 */
export function setPrintTitle(title: string): void {
  if (savedTitle === null) savedTitle = document.title
  document.title = title
}

/** Puts back the title from before printing (after printing, or when the dialog closes mid-print). */
export function restoreTitle(): void {
  if (savedTitle === null) return
  document.title = savedTitle
  savedTitle = null
}
