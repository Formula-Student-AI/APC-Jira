import { describe, expect, it } from 'vitest'
import { paginate, type PageSlice, type PaginateBlock } from './exportPaginate'

// Paper sizes: a group header is 18 pt with 4 pt above it, a task row 15 pt (25 when wrapped), a subtask 13.
const CONTINUED = 18

const header = (group: string): PaginateBlock => ({ kind: 'header', height: 18, gapBefore: 4, group })
const row = (group: string, height = 15): PaginateBlock => ({ kind: 'row', height, gapBefore: 0, group })
const parent = (group: string): PaginateBlock => ({ ...row(group), keepWithNext: true })
const group = (name: string, rows: number): PaginateBlock[] => [header(name), ...Array.from({ length: rows }, () => row(name))]

const indexes = (pages: PageSlice[]) => pages.map((page) => page.blocks.map((block) => block.index))
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('paginate', () => {
  it('always returns at least one page', () => {
    expect(paginate([], 300, 380, CONTINUED)).toEqual([{ continued: null, blocks: [], height: 0 }])
    expect(paginate([row('a')], 300, 380, CONTINUED)).toEqual([{ continued: null, blocks: [{ index: 0, y: 0 }], height: 15 }])
  })

  it('fills the first page to its own capacity and the others to theirs', () => {
    // Every row its own group, so only the capacities decide.
    const blocks = Array.from({ length: 13 }, (_, i) => row(`g${i}`, 10))
    const pages = paginate(blocks, 30, 50, CONTINUED)
    expect(indexes(pages)).toEqual([range(0, 2), range(3, 7), range(8, 12)])
    expect(pages[0].blocks.map((block) => block.y)).toEqual([0, 10, 20])
    expect(pages.map((page) => page.height)).toEqual([30, 50, 50])
    expect(pages.every((page) => page.continued === null)).toBe(true)
  })

  it('leaves out the gap above a header that starts a page', () => {
    const blocks = [...group('A', 2), ...group('B', 2)]
    const one = paginate(blocks, 100, 100, CONTINUED)
    expect(one.map((page) => page.blocks.map((block) => block.y))).toEqual([[0, 18, 33, 52, 70, 85]])
    expect(one[0].height).toBe(100)
    const two = paginate(blocks, 60, 60, CONTINUED)
    expect(indexes(two)).toEqual([range(0, 2), range(3, 5)])
    expect(two[1].blocks.map((block) => block.y)).toEqual([0, 18, 33])
  })

  it('moves a header without room for its first two rows to the next page', () => {
    const blocks = [...group('A', 2), ...group('B', 3)]
    // Room for B's header alone, then for its header and one row: either way B starts the next page.
    for (const capacity of [75, 90]) {
      const pages = paginate(blocks, capacity, capacity, CONTINUED)
      expect(indexes(pages)).toEqual([range(0, 2), range(3, 6)])
      expect(pages[1].continued).toBeNull()
    }
  })

  it('keeps a header with its first two rows, then breaks', () => {
    const pages = paginate([...group('A', 2), ...group('B', 6)], 105, 105, CONTINUED)
    expect(indexes(pages)).toEqual([range(0, 5), range(6, 9)])
    expect(pages[1]).toEqual({
      continued: 'B',
      blocks: [6, 7, 8, 9].map((index, i) => ({ index, y: CONTINUED + i * 15 })),
      height: CONTINUED + 4 * 15,
    })
  })

  it('never leaves a single row alone after a break: one more moves over, as long as two stay behind', () => {
    // Room for the header and four rows of five: the fourth goes over with the fifth.
    const pages = paginate(group('A', 5), 80, 80, CONTINUED)
    expect(indexes(pages)).toEqual([range(0, 3), [4, 5]])
    expect(pages[1].continued).toBe('A')
  })

  it('moves a whole group over when any split would leave a single row on one side', () => {
    const pages = paginate([...group('Z', 2), ...group('A', 3)], 105, 105, CONTINUED)
    expect(indexes(pages)).toEqual([range(0, 2), range(3, 6)])
    // A group that starts its page and still can't fit keeps two rows behind and sends one over.
    expect(indexes(paginate(group('A', 3), 50, 50, CONTINUED))).toEqual([[0, 1, 2], [3]])
  })

  it('never leaves a single row alone before a break', () => {
    // B has no header: its first row would end the page alone, so it moves over with the rest.
    const blocks = [...group('A', 3), ...Array.from({ length: 4 }, () => row('B'))]
    const pages = paginate(blocks, 80, 80, CONTINUED)
    expect(indexes(pages)).toEqual([range(0, 3), range(4, 7)])
    expect(pages[1].continued).toBeNull()
  })

  it('keeps a parent on the same page as its first subtask', () => {
    // The page fills up between the parent (4) and its first subtask (5), so the parent moves over too.
    const blocks = [header('A'), row('A'), row('A'), row('A'), parent('A'), row('A', 13), row('A', 13), row('A'), row('A')]
    const pages = paginate(blocks, 85, 100, CONTINUED)
    expect(indexes(pages)).toEqual([range(0, 3), range(4, 8)])
    expect(pages[1].continued).toBe('A')
  })

  it('starts each page inside a group with its continued header', () => {
    const pages = paginate(group('A', 30), 100, 100, CONTINUED)
    expect(indexes(pages)).toEqual([range(0, 5), range(6, 10), range(11, 15), range(16, 20), range(21, 25), range(26, 30)])
    expect(pages.map((page) => page.continued)).toEqual([null, 'A', 'A', 'A', 'A', 'A'])
    for (const page of pages.slice(1)) {
      expect(page.blocks[0].y).toBe(CONTINUED)
      expect(page.height).toBe(CONTINUED + 5 * 15)
    }
  })

  it('gives a block taller than a page a page to itself', () => {
    const pages = paginate([row('a', 10), row('b', 200), row('c', 10)], 100, 100, CONTINUED)
    expect(indexes(pages)).toEqual([[0], [1], [2]])
    expect(pages[1].height).toBe(200)
    // Inside a group, the pages either side of it still carry the group's continued header.
    const inGroup = paginate([header('A'), row('A'), row('A', 200), row('A')], 100, 100, CONTINUED)
    expect(indexes(inGroup)).toEqual([[0, 1], [2], [3]])
    expect(inGroup.map((page) => page.continued)).toEqual([null, 'A', 'A'])
    expect(inGroup[1]).toEqual({ continued: 'A', blocks: [{ index: 2, y: CONTINUED }], height: CONTINUED + 200 })
  })

  it('puts every block on exactly one page, in order, within capacity and keeping every rule', () => {
    // How often the rules came into play, so the cases can't quietly stop being tested.
    const seen = { continued: 0, split: 0, parentAtFoot: 0 }
    for (let seed = 1; seed <= 80; seed++) {
      const next = random(seed)
      const blocks = randomBlocks(next)
      const firstCapacity = 300 + Math.floor(next() * 80)
      const capacity = next() < 0.5 ? 380 : 620
      const pages = paginate(blocks, firstCapacity, capacity, CONTINUED)
      const context = `seed ${seed}`

      expect(indexes(pages).flat(), context).toEqual(range(0, blocks.length - 1))
      pages.forEach((page, p) => {
        const first = page.blocks[0].index
        const startsInside = p > 0 && blocks[first].kind === 'row' && blocks[first - 1].group === blocks[first].group
        expect(page.continued, context).toBe(startsInside ? blocks[first].group : null)
        let bottom = page.continued ? CONTINUED : 0
        page.blocks.forEach(({ index, y }, k) => {
          expect(y, context).toBe(k === 0 && !page.continued ? 0 : bottom + blocks[index].gapBefore)
          bottom = y + blocks[index].height
        })
        expect(page.height, context).toBe(bottom)
        expect(page.height, context).toBeLessThanOrEqual((p === 0 ? firstCapacity : capacity) + 1e-6)
      })

      const pageOf = new Map(pages.flatMap((page, p) => page.blocks.map((block) => [block.index, p] as const)))
      const rowsOfGroupOn = (name: string, p: number) => pages[p].blocks.filter(({ index }) => blocks[index].kind === 'row' && blocks[index].group === name).length
      blocks.forEach((block, index) => {
        const p = pageOf.get(index) ?? -1
        if (block.kind === 'header') {
          const rows = blocks.filter((other) => other.kind === 'row' && other.group === block.group).length
          expect(rowsOfGroupOn(block.group, p), `${context}: header ${index}`).toBeGreaterThanOrEqual(Math.min(2, rows))
        }
        const following = blocks[index + 1]
        if (block.keepWithNext && following?.kind === 'row' && following.group === block.group) {
          expect(pageOf.get(index + 1), `${context}: parent ${index}`).toBe(p)
          // A parent that would have ended a page had it not moved over with its subtask.
          if (pages[p].blocks[0].index === index && p > 0) seen.parentAtFoot++
        }
      })
      for (let p = 1; p < pages.length; p++) {
        if (pages[p].continued) seen.continued++
        const last = blocks[pages[p - 1].blocks[pages[p - 1].blocks.length - 1].index]
        const first = blocks[pages[p].blocks[0].index]
        if (first.kind !== 'row' || first.group !== last.group) continue
        seen.split++
        // A group split by this break keeps at least two rows on each side of it.
        expect(rowsOfGroupOn(first.group, p - 1), `${context}: before break ${p}`).toBeGreaterThanOrEqual(2)
        expect(rowsOfGroupOn(first.group, p), `${context}: after break ${p}`).toBeGreaterThanOrEqual(2)
      }
    }
    expect(Object.values(seen).every((count) => count > 0), JSON.stringify(seen)).toBe(true)
  })
})

/** Groups of rows as the layout makes them: mostly with headers, some wrapped rows, parents with subtasks. */
function randomBlocks(next: () => number): PaginateBlock[] {
  const blocks: PaginateBlock[] = []
  const groups = 1 + Math.floor(next() * 12)
  for (let g = 0; g < groups; g++) {
    const name = `g${g}`
    if (next() > 0.1) blocks.push(header(name))
    const rows = Math.floor(next() * 30)
    for (let r = 0; r < rows; r++) {
      if (next() < 0.15 && r < rows - 1) {
        blocks.push(parent(name), row(name, 13))
        r++
      } else blocks.push(row(name, next() < 0.2 ? 25 : 15))
    }
  }
  return blocks
}

/** A small seeded generator, so the random cases are the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}
