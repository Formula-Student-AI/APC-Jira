// The three sheets the Timeline export lays out: A4 and A3 landscape for the PDF, and a 16:9 slide for
// images. All sizes are points (1/72 inch). Sheets print 0.5 mm shorter than their paper (the slide 1.5 pt,
// when Ctrl/Cmd+P prints slides), so rounding in the print engine never adds a blank page. A3 keeps A4's type
// sizes: it gives a wider chart and more rows, not a bigger A4.

export type SheetId = 'a4' | 'a3' | 'slide'

export interface TypeScale {
  /** BRISTOL FORMULA STUDENT AI above the title (mono, 600) */
  eyebrow: number
  /** The export's title (600, navy) */
  title: number
  /** Automatic subtitle and the note */
  subtitle: number
  /** "Status as of 10 November 2026" (600) */
  asOf: number
  /** Headline counts, next key date, prepared by */
  headline: number
  /** Column headings and lane names (mono, 600, upper case) */
  colHead: number
  /** Timescale: years (600), months (500), weeks and days */
  year: number
  month: number
  week: number
  /** Key-date labels (name 600, date 400) and phase names (600) */
  lane: number
  /** Group header: name (600, navy) and details */
  group: number
  groupDetail: number
  /** Task titles (500 for parents) and subtask titles */
  task: number
  subtask: number
  /** Owner, dates and status cells (warning words 600) */
  cell: number
  /** Item numbers (mono) */
  number: number
  /** Legend and footer text; the page number (600) */
  legend: number
  footer: number
  pageNo: number
}

export interface RowHeights {
  /** A task row, and one whose title or dates wrap to two lines */
  task: number
  taskWrapped: number
  subtask: number
  /** A group header band, and the gap above it */
  group: number
  groupGap: number
  /** Summary mode: a subteam row and a domain row */
  summarySubteam: number
  summaryDomain: number
}

export interface ColumnWidths {
  number: number
  owner: number
  dates: number
  status: number
  /** The Task column is measured from the longest title, within these limits */
  taskMin: number
  taskMax: number
  /** Summary mode: Done (4/12 with a small bar) and Issues */
  summaryDone: number
  summaryIssues: number
}

export interface SheetSpec {
  id: SheetId
  /** Page size in points */
  width: number
  height: number
  /** True size for print, e.g. '297mm' × '209.5mm'; @page size is the whole paper, e.g. '297mm 210mm' */
  cssWidth: string
  cssHeight: string
  pageSize: string
  margin: { top: number; right: number; bottom: number; left: number }
  type: TypeScale
  rows: RowHeights
  bar: { height: number; subtaskHeight: number; radius: number; minWidth: number }
  cols: ColumnWidths
  /** Height of one tier of the phases lane, and of one line of key-date labels */
  lanes: { phaseTier: number; keyDateLine: number }
  titleBlock: { height: number; logoHeight: number; logoWidth: number; gapAfter: number }
  /** Column headings and the two-tier timescale */
  scaleHeight: number
  /** One line of the legend */
  legendLine: number
  footerHeight: number
  /** Cell padding */
  pad: number
  /** Slides only: row heights to try, largest first; type sizes scale with the row (see slideScale) */
  rowSteps?: number[]
}

const PAPER_TYPE: TypeScale = {
  eyebrow: 6.5,
  title: 15,
  subtitle: 8,
  asOf: 8.5,
  headline: 7.5,
  colHead: 6.5,
  year: 7.5,
  month: 7,
  week: 6.5,
  lane: 7,
  group: 9,
  groupDetail: 7,
  task: 8,
  subtask: 7.5,
  cell: 7.5,
  number: 7,
  legend: 6.5,
  footer: 6.5,
  pageNo: 7,
}

const PAPER_ROWS: RowHeights = { task: 15, taskWrapped: 25, subtask: 13, group: 18, groupGap: 4, summarySubteam: 18, summaryDomain: 15 }

const PAPER_BAR = { height: 8, subtaskHeight: 6, radius: 1.5, minWidth: 3 }

