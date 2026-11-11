// The Timeline export's layout: turns a plan into pages of shapes for one sheet. Order of work: the
// columns (Task measured from the longest title), the chart width, the timescale, the lane tiers and the
// legend lines (all fixed for the whole document), the page capacities, pagination, then the shapes of each
// page in reading order and its label for screen readers. Never reads the clock or the DOM.
// exportLayoutFrame.ts works out everything the pages share and the rows as blocks, exportPaginate.ts splits
// the blocks into pages, and exportLayoutPage.ts draws each page.

import { buildFrame, type Frame } from './exportLayoutFrame'
import type { TaskView } from './exportLayoutGrid'
import { drawPage } from './exportLayoutPage'
import { paginate, type PageSlice, type PaginateBlock } from './exportPaginate'
import { slideScale, type SheetSpec } from './exportSheets'
import type { Plan } from './planTypes'
import type { Measure, Page } from './scene'

export interface DocumentLayout {
  pages: Page[]
  /** Things the dialog should mention, e.g. 'Shortened to fit: “Chassis design review and sign-off”' or
   *  '3 dependency lines join tasks on different pages and aren't drawn.' */
  notes: string[]
}

/** The row step slides fall back to, over several slides, when even the smallest step doesn't fit one. */
const SEVERAL_SLIDES_STEP = 18

/** A document's frame and its rows split into pages, before anything is drawn. */
export interface Pagination {
  frame: Frame
  blocks: PaginateBlock[]
  slices: PageSlice[]
}

/** The frame and pages for `sheet` exactly as given (a slide at the sheet's own row step, without fitting). */
export function paginateDocument(plan: Plan, sheet: SheetSpec, measure: Measure): Pagination {
  const frame = buildFrame(plan, sheet, measure)
  const blocks = frame.entries.map((entry) => entry.block)
  return { frame, blocks, slices: paginate(blocks, frame.firstCapacity, frame.capacity, frame.continuedHeight) }
}

/** The largest of `steps` at which every row fits one slide; failing that, several slides at 18 pt. */
function fitSlides(plan: Plan, steps: readonly number[], measure: Measure): Pagination {
  const largestFirst = steps.filter((step) => Number.isFinite(step) && step > 0).sort((a, b) => b - a)
  for (const step of largestFirst) {
    const pagination = paginateDocument(plan, slideScale(step), measure)
    if (pagination.slices.length <= 1) return pagination
  }
  return paginateDocument(plan, slideScale(SEVERAL_SLIDES_STEP), measure)
}

const lines = (n: number) => (n === 1 ? '1 dependency line' : `${n} dependency lines`)

/** What the dialog should say about dependency lines that aren't drawn: between rows on different pages, or
 *  with an end the period cuts off. */
function linkNotes({ frame, slices }: Pagination): string[] {
  if (!frame.plan.links) return []
  const placed = new Map<number, { page: number; view: TaskView }>()
  slices.forEach((slice, page) => {
    for (const block of slice.blocks) {
      const view = frame.entries[block.index].view
      if (view.kind === 'task' && view.bar) placed.set(view.row.number, { page, view })
    }
  })
  let apart = 0
  let outside = 0
  for (const dependency of frame.plan.dependencies) {
    const from = placed.get(dependency.from)
    const to = placed.get(dependency.to)
    if (!from || !to || dependency.from === dependency.to) continue
    if (from.page !== to.page) apart++
    else if (from.view.bar?.cutRight || to.view.bar?.cutLeft) outside++
  }
  const notes: string[] = []
  const where = frame.noun === 'Slide' ? 'slides' : 'pages'
  if (apart > 0) {
    notes.push(`${lines(apart)} ${apart === 1 ? 'joins' : 'join'} tasks on different ${where} and ${apart === 1 ? 'isn’t' : 'aren’t'} drawn.`)
  }
  if (outside > 0) {
    notes.push(`${lines(outside)} ${outside === 1 ? 'reaches' : 'reach'} past the period and ${outside === 1 ? 'isn’t' : 'aren’t'} drawn.`)
  }
  return notes
}

/**
 * Pages for `plan` on `sheet` (A4, A3 or the slide). For the slide it tries sheet.rowSteps largest first
 * (slideScale) and uses the largest at which every row fits one slide; if even the smallest doesn't fit, the
 * export becomes several slides at 18 pt with continued groups. With nothing to show it returns one page with
 * the title block, lanes and 'Nothing to export' with the reason.
 */
export function layoutDocument(plan: Plan, sheet: SheetSpec, measure: Measure): DocumentLayout {
  const pagination = sheet.rowSteps?.length ? fitSlides(plan, sheet.rowSteps, measure) : paginateDocument(plan, sheet, measure)
  const { frame, slices } = pagination
  const pages = slices.map((slice, index) => drawPage(frame, slice, index, slices.length))
  return { pages, notes: [...frame.notes, ...linkNotes(pagination)] }
}
