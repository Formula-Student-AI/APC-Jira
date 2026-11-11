// Splitting the export's rows into pages, so every page count is known before anything is drawn. packPages
// keeps each subteam whole on a page where it fits, gives a subteam taller than a page pages of its own, and
// packs the rest together, in as few pages as it can. paginate lays out a run of rows that is too tall for one
// page: each page is filled until a block doesn't fit, and the break then moves back to the latest point that
// keeps every rule. Only a page that can't keep them all (rows taller than half a page) has them relaxed, one
// at a time, so the paginator always finishes.

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

/** A group's blocks (its header and its rows), blocks first to end - 1, in board order `order`. */
interface Run {
  order: number
  key: string
  first: number
  end: number
  /** Its height when it starts a page, and the space above it when it follows another group */
  height: number
  gap: number
}

/** A page being packed: groups kept whole, after a big group's last rows when `own` holds its pages. */
interface Bin {
  capacity: number
  used: number
  runs: Run[]
  /** A group taller than a page: its pages, laid out by paginate, the last of them this bin's page */
  own: PageSlice[] | null
  /** Where the page goes: the board order of its first group (a big group's own, whatever joins it) */
  key: number
}

/** Places a run's blocks on a page from `top`, with the space above it when it follows something. */
function placeRun(blocks: PaginateBlock[], run: Run, top: number, follows: boolean): { placed: PlacedBlock[]; bottom: number } {
  const placed: PlacedBlock[] = []
  let bottom = top
  for (let k = run.first; k < run.end; k++) {
    const y = k === run.first && !follows ? top : bottom + blocks[k].gapBefore
    placed.push({ index: k, y })
    bottom = y + blocks[k].height
  }
  return { placed, bottom }
}

/**
 * Pages for the blocks with each group (a subteam's header and rows) kept whole where it fits a page, so a
 * big subteam gets pages of its own and small ones share, in few, well-filled pages:
 * - a group taller than its page starts a new page and runs on over as many as it needs (paginate's rules,
 *   with its continued header), and the room left on its last page is open to others;
 * - every other group stays whole, packed tallest first onto the page it fills best (the one it leaves the
 *   least room on), or a new one; `lastGroup` (Not yet scheduled) is kept at the very end.
 * Pages follow the board order of their first group, a big group's pages together, so the first group's page
 * comes first and has the first page's room (`firstCapacity`, less with a note); within a page, groups keep
 * board order after a continued one. Always returns at least one page.
 */
export function packPages(
  blocks: PaginateBlock[],
  firstCapacity: number,
  capacity: number,
  continuedHeight: number,
  lastGroup: string | null = null,
): PageSlice[] {
  if (!blocks.length) return [{ continued: null, blocks: [], height: 0 }]
  const runs: Run[] = []
  for (let first = 0; first < blocks.length; ) {
    let end = first + 1
    while (end < blocks.length && blocks[end].group === blocks[first].group) end++
    const height = placeRun(blocks, { order: 0, key: '', first, end, height: 0, gap: 0 }, 0, false).bottom
    runs.push({ order: runs.length, key: blocks[first].group, first, end, height, gap: blocks[first].gapBefore })
    first = end
  }
  const tooTall = (run: Run, room: number) =>
    run.height > room + EPS || blocks.slice(run.first, run.end).some((block) => block.height > capacity + EPS)
  /** A group laid out over pages of its own, starting on a page with `room`. */
  const ownPages = (run: Run, room: number): Bin => {
    const own = paginate(blocks.slice(run.first, run.end), room, capacity, continuedHeight).map((slice) => ({
      ...slice,
      blocks: slice.blocks.map((block) => ({ index: block.index + run.first, y: block.y })),
    }))
    return { capacity: own.length === 1 ? room : capacity, used: own[own.length - 1].height, runs: [], own, key: run.order }
  }

  const last = lastGroup !== null && runs.length > 1 && runs[runs.length - 1].key === lastGroup ? runs[runs.length - 1] : null
  const packable = runs.filter((run) => run !== last)
  const bins: Bin[] = []
  const firstRun = packable[0]
  const small: Run[] = []
  for (const run of packable) {
    const room = run === firstRun ? firstCapacity : capacity
    if (tooTall(run, room)) bins.push(ownPages(run, room))
    else if (run === firstRun) bins.push({ capacity: firstCapacity, used: run.height, runs: [run], own: null, key: run.order })
    else small.push(run)
  }
  // Tallest first, each onto the page it fills best.
  small.sort((a, b) => b.height - a.height || a.order - b.order)
  for (const run of small) {
    let best: Bin | null = null
    let bestLeft = Infinity
    for (const bin of bins) {
      const left = bin.capacity - (bin.used + (bin.used > 0 ? run.gap : 0) + run.height)
      if (left >= -EPS && left < bestLeft - EPS) {
        best = bin
        bestLeft = left
      }
    }
    if (best) {
      best.used += (best.used > 0 ? run.gap : 0) + run.height
      best.runs.push(run)
      if (!best.own) best.key = Math.min(best.key, run.order)
    } else bins.push({ capacity, used: run.height, runs: [run], own: null, key: run.order })
  }
  bins.sort((a, b) => a.key - b.key)

  // Not yet scheduled goes at the very end: on the last page if it fits there, else a page (or pages) of its own.
  if (last) {
    const tail = bins[bins.length - 1]
    const room = bins.length ? capacity : firstCapacity
    if (tail && !tooTall(last, capacity) && tail.used + last.gap + last.height <= tail.capacity + EPS) {
      tail.used += last.gap + last.height
      tail.runs.push(last)
    } else if (!tooTall(last, room)) bins.push({ capacity: room, used: last.height, runs: [last], own: null, key: last.order })
    else bins.push(ownPages(last, room))
  }

  const pages: PageSlice[] = []
  for (const bin of bins) {
    const runsInOrder = [...bin.runs].sort((a, b) => a.order - b.order)
    let continued: string | null = null
    let placed: PlacedBlock[] = []
    let bottom = 0
    if (bin.own) {
      pages.push(...bin.own.slice(0, -1))
      const tail = bin.own[bin.own.length - 1]
      continued = tail.continued
      placed = [...tail.blocks]
      bottom = tail.height
    }
    for (const run of runsInOrder) {
      const next = placeRun(blocks, run, bottom, placed.length > 0)
      placed.push(...next.placed)
      bottom = next.bottom
    }
    pages.push({ continued, blocks: placed, height: bottom })
  }
  return pages
}