export const A4: SheetSpec = {
  id: 'a4',
  width: 841.89,
  height: 593.86,
  cssWidth: '297mm',
  cssHeight: '209.5mm',
  pageSize: '297mm 210mm',
  margin: { top: 26, right: 28, bottom: 22, left: 28 },
  type: PAPER_TYPE,
  rows: PAPER_ROWS,
  bar: PAPER_BAR,
  cols: { number: 22, owner: 66, dates: 64, status: 60, taskMin: 140, taskMax: 190, summaryDone: 46, summaryIssues: 70 },
  lanes: { phaseTier: 12, keyDateLine: 11 },
  titleBlock: { height: 40, logoHeight: 30, logoWidth: 53, gapAfter: 8 },
  scaleHeight: 26,
  legendLine: 9,
  footerHeight: 9,
  pad: 4,
}

export const A3: SheetSpec = {
  ...A4,
  id: 'a3',
  width: 1190.55,
  height: 840.47,
  cssWidth: '420mm',
  cssHeight: '296.5mm',
  pageSize: '420mm 297mm',
  margin: { top: 30, right: 34, bottom: 26, left: 34 },
  cols: { number: 24, owner: 80, dates: 70, status: 64, taskMin: 180, taskMax: 260, summaryDone: 50, summaryIssues: 76 },
}

/** PowerPoint's widescreen slide, 960 × 540 pt, painted at 4 px per pt (3840 × 2160 px). */
export const SLIDE: SheetSpec = {
  id: 'slide',
  width: 960,
  height: 540,
  cssWidth: '960pt',
  cssHeight: '538.5pt',
  pageSize: '960pt 540pt',
  margin: { top: 24, right: 24, bottom: 24, left: 24 },
  type: PAPER_TYPE,
  rows: { task: 20, taskWrapped: 32, subtask: 17, group: 22, groupGap: 4, summarySubteam: 22, summaryDomain: 20 },
  bar: { height: 10, subtaskHeight: 8, radius: 2, minWidth: 4 },
  cols: { number: 28, owner: 96, dates: 88, status: 80, taskMin: 190, taskMax: 280, summaryDone: 60, summaryIssues: 92 },
  lanes: { phaseTier: 15, keyDateLine: 13 },
  titleBlock: { height: 34, logoHeight: 26, logoWidth: 46, gapAfter: 8 },
  scaleHeight: 30,
  legendLine: 11,
  footerHeight: 11,
  pad: 4,
  // The smaller steps let a summary of a whole plan (five subteams with their domains, about 22 rows) fit one
  // slide; text stays at 8 pt or more whatever the step.
  rowSteps: [20, 18, 16, 15, 14, 13],
}

/** Pixels per point when painting slides. */
export const SLIDE_PX_PER_PT = 4

export const SHEETS: Record<SheetId, SheetSpec> = { a4: A4, a3: A3, slide: SLIDE }

/** The smallest text allowed: 6.5 pt on paper, 8 pt on slides. */
export function minTextSize(sheet: SheetSpec): number {
  return sheet.id === 'slide' ? 8 : 6.5
}

/**
 * A slide's sheet at one row step: type at 1.25 × paper sizes for a 20 pt task row, scaling with the row
 * (never below 8 pt), and the other rows, the bars and the lanes in proportion (lanes keep room for 8 pt text).
 */
export function slideScale(step: number): SheetSpec {
  const k = (1.25 * step) / 20
  const size = (n: number) => Math.max(8, Math.round(n * k * 4) / 4)
  const half = (n: number) => Math.round(n * 2) / 2
  const type = Object.fromEntries(Object.entries(PAPER_TYPE).map(([key, value]) => [key, size(value)])) as unknown as TypeScale
  const rows: RowHeights = {
    task: step,
    taskWrapped: Math.round(step * 1.6),
    subtask: Math.round(step * 0.85),
    group: Math.round(step * 1.1),
    groupGap: 4,
    summarySubteam: Math.round(step * 1.1),
    summaryDomain: step,
  }
  // At the 20 pt step these are SLIDE's own sizes.
  const bar = { ...SLIDE.bar, height: half(step * 0.5), subtaskHeight: half(step * 0.4) }
  const lanes = { phaseTier: Math.max(11, Math.round(step * 0.75)), keyDateLine: Math.max(10.5, half(step * 0.65)) }
  return { ...SLIDE, type, rows, bar, lanes }
}
