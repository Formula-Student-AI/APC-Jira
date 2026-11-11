import { describe, expect, it } from 'vitest'
import { layoutDocument, paginateDocument } from './exportLayout'
import {
  fakeMeasure as measure,
  group,
  longPlan,
  makePlan,
  oddPlan,
  samplePlan,
  stepPlan,
  summaryPlan,
  task,
} from './exportLayout.fixtures'
import { CLASH_STROKE, LINK_STROKE } from './exportLayoutMarks'
import { paginate } from './exportPaginate'
import { INK, NEUTRAL } from './exportPalette'
import { A3, A4, SLIDE, slideScale, type SheetSpec } from './exportSheets'
import type { Plan, PlanKeyDate } from './planTypes'
import type { LinePrim, Measure, Page, Prim, TextPrim } from './scene'

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** The box a path's points span: its ends, a curve's control points, and the whole circle of a half-circle
 *  arc (the status icons' circles); smaller arcs stay inside the box of their ends. */
function pathBox(d: string): Box {
  const xs: number[] = []
  const ys: number[] = []
  let x = 0
  let y = 0
  let start = { x: 0, y: 0 }
  const visit = (px: number, py: number) => {
    x = px
    y = py
    xs.push(px)
    ys.push(py)
  }
  for (const [, command, list] of d.matchAll(/([MLHVCAZ])([^MLHVCAZ]*)/g)) {
    const args = list.trim() ? list.trim().split(/[\s,]+/).map(Number) : []
    for (const value of args) expect(Number.isFinite(value), `a number in ${d}`).toBe(true)
    if (command === 'M') start = { x: args[0], y: args[1] }
    if (command === 'M' || command === 'L') for (let i = 0; i < args.length; i += 2) visit(args[i], args[i + 1])
    if (command === 'H') for (const value of args) visit(value, y)
    if (command === 'V') for (const value of args) visit(x, value)
    if (command === 'C') {
      for (let i = 0; i < args.length; i += 6) {
        xs.push(args[i], args[i + 2])
        ys.push(args[i + 1], args[i + 3])
        visit(args[i + 4], args[i + 5])
      }
    }
    if (command === 'A') {
      for (let i = 0; i < args.length; i += 7) {
        const [r, ex, ey] = [args[i], args[i + 5], args[i + 6]]
        if (Math.hypot(ex - x, ey - y) > 2 * r - 0.05) {
          xs.push((x + ex) / 2 - r, (x + ex) / 2 + r)
          ys.push((y + ey) / 2 - r, (y + ey) / 2 + r)
        }
        visit(ex, ey)
      }
    }
    if (command === 'Z') visit(start.x, start.y)
  }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
}

/** Where a text prim's glyphs lie, by the fake measure: its width from its anchor, and from 0.75 of its size
 *  above the baseline to 0.25 below. */
function textBox(prim: TextPrim): Box {
  const width = measure(prim.text, prim)
  const left = prim.anchor === 'start' ? prim.x : prim.anchor === 'middle' ? prim.x - width / 2 : prim.x - width
  return { left, right: left + width, top: prim.y - 0.75 * prim.size, bottom: prim.y + 0.25 * prim.size }
}

/** The box a prim covers, its stroke included. */
function boxOf(prim: Prim): Box {
  const grow = (box: Box, by: number, across = true, down = true): Box => ({
    left: box.left - (across ? by : 0),
    right: box.right + (across ? by : 0),
    top: box.top - (down ? by : 0),
    bottom: box.bottom + (down ? by : 0),
  })
  switch (prim.kind) {
    case 'rect':
      return grow({ left: prim.x, right: prim.x + prim.w, top: prim.y, bottom: prim.y + prim.h }, (prim.stroke?.width ?? 0) / 2)
    case 'line': {
      const box = { left: Math.min(prim.x1, prim.x2), right: Math.max(prim.x1, prim.x2), top: Math.min(prim.y1, prim.y2), bottom: Math.max(prim.y1, prim.y2) }
      // A line's width lies across it, and its square ends stop where it does.
      return grow(box, prim.stroke.width / 2, prim.x1 === prim.x2 || prim.y1 !== prim.y2, prim.y1 === prim.y2 || prim.x1 !== prim.x2)
    }
    case 'path':
      return grow(pathBox(prim.d), (prim.stroke?.width ?? 0) / 2)
    case 'text':
      return textBox(prim)
    case 'image':
      return { left: prim.x, right: prim.x + prim.w, top: prim.y, bottom: prim.y + prim.h }
  }
}

/** Every number a prim holds, which must all be finite. */
function numbersOf(prim: Prim): number[] {
  switch (prim.kind) {
    case 'rect':
    case 'image':
      return [prim.x, prim.y, prim.w, prim.h]
    case 'line':
      return [prim.x1, prim.y1, prim.x2, prim.y2, prim.stroke.width]
    case 'path':
      return [...prim.d.matchAll(/-?[\d.]+(e-?\d+)?/g)].map((match) => Number(match[0]))
    case 'text':
      return [prim.x, prim.y, prim.size]
  }
}

const texts = (page: Page) => page.prims.filter((prim): prim is TextPrim => prim.kind === 'text')
const textsOf = (pages: Page[]) => pages.flatMap((page) => texts(page).map((prim) => prim.text))

/** The rules above the legend and the footer: full-width 0.5 pt lines in the rule grey. */
function rules(page: Page): LinePrim[] {
  return page.prims
    .filter((prim): prim is LinePrim => prim.kind === 'line' && prim.y1 === prim.y2 && prim.stroke.color === NEUTRAL.rule && prim.stroke.width === 0.5)
    .sort((a, b) => a.y1 - b.y1)
}

/** The legend's words: the text between the rule above it and the footer's rule. */
function legendTexts(page: Page): string[] {
  const [above, footer] = rules(page)
  if (!footer) return []
  return texts(page)
    .filter((prim) => prim.y > above.y1 && prim.y < footer.y1)
    .map((prim) => prim.text)
}

/** The item numbers on a page, '#124' as 124. */
const numbersOn = (page: Page) =>
  new Set(texts(page).flatMap((prim) => (/^#\d+$/.test(prim.text) && prim.family === 'mono' ? [Number(prim.text.slice(1))] : [])))

/** Dependency lines drawn on a page: stroked paths in a link's colour and width. */
const linksOn = (page: Page) =>
  page.prims.filter(
    (prim) =>
      prim.kind === 'path' &&
      prim.stroke !== undefined &&
      [LINK_STROKE, CLASH_STROKE].some((stroke) => stroke.color === prim.stroke?.color && stroke.width === prim.stroke?.width),
  )

const PLAN_YEAR_ROWS = { first: '2026-09-01', last: '2027-08-31' }

/** Documents that cover the shapes of the plan and everything odd about the data. */
function cases(): [string, Plan, SheetSpec][] {
  const plans: [string, Plan][] = [
    ['sample', samplePlan({ links: true, note: 'Updated after the October design review; chassis dates moved two weeks.' })],
    ['summary', summaryPlan()],
    ['empty', makePlan([], { leftOut: { outsidePeriod: 3, undated: 0, rolledUp: 0, archived: 0, keyDatesOutside: 0, phasesOutside: 0 } })],
    ['odd', oddPlan()],
    ['one day', samplePlan({ period: { first: '2026-11-10', last: '2026-11-10' }, groups: [group('m', 'Mechanical', 'BLUE', [task(1, 'Today', '2026-11-10', '2026-11-10')])] })],
    ['three months', samplePlan({ period: { first: '2026-11-01', last: '2027-01-31' }, links: true })],
    ['past', samplePlan({ period: { first: '2025-09-01', last: '2026-08-31' }, groups: [group('m', 'Mechanical', 'BLUE', [task(1, 'Late', '2026-05-01', '2026-06-01', { word: 'Overdue' })])] })],
    ['backwards period', samplePlan({ period: { first: '2027-03-01', last: '2027-01-01' } })],
    ['long', longPlan(140, { links: true, groups: 6 })],
  ]
  return plans.flatMap(([name, plan]) => [A4, A3, SLIDE].map((sheet): [string, Plan, SheetSpec] => [`${name} on ${sheet.id}`, plan, sheet]))
}

describe('layoutDocument', () => {
  it('keeps every prim inside its page, out of the margins, with only finite numbers', () => {
    for (const [name, plan, sheet] of cases()) {
      const { pages } = layoutDocument(plan, sheet, measure)
      expect(pages.length, name).toBeGreaterThan(0)
      const { top, right, bottom, left } = sheet.margin
      for (const [p, page] of pages.entries()) {
        expect([page.width, page.height], name).toEqual([sheet.width, sheet.height])
        for (const prim of page.prims) {
          const where = `${name}, page ${p + 1}: ${JSON.stringify(prim)}`
          for (const value of numbersOf(prim)) expect(Number.isFinite(value), where).toBe(true)
          const box = boxOf(prim)
          expect(box.left, where).toBeGreaterThanOrEqual(left - 0.01)
          expect(box.right, where).toBeLessThanOrEqual(sheet.width - right + 0.01)
          expect(box.top, where).toBeGreaterThanOrEqual(top - 0.01)
          expect(box.bottom, where).toBeLessThanOrEqual(sheet.height - bottom + 0.01)
        }
      }
    }
  })

  it('never lets two pieces of text overlap, in a row or anywhere else on the page', () => {
    for (const [name, plan, sheet] of cases()) {
      for (const [p, page] of layoutDocument(plan, sheet, measure).pages.entries()) {
        const boxes = texts(page).map((prim) => ({ prim, box: textBox(prim) }))
        for (let a = 0; a < boxes.length; a++) {
          for (let b = a + 1; b < boxes.length; b++) {
            const [one, two] = [boxes[a].box, boxes[b].box]
            const down = Math.min(one.bottom, two.bottom) - Math.max(one.top, two.top)
            const across = Math.min(one.right, two.right) - Math.max(one.left, two.left)
            expect(down > 0.5 && across > 0.05, `${name}, page ${p + 1}: “${boxes[a].prim.text}” and “${boxes[b].prim.text}”`).toBe(false)
          }
        }
      }
    }
  })

  it('lays out 500 rows, the longest plan, quickly and without trouble', () => {
    const plan = longPlan(500, { groups: 8, links: true })
    const started = performance.now()
    const { pages } = layoutDocument(plan, A4, measure)
    expect(performance.now() - started).toBeLessThan(5000)
    expect(pages.length).toBeGreaterThan(20)
    expect(new Set(pages.flatMap((page) => [...numbersOn(page)])).size).toBe(500)
  })

  it('draws the same pages every time for the same plan', () => {
    expect(layoutDocument(samplePlan(), A4, measure)).toEqual(layoutDocument(samplePlan(), A4, measure))
  })
})

describe('the legend', () => {
  const asOf = 'As of 10 Nov 2026'
  const one = (word: 'Not started' | 'Done' | 'Overdue' | 'At risk' | 'Blocked', number = 1) =>
    task(number, `Task ${number}`, '2026-10-01', '2026-12-01', { word, flags: { blocked: word === 'Blocked', overdue: word === 'Overdue', atRisk: word === 'At risk' } })

  it('lists only the subteams drawn and the markings used', () => {
    const plan = makePlan([group('m', 'Mechanical', 'BLUE', [one('Not started'), one('Not started', 2)]), group('e', 'Electrical', 'YELLOW', [])])
    const [page] = layoutDocument(plan, A4, measure).pages
    expect(legendTexts(page)).toEqual(['KEY', 'Mechanical', 'Not started', asOf])
  })

  it('adds a marking only when it appears, and no sentences defining them', () => {
    const done = makePlan([group('m', 'Mechanical', 'BLUE', [one('Not started'), one('Done', 2)])])
    expect(legendTexts(layoutDocument(done, A4, measure).pages[0])).toEqual(['KEY', 'Mechanical', 'Not started', 'Done', asOf])

    const late = makePlan([group('m', 'Mechanical', 'BLUE', [one('Overdue'), one('At risk', 2)])])
    const words = legendTexts(layoutDocument(late, A4, measure).pages[0])
    expect(words).toEqual(expect.arrayContaining(['Overdue', 'At risk']))
    expect(words.some((text) => text.startsWith('Overdue:') || text.startsWith('At risk:'))).toBe(false)
  })

  it('lists every marking of the sample board, on every page, and dependency lines only when they are drawn', () => {
    const { pages } = layoutDocument(samplePlan({ links: true }), A4, measure)
    const expected = [
      'Mechanical',
      'Electrical',
      'Autonomy',
      'Whole team',
      'Not started',
      'In progress',
      'Done',
      'Part done',
      'Blocked',
      'Overdue',
      'At risk',
      'Key date',
      'Key date done',
      'Phase',
      asOf,
      'Dependency',
      'Dates clash',
    ]
    for (const page of pages) expect(legendTexts(page).slice(1, expected.length + 1)).toEqual(expected)
    const without = legendTexts(layoutDocument(samplePlan(), A4, measure).pages[0])
    expect(without).not.toContain('Dependency')
    expect(without).not.toContain('Dates clash')
  })

  it('leaves out the as-of line when the as-of date is outside the period, and the fills a summary has no use for', () => {
    const later = layoutDocument(samplePlan({ asOf: '2027-11-10' }), A4, measure).pages[0]
    expect(legendTexts(later).some((text) => text.startsWith('As of'))).toBe(false)
    const words = legendTexts(layoutDocument(summaryPlan(), SLIDE, measure).pages[0])
    for (const fill of ['Not started', 'In progress', 'Done', 'Part done']) expect(words).not.toContain(fill)
    expect(words).toEqual(expect.arrayContaining(['Mechanical', 'Electrical', 'Autonomy', 'Key date', 'Phase', asOf]))
  })

  it('keeps every marking on a slide too, on a third line when it needs one', () => {
    const [page] = layoutDocument(samplePlan({ format: 'png', columns: { number: false, owner: false, dates: false, status: true } }), SLIDE, measure).pages
    const words = legendTexts(page)
    for (const marking of ['Key date done', 'Phase', asOf]) expect(words).toContain(marking)
  })
})

describe('the columns', () => {
  const geometry = (plan: Plan, sheet: SheetSpec = A4) => {
    const { frame } = paginateDocument(plan, sheet, measure)
    return { chartW: frame.chartW, gridRight: frame.gridRight, widths: Object.fromEntries(frame.columns.map((column) => [column.id, column.w])) }
  }
  const all = { number: true, owner: true, dates: true, status: true }

  it('give the width of every hidden column to the chart', () => {
    const full = geometry(samplePlan({ columns: all }))
    const bare = geometry(samplePlan({ columns: { number: false, owner: false, dates: false, status: false } }))
    expect(Object.keys(bare.widths)).toEqual(['task'])
    // A Dates column grown to keep its ranges on one line takes that room from Task; hidden, it gives it back.
    expect(bare.widths.task).toBeGreaterThanOrEqual(full.widths.task)
    const taskGain = (g: ReturnType<typeof geometry>) => g.widths.task - full.widths.task
    const hidden = full.widths.number + full.widths.owner + full.widths.dates + full.widths.status
    expect(bare.chartW - full.chartW + taskGain(bare)).toBeCloseTo(hidden, 6)
    for (const id of ['number', 'owner', 'dates', 'status'] as const) {
      const without = geometry(samplePlan({ columns: { ...all, [id]: false } }))
      expect(without.chartW - full.chartW + taskGain(without), id).toBeCloseTo(full.widths[id], 6)
      if (id !== 'dates') expect(taskGain(without), id).toBe(0)
    }
  })

  it('give the plan year the spec’s chart widths with every column, and draw the divider where the grid ends', () => {
    // Geist is narrower than the fake measure, so with it the Status and # columns keep the sheet's widths.
    const geist: Measure = (text, font) => measure(text, font) * 0.8
    const title = 'A title long enough to take the widest Task column there is, on A3 as well as on A4'
    const long = samplePlan({ groups: [group('m', 'Mechanical', 'BLUE', [task(124, title, '2026-10-01', '2026-11-01')])] })
    const a4 = paginateDocument(long, A4, geist).frame
    expect(a4.columns.map((column) => column.w)).toEqual([22, 190, 66, 64, 60])
    expect(a4.chartW).toBeCloseTo(841.89 - 56 - 402 - 8, 6)
    const a3 = paginateDocument(long, A3, geist).frame
    expect(a3.chartW).toBeCloseTo(1190.55 - 68 - 498 - 8, 6)
    // At 616 pt the plan year is under 2 pt a day, so it reads as years over months, as on A4.
    expect(a3.scale.tiers).toBe('years-months')
    expect(a4.scale.tiers).toBe('years-months')
    const [page] = layoutDocument(long, A4, geist).pages
    const divider = page.prims.find((prim) => prim.kind === 'line' && prim.x1 === prim.x2 && prim.stroke.color === NEUTRAL.year && prim.x1 < a4.chartX)
    expect(divider).toMatchObject({ x1: a4.gridRight })
  })

  it('never let an item number or status word outgrow its column', () => {
    const plan = longPlan(30)
    const { frame } = paginateDocument(plan, A4, measure)
    const [number, , , , status] = frame.columns
    expect(number.w).toBeGreaterThan(A4.cols.number)
    expect(number.w).toBeCloseTo(2 * A4.pad + measure('#1029', { family: 'mono', size: 7, weight: 400 }) * 1.03, 6)
    expect(status.w).toBeGreaterThanOrEqual(A4.cols.status)
  })

  it('heads each column, in summary mode with its own headings', () => {
    const headings = (plan: Plan, sheet: SheetSpec) =>
      texts(layoutDocument(plan, sheet, measure).pages[0])
        .filter((prim) => prim.family === 'mono' && /^[#A-Z]+$/.test(prim.text) && !['KEY', 'PHASES'].includes(prim.text))
        .map((prim) => prim.text)
    expect(headings(samplePlan({ columns: all }), A4)).toEqual(['#', 'TASK', 'OWNER', 'DATES', 'STATUS'])
    expect(headings(summaryPlan({ columns: all }), A4)).toEqual(['WORKSTREAM', 'LEAD', 'DATES', 'DONE', 'ISSUES'])
    expect(headings(summaryPlan(), SLIDE)).toEqual(['WORKSTREAM', 'DONE', 'ISSUES'])
  })

  it('measure the Task column from the longest title, within the sheet’s limits', () => {
    const short = geometry(samplePlan({ groups: [group('m', 'Mechanical', 'BLUE', [task(1, 'Jig', '2026-10-01', '2026-11-01')])] }))
    expect(short.widths.task).toBe(A4.cols.taskMin)
    const long = geometry(oddPlan())
    // At most taskMax, less whatever the Dates column grew by to keep its ranges on one line.
    expect(long.widths.dates).toBeGreaterThan(A4.cols.dates)
    expect(long.widths.task + (long.widths.dates - A4.cols.dates)).toBeCloseTo(A4.cols.taskMax, 6)
    const middling = geometry(samplePlan({ groups: [group('m', 'Mechanical', 'BLUE', [task(1, 'Chassis concept and frame layout v2', '2026-10-01', '2026-11-01')])] }))
    expect(middling.widths.task).toBeGreaterThan(A4.cols.taskMin)
    expect(middling.widths.task).toBeLessThan(A4.cols.taskMax)
  })
})

describe('slides', () => {
  /** The row step a slide was laid out at, from the stripes behind its rows (single-line task rows). */
  const stepOf = (page: Page) => {
    const heights = page.prims.flatMap((prim) => (prim.kind === 'rect' && prim.fill === NEUTRAL.zebra ? [prim.h] : []))
    expect(new Set(heights).size).toBe(1)
    return heights[0]
  }

  it('use the largest row step at which every row fits one slide, with type to match', () => {
    const steps = new Set<number>()
    let previous = Infinity
    // At least two rows in each of the three groups, so every slide has stripes to read the row step from.
    for (let rows = 6; rows <= 40; rows += 2) {
      const plan = stepPlan(rows)
      const fitting = (SLIDE.rowSteps ?? []).find((step) => paginateDocument(plan, slideScale(step), measure).slices.length === 1)
      const { pages } = layoutDocument(plan, SLIDE, measure)
      if (fitting === undefined) continue
      expect(pages, `${rows} rows`).toHaveLength(1)
      const step = stepOf(pages[0])
      expect(step, `${rows} rows`).toBe(fitting)
      expect(step, 'more rows never make the rows taller').toBeLessThanOrEqual(previous)
      previous = step
      steps.add(step)
      const title = texts(pages[0]).find((prim) => prim.text === 'Task 1')
      expect(title?.size).toBe(slideScale(step).type.task)
    }
    expect([...steps].sort((a, b) => b - a)).toEqual([20, 18, 16, 15, 14, 13])
  })

  it('become several slides at 18 pt, with continued groups, when even 13 pt rows do not fit', () => {
    const plan = stepPlan(60, 2)
    expect(paginateDocument(plan, slideScale(13), measure).slices.length).toBeGreaterThan(1)
    const { pages } = layoutDocument(plan, SLIDE, measure)
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) expect(stepOf(page)).toBe(18)
    expect(pages.map((page) => page.label.split(':')[0])).toEqual(pages.map((_, i) => `Slide ${i + 1} of ${pages.length}`))
    expect(textsOf(pages)).toEqual(expect.arrayContaining([`Slide 1 of ${pages.length}`, `Slide ${pages.length} of ${pages.length}`]))
    expect(textsOf(pages.slice(1)).some((text) => text.endsWith('(continued)'))).toBe(true)
  })

  it('number a single slide nowhere, and fit the whole summary plan on one', () => {
    const { pages } = layoutDocument(summaryPlan(), SLIDE, measure)
    expect(pages).toHaveLength(1)
    expect(textsOf(pages).some((text) => text.startsWith('Slide '))).toBe(false)
    expect(pages[0].label).toBe('Slide 1 of 1: Mechanical, Electrical and Autonomy, 32 tasks')
  })
})

describe('dependency lines', () => {
  it('join only rows on the same page, and the dialog is told how many could not be drawn', () => {
    const plan = longPlan(120, { links: true, groups: 3 })
    const { pages, notes } = layoutDocument(plan, A4, measure)
    expect(pages.length).toBeGreaterThan(2)
    const pageOf = new Map(pages.flatMap((page, p) => [...numbersOn(page)].map((number) => [number, p] as const)))
    let apart = 0
    pages.forEach((page, p) => {
      const together = plan.dependencies.filter((dependency) => pageOf.get(dependency.from) === p && pageOf.get(dependency.to) === p)
      expect(linksOn(page), `page ${p + 1}`).toHaveLength(together.length)
    })
    for (const dependency of plan.dependencies) if (pageOf.get(dependency.from) !== pageOf.get(dependency.to)) apart++
    expect(apart).toBeGreaterThan(0)
    expect(notes).toContain(`${apart} dependency lines join tasks on different pages and aren’t drawn.`)
  })

  it('are drawn dashed red where the dates clash, and not at all with the option off', () => {
    const { pages } = layoutDocument(samplePlan({ links: true }), A4, measure)
    const drawn = pages.flatMap(linksOn)
    expect(drawn.map((prim) => (prim.kind === 'path' ? prim.stroke?.dash ?? null : null))).toContain(null)
    const clash = samplePlan({ links: true, dependencies: [{ from: 103, to: 104, clash: true }] })
    expect(layoutDocument(clash, A4, measure).pages.flatMap(linksOn).map((prim) => (prim.kind === 'path' ? prim.stroke : null))).toEqual([CLASH_STROKE])
    const off = layoutDocument(samplePlan({ links: false }), A4, measure)
    expect(off.pages.flatMap(linksOn)).toEqual([])
    expect(off.notes).toEqual([])
  })
})

describe('pages', () => {
  it('number as many pages as the paginator makes, and each says so', () => {
    for (const plan of [makePlan([]), samplePlan(), longPlan(25), longPlan(100), longPlan(300, { groups: 7 })]) {
      for (const sheet of [A4, A3]) {
        const { frame, blocks, slices } = paginateDocument(plan, sheet, measure)
        expect(paginate(blocks, frame.firstCapacity, frame.capacity, frame.continuedHeight)).toEqual(slices)
        const { pages } = layoutDocument(plan, sheet, measure)
        expect(pages).toHaveLength(slices.length)
        pages.forEach((page, i) => {
          const footer = `Page ${i + 1} of ${pages.length}`
          expect(texts(page).map((prim) => prim.text)).toContain(footer)
          expect(page.label.startsWith(footer)).toBe(true)
        })
      }
    }
  })

  it('fit about as many rows as the spec expects, more on A3', () => {
    const count = (plan: Plan, sheet: SheetSpec) => layoutDocument(plan, sheet, measure).pages.length
    // The fake measure is wider than Geist, so more dates wrap and pages hold fewer rows than in a browser.
    const hundred = longPlan(100)
    expect(count(hundred, A4)).toBeGreaterThanOrEqual(5)
    expect(count(hundred, A4)).toBeLessThanOrEqual(8)
    expect(count(hundred, A3)).toBeLessThan(count(hundred, A4))
    const three = longPlan(300, { groups: 7 })
    expect(count(three, A4)).toBeGreaterThanOrEqual(14)
    expect(count(three, A4)).toBeLessThanOrEqual(24)
    expect(count(three, A3)).toBeLessThan(count(three, A4))
  })

  it('repeat the title block, timescale, lanes, legend and footer on every page, and the note on page 1 only', () => {
    const note = 'Updated after the October design review; chassis dates moved two weeks.'
    const { pages } = layoutDocument(longPlan(80, { groups: 2 }), A4, measure)
    const withNote = layoutDocument({ ...longPlan(80, { groups: 2 }), note }, A4, measure).pages
    expect(pages.length).toBeGreaterThan(2)
    for (const page of withNote) {
      const words = texts(page).map((prim) => prim.text)
      for (const fixed of ['BRISTOL FORMULA STUDENT AI', '2026–27 Plan', 'Status as of 10 November 2026', 'TASK', 'Sep', 'PHASES', 'KEY']) {
        expect(words).toContain(fixed)
      }
    }
    expect(texts(withNote[0]).map((prim) => prim.text)).toContain(note)
    expect(textsOf(withNote.slice(1))).not.toContain(note)
    const { frame } = paginateDocument({ ...longPlan(80, { groups: 2 }), note }, A4, measure)
    expect(frame.firstCapacity).toBeCloseTo(frame.capacity - 15, 6)
  })

  it('start a page inside a group with its continued header, with the same counts and summary bar', () => {
    const plan = makePlan([
      group(
        'm',
        'Mechanical',
        'BLUE',
        Array.from({ length: 40 }, (_, i) => task(100 + i, `Task ${i + 1}`, '2026-10-01', '2026-10-20')),
        { lead: 'Jane Smith' },
      ),
    ])
    const { pages } = layoutDocument(plan, A4, measure)
    expect(pages.length).toBeGreaterThan(1)
    const second = texts(pages[1])
    expect(second.map((prim) => prim.text)).toContain('Mechanical (continued)')
    expect(second.map((prim) => prim.text)).toContain('Lead: Jane Smith · 40 tasks')
    expect(pages[1].label).toBe(`Page 2 of ${pages.length}: Mechanical (continued), ${numbersOn(pages[1]).size} tasks`)
  })

  it('label each page for screen readers by its groups and tasks', () => {
    // With every date range on one line, the sample board fits one A4 page.
    expect(layoutDocument(samplePlan(), A4, measure).pages.map((page) => page.label)).toEqual([
      'Page 1 of 1: Mechanical, Electrical, Autonomy and Whole team, 13 tasks',
    ])
    const { pages } = layoutDocument(longPlan(40), A4, measure)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0].label).toMatch(new RegExp(`^Page 1 of ${pages.length}: .+, \\d+ tasks$`))
  })

  it('say why there is nothing to export, on one page with the title block, lanes and legend', () => {
    const plan = samplePlan({ groups: [], leftOut: { outsidePeriod: 4, undated: 0, rolledUp: 0, archived: 0, keyDatesOutside: 0, phasesOutside: 0 } })
    const { pages } = layoutDocument(plan, A4, measure)
    expect(pages).toHaveLength(1)
    expect(pages[0].label).toBe('Page 1 of 1: Nothing to export')
    const words = texts(pages[0]).map((prim) => prim.text)
    expect(words).toEqual(expect.arrayContaining(['Nothing to export', '2026–27 Plan', 'PHASES', 'KEY DATES', 'Design freeze', 'Page 1 of 1']))
    expect(words.join(' ')).toContain('outside this period')
    const undated = samplePlan({ groups: [], leftOut: { outsidePeriod: 0, undated: 2, rolledUp: 0, archived: 0, keyDatesOutside: 0, phasesOutside: 0 } })
    expect(textsOf(layoutDocument(undated, A4, measure).pages).join(' ')).toContain('list the tasks without dates')
  })

  it('read in order: the title block first, then headings, rows left to right, legend and footer', () => {
    const [page] = layoutDocument(samplePlan(), A4, measure).pages
    const words = texts(page).map((prim) => prim.text)
    expect(words[0]).toBe('BRISTOL FORMULA STUDENT AI')
    expect(words[words.length - 1]).toBe('Page 1 of 1')
    const at = (text: string) => words.indexOf(text)
    expect(at('Status as of 10 November 2026')).toBeLessThan(at('TASK'))
    expect(at('TASK')).toBeLessThan(at('PHASES'))
    expect(at('PHASES')).toBeLessThan(at('Mechanical'))
    expect(at('#101')).toBeLessThan(at('Chassis concept and frame layout'))
    expect(at('Chassis concept and frame layout')).toBeLessThan(at('Jane Smith'))
    expect(at('#103')).toBeGreaterThan(at('#101'))
    expect(at('KEY')).toBeGreaterThan(at('#202'))
  })
})

describe('the timescale and lanes', () => {
  const asOfPill = (page: Page) => page.prims.find((prim) => prim.kind === 'rect' && prim.fill === INK.brand && (prim.radius ?? 0) > 0)

  it('marks the as-of date with a pill and a line, and moves a year label the pill would cover', () => {
    const [page] = layoutDocument(samplePlan(), A4, measure).pages
    const pill = asOfPill(page)
    expect(pill).toBeDefined()
    expect(texts(page).map((prim) => prim.text)).toContain('As of 10 Nov')
    const year = texts(page).find((prim) => prim.text === '2026')
    // The pill sits on 10 Nov, where '2026' would be centred over Sep to Dec, so the year moves to its right.
    expect(year?.anchor).toBe('start')
    if (pill?.kind === 'rect' && year) expect(year.x).toBeGreaterThan(pill.x + pill.w)
    const asOfLines = page.prims.filter((prim) => prim.kind === 'line' && prim.stroke.color === INK.brand && prim.x1 === prim.x2)
    expect(asOfLines.length).toBeGreaterThan(0)
  })

  it('draws no as-of line outside the period, but still says what the status is as of', () => {
    const [page] = layoutDocument(samplePlan({ asOf: '2027-11-10' }), A4, measure).pages
    expect(asOfPill(page)).toBeUndefined()
    expect(page.prims.some((prim) => prim.kind === 'line' && prim.stroke.color === INK.brand && prim.x1 === prim.x2)).toBe(false)
    expect(texts(page).map((prim) => prim.text)).toContain('Status as of 10 November 2027')
  })

  it('stops the as-of line short of the names and labels in the lanes, so none is struck through', () => {
    // A key date a week before the as-of date, its label running across the line, and the current phase's name.
    const keyDates: PlanKeyDate[] = [{ id: 'k1', number: 901, title: 'Accumulator inspection sign-off', date: '2026-11-03', color: null, state: 'overdue' }]
    const plan = samplePlan({ keyDates })
    const { frame } = paginateDocument(plan, A4, measure)
    const [page] = layoutDocument(plan, A4, measure).pages
    const x = frame.chartX + (frame.asOfX ?? Number.NaN)
    const pieces = page.prims.filter((prim): prim is LinePrim => prim.kind === 'line' && prim.stroke.color === INK.brand && prim.x1 === x && prim.x2 === x)
    const across = texts(page).filter((prim) => {
      const box = textBox(prim)
      return box.left < x && x < box.right
    })
    expect(across.map((prim) => prim.text)).toEqual(expect.arrayContaining(['Accumulator inspection sign-off', 'Detailed design']))
    for (const prim of across) {
      const box = textBox(prim)
      for (const piece of pieces) expect(piece.y2 <= box.top || piece.y1 >= box.bottom, prim.text).toBe(true)
    }
    // The line picks up again below the words and runs on through the rows.
    expect(Math.max(...pieces.map((piece) => piece.y2))).toBeGreaterThan(frame.lanesBottom)
  })

  it('shortens key-date names that collide, and tells the dialog which', () => {
    // Five key dates in five days: one more than the lane's four lines.
    const bunched: PlanKeyDate[] = [
      'Chassis design review and sign-off',
      'Powertrain design review and sign-off',
      'Electrical design review',
      'Autonomy design review',
      'Braking design review and sign-off',
    ].map((title, i) => ({ id: `k${i}`, number: 900 + i, title, date: `2026-12-0${i + 1}`, color: null, state: 'upcoming' }))
    const { pages, notes } = layoutDocument(samplePlan({ keyDates: bunched }), A4, measure)
    // Every name that isn't shown whole in the lane is named in a note for the dialog, and no other.
    const shown = new Set(textsOf(pages.slice(0, 1)))
    const cut = bunched.map((keyDate) => keyDate.title).filter((title) => !shown.has(title))
    expect(cut.length).toBeGreaterThan(0)
    const note = notes.find((text) => text.startsWith('Key date'))
    expect(note).toBeDefined()
    for (const title of bunched.map((keyDate) => keyDate.title)) expect(note?.includes(`“${title}”`), title).toBe(cut.includes(title))
  })

  it('names the next key date after the period at the lane’s right edge', () => {
    const { frame } = paginateDocument(samplePlan(), A4, measure)
    expect(frame.after).toMatchObject({ name: 'FS UK 2028 entry', date: '1 Oct 2027' })
    const [page] = layoutDocument(samplePlan(), A4, measure).pages
    const note = texts(page).find((prim) => prim.text === '1 Oct 2027')
    expect(note && textBox(note).right).toBeLessThanOrEqual(frame.chartX + frame.chartW + 0.01)
  })

  it('shortens a next key date after the period too long for the chart, even on a line of its own', () => {
    const title = `FS UK 2028 Engineering Design Report, Cost Report and Business Plan submission deadline ${'(online portal) '.repeat(4)}`.trim()
    const afterPeriod: PlanKeyDate = { id: 'k999', number: 999, title, date: '2027-10-01', color: null, state: 'upcoming' }
    // With the sample's key dates the note takes a new line; with none, the first.
    for (const plan of [samplePlan({ afterPeriod }), samplePlan({ keyDates: [], afterPeriod })]) {
      const { frame } = paginateDocument(plan, A4, measure)
      expect(frame.after?.name.endsWith('…')).toBe(true)
      expect(frame.after?.x ?? -1).toBeGreaterThanOrEqual(0)
      const { pages, notes } = layoutDocument(plan, A4, measure)
      const name = texts(pages[0]).find((prim) => prim.text === frame.after?.name)
      expect(name && textBox(name).left).toBeGreaterThanOrEqual(frame.chartX)
      expect(notes.some((text) => text.startsWith('Key date') && text.includes(`“${title}”`))).toBe(true)
    }
  })

  it('outlines the current phase and packs overlapping phases into tiers', () => {
    const { frame } = paginateDocument(samplePlan(), A4, measure)
    expect(frame.phaseTiers).toBe(2)
    expect(frame.phases.filter((phase) => phase.now).map((phase) => phase.name)).toEqual(['Detailed design'])
    const [page] = layoutDocument(samplePlan(), A4, measure).pages
    const outlined = page.prims.filter((prim) => prim.kind === 'rect' && !prim.fill && prim.stroke?.color === INK.navy && prim.stroke.width === 0.75)
    expect(outlined).toHaveLength(1)
  })
})

describe('rows', () => {
  const page = () => layoutDocument(samplePlan(), A4, measure).pages[0]

  it('mark every state on its bar: hatch for Blocked, cap and trail for Overdue, triangle for At risk, chevron when cut off', () => {
    const prims = page().prims
    expect(prims.filter((prim) => prim.kind === 'line' && prim.stroke.color === INK.problem && prim.stroke.width === 0.5).length).toBeGreaterThan(5)
    expect(prims.some((prim) => prim.kind === 'line' && prim.stroke.dash?.join(' ') === '1 1.5')).toBe(true)
    expect(prims.some((prim) => prim.kind === 'path' && prim.fill === INK.amber)).toBe(true)
    expect(prims.some((prim) => prim.kind === 'path' && !prim.fill && /^M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+$/.test(prim.d))).toBe(true)
  })

  it('draw the slip of a task due before the period and still open in from the chart’s left edge', () => {
    // Next 3 months from 1 Nov: the caliper order was due on 28 Oct, so its bar is off the chart.
    const late = task(1, 'Brake caliper order', '2026-10-01', '2026-10-28', { word: 'Overdue' })
    const plan = makePlan([group('brakes', 'Braking System', 'RED', [late])], { period: { first: '2026-11-01', last: '2027-01-31' } })
    const { frame } = paginateDocument(plan, A4, measure)
    const view = frame.entries.map((entry) => entry.view).find((v) => v.kind === 'task')
    expect(view).toMatchObject({ bar: null, slipIn: true })
    const [page] = layoutDocument(plan, A4, measure).pages
    const near = (x: number) => x >= frame.chartX - 0.01 && x <= frame.chartX + 4
    // A red chevron on the chart's left edge, pointing back to where the bar is...
    const chevron = page.prims.find((prim) => prim.kind === 'path' && prim.stroke?.color === INK.problem && near(pathBox(prim.d).left) && near(pathBox(prim.d).right))
    expect(chevron).toBeDefined()
    // ...then the dotted slip trail on to the as-of line.
    const trail = page.prims.find((prim): prim is LinePrim => prim.kind === 'line' && prim.stroke.dash?.join(' ') === '1 1.5' && near(prim.x1))
    expect(trail?.stroke.color).toBe(INK.problem)
    expect(trail?.x2).toBeCloseTo(frame.chartX + (frame.asOfX ?? Number.NaN), 6)
    expect(texts(page).map((prim) => prim.text)).toContain('Brake caliper order')
  })

  it('leave the counts out of the title block, which says only what the status is as of, what is next and who prepared it', () => {
    const later = [task(1, 'Book venue', null, null, { word: 'Not started' }), task(2, 'Order hoodies', null, null, { word: 'Not started' })]
    const plan = makePlan([
      group('m', 'Mechanical', 'BLUE', [task(3, 'Frame CAD', '2026-10-05', '2026-11-04', { word: 'Overdue' })]),
      group('undated', 'Not yet scheduled', null, later, { undated: true, span: null }),
    ])
    for (const sheet of [A4, SLIDE]) {
      const { frame } = paginateDocument(plan, sheet, measure)
      const right = frame.titleBlock.right.map((line) => line.runs.map((run) => run.text).join(''))
      expect(right.join(' ')).not.toMatch(/\d+ tasks?\b|No tasks|No scheduled tasks|not yet scheduled|overdue/)
      expect(right).toEqual(sheet === A4 ? ['Status as of 10 November 2026', 'Prepared by Jane Smith'] : ['Status as of 10 November 2026'])
      // The rows still show both groups.
      expect(textsOf(layoutDocument(plan, sheet, measure).pages)).toEqual(expect.arrayContaining(['Frame CAD', 'Book venue']))
    }
  })

  it('set right-to-left names apart where words or numbers follow them', () => {
    const [FSI, PDI] = ['⁨', '⁩']
    const name = 'דנה לוי'
    const rows = [task(1, 'Frame CAD', '2026-10-05', '2026-12-04', { owner: `${name} +1` })]
    const nextKeyDate: PlanKeyDate = { id: 'k1', number: 1, title: 'סקירת תכן', date: '2026-12-15', color: null, state: 'upcoming' }
    const plan = makePlan([group('mech', 'Mechanical', 'BLUE', rows, { lead: name })], { nextKeyDate })
    const words = texts(layoutDocument(plan, A4, measure).pages[0]).map((prim) => prim.text)
    expect(words).toContain(`${FSI}${name}${PDI} +1`)
    expect(words.some((text) => text.startsWith(`Lead: ${FSI}${name}${PDI} · 1 task`))).toBe(true)
    expect(words).toContain(`Next key date: ${FSI}סקירת תכן${PDI}, 15 Dec 2026`)
    // Latin names are drawn as they are.
    const latin = texts(layoutDocument(samplePlan(), A4, measure).pages[0]).map((prim) => prim.text)
    expect(latin.some((text) => text.includes(FSI) || text.includes(PDI))).toBe(false)
  })

  it('wrap long titles to two lines, keep a parent’s count whole, and note a subtask shown without its parent', () => {
    const words = texts(page()).map((prim) => prim.text)
    // The long title takes two lines: its start on the first, the rest cut with '…' on the second.
    const first = words.findIndex((text) => text.startsWith('Wheel assembly drawings'))
    expect(first).toBeGreaterThanOrEqual(0)
    expect(words[first]).not.toMatch(/…$/)
    expect(words.some((text, i) => i > first && /uprights|hubs|car/.test(text) && text.endsWith('…'))).toBe(true)
    expect(words).toContain('3/5')
    expect(words.some((text) => text.startsWith('· part of'))).toBe(true)
  })

  it('show an owner shortened to fit, a dash for nobody, and dates broken after their dash', () => {
    const words = texts(page()).map((prim) => prim.text)
    expect(words.some((text) => /^Alexandra.* \+2$/.test(text))).toBe(true)
    expect(words).toContain('—')
    // The Dates column grows to keep ranges on one line; one too long even for its widest (a range across
    // years, starting before the period) breaks after its dash, never inside a date.
    const across = samplePlan({ groups: [group('m', 'Mechanical', 'BLUE', [task(1, 'Long lead parts', '2026-08-20', '2027-01-14')])] })
    const acrossWords = texts(layoutDocument(across, A4, measure).pages[0]).map((prim) => prim.text)
    expect(acrossWords).toContain('20 Aug 2026 –')
    expect(acrossWords).toContain('14 Jan 2027')
    for (const text of [...words, ...acrossWords]) expect(text).not.toMatch(/ – \d+$/)
  })

  it('stripe every other row in each group, the stripes restarting after each header', () => {
    const plan = samplePlan()
    const prims = layoutDocument(plan, A4, measure).pages[0].prims
    const stripes = prims.filter((prim) => prim.kind === 'rect' && prim.fill === NEUTRAL.zebra)
    const bands = prims.filter((prim) => prim.kind === 'rect' && prim.fill === NEUTRAL.groupBand)
    // Every group is on the one page: a band each, and every second row striped, counting afresh in each.
    expect(bands).toHaveLength(plan.groups.length)
    expect(stripes).toHaveLength(plan.groups.reduce((sum, g) => sum + Math.floor(g.rows.length / 2), 0))
  })
})

/** A page as a compact text: its size and label, how many prims of each kind, and its words line by line
 *  (each baseline's text in order across the page). */
function summarise(page: Page): string {
  const kinds = new Map<string, number>()
  for (const prim of page.prims) kinds.set(prim.kind, (kinds.get(prim.kind) ?? 0) + 1)
  const lines = new Map<number, TextPrim[]>()
  for (const prim of texts(page)) {
    const y = Math.round(prim.y * 10) / 10
    lines.set(y, [...(lines.get(y) ?? []), prim])
  }
  const rows = [...lines.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, list]) => `${y.toFixed(1).padStart(6)}  ${list.sort((a, b) => textBox(a).left - textBox(b).left).map((prim) => prim.text).join(' | ')}`)
  const counts = [...kinds.entries()].sort().map(([kind, n]) => `${kind} ${n}`).join(', ')
  return [`${page.label}`, `${page.width} × ${page.height} pt, ${page.prims.length} prims (${counts})`, ...rows, ''].join('\n')
}

describe('snapshots', () => {
  it('lays out page 1 of the sample board on A4', async () => {
    const plan = samplePlan({ links: true, note: 'Updated after the October design review; chassis dates moved two weeks.' })
    const [page] = layoutDocument(plan, A4, measure).pages
    await expect(summarise(page)).toMatchFileSnapshot('__snapshots__/exportLayout.a4.txt')
  })

  it('lays out the summary slide', async () => {
    const [page] = layoutDocument(summaryPlan(), SLIDE, measure).pages
    await expect(summarise(page)).toMatchFileSnapshot('__snapshots__/exportLayout.slide.txt')
  })
})

// The period these sample plans use, so a change to the fixtures shows up here first.
it('uses the plan year in the samples', () => {
  expect(samplePlan().period).toEqual(PLAN_YEAR_ROWS)
})
