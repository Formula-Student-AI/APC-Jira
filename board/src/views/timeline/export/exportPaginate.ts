// Splitting the export's rows into pages, so every page count is known before anything is drawn. Each page is
// filled until a block doesn't fit; the break then moves back to the latest point that keeps every rule. Only
// a page that can't keep them all (rows taller than half a page) has them relaxed, one at a time, so the
// paginator always finishes.

export interface PaginateBlock {
  kind: 'header' | 'row'
  /** The block's own height in points */
  height: number
  /** Space above a group header, left out when the header starts a page */
  gapBefore: number
  /** The group it belongs to (a header and its rows share it) */
  group: string
  /** A parent row whose next row (its first subtask) must stay on the same page */
  keepWithNext?: boolean
}

export interface PlacedBlock {
  /** Index into the blocks */
  index: number
  /** Top of the block, from the top of the page's body */
  y: number
}

export interface PageSlice {
  /** The group carried on from the previous page: a "(continued)" header of continuedHeight at y = 0 */
  continued: string | null
  blocks: PlacedBlock[]
  /** Height used, including any continued header */
  height: number
}

/** Allowance when adding up heights, so rounding never pushes a row that fits onto the next page */
const EPS = 1e-6

/**
 * How strictly a break is judged, from 0 (every rule) up: each level lets go of one more rule, in this
 * order: a single row after a break, a single row before it, a header's first two rows, a parent's first
 * subtask. A header is left alone at the foot of a page only if it and its first row can't share any page.
 */
const LEVELS = 5

/**
 * Splits blocks into pages: the first page holds `firstCapacity` points of body, later ones `capacity`.
 * Rules: a block never splits; a header needs room for itself and its first two rows (or all of its rows
 * if fewer), or it moves to the next page; no single row of a group is left alone on either side of a break
 * (one more row moves over, as long as two stay behind); a keepWithNext row stays with its next row; a page
 * that starts inside a group begins with that group's continued header (`continuedHeight`). A block taller
 * than a whole page gets a page to itself. Always returns at least one page.
 */
export function paginate(blocks: PaginateBlock[], firstCapacity: number, capacity: number, continuedHeight: number): PageSlice[] {
  const count = blocks.length
  if (!count) return [{ continued: null, blocks: [], height: 0 }]

  // Each block's run: a group's header and the rows under it (or rows of a group with no header). A header
  // always starts a new run. For each block: where its run starts, how many of the run's rows come before
  // it, and how many rows the run has.
  const runStart: number[] = []
  const rowsBefore: number[] = []
  const runRows: number[] = []
  for (let first = 0; first < count; ) {
    let end = first + 1
    while (end < count && blocks[end].kind === 'row' && blocks[end].group === blocks[first].group) end++
    let rows = 0
    for (let k = first; k < end; k++) {
      runStart.push(first)
      rowsBefore.push(rows)
      if (blocks[k].kind === 'row') rows++
    }
    for (let k = first; k < end; k++) runRows.push(rows)
    first = end
  }
  const tall = (k: number) => blocks[k].height > capacity + EPS

  /** Whether a page that began at block `start` may end just before block `b`, at a level of strictness. */
  const mayBreak = (b: number, start: number, level: number): boolean => {
    // Breaks around a block taller than a page are always needed, and breaks between groups split nothing.
    if (tall(b - 1) || tall(b) || runStart[b] !== runStart[b - 1]) return true
    const run = runStart[b]
    const headerHere = blocks[run].kind === 'header' && run >= start
    // The run's rows on this page before the break, and those after it.
    const before = rowsBefore[b] - rowsBefore[Math.max(start, run)]
    const after = runRows[b] - rowsBefore[b]
    if (headerHere && before === 0) return false
    if (level < 4 && blocks[b - 1].keepWithNext) return false
    if (level < 3 && headerHere && before < Math.min(2, before + after)) return false
    if (level < 2 && before === 1) return false
    if (level < 1 && after === 1) return false
    return true
  }

  const pages: PageSlice[] = []
  for (let start = 0; start < count; ) {
    const room = pages.length ? capacity : firstCapacity
    const continued = blocks[start].kind === 'row' && runStart[start] < start ? blocks[start].group : null
    // Lay blocks out from the top until one doesn't fit. The first always goes on, so a page is never empty.
    const tops: number[] = []
    let bottom = continued ? continuedHeight : 0
    let end = start
    while (end < count) {
      const block = blocks[end]
      const top = end === start && !continued ? 0 : bottom + block.gapBefore
      if (end > start && (tall(end) || top + block.height > room + EPS)) break
      tops.push(top)
      bottom = top + block.height
      end++
      if (tall(end - 1)) break
    }
    // Move the break back to the latest place that keeps the rules, at the strictest level that has one.
    let cut = end
    if (end < count) {
      cut = -1
      for (let level = 0; level < LEVELS && cut < 0; level++) {
        for (let b = end; b > start && cut < 0; b--) if (mayBreak(b, start, level)) cut = b
      }
      if (cut < 0) cut = end
    }
    const placed = tops.slice(0, cut - start).map((y, k) => ({ index: start + k, y }))
    const last = placed[placed.length - 1]
    pages.push({ continued, blocks: placed, height: last.y + blocks[last.index].height })
    start = cut
  }
  return pages
}
