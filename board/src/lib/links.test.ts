import { describe, expect, it } from 'vitest'
import { datesClash, itemsBlockedBy, linkProblem, withBlocker, wouldLoop } from './links'

const node = (number: number, blocked_by: number[] = []) => ({ number, blocked_by })
// 3 waits on 2, 2 waits on 1; 4 is on its own.
const graph = new Map([node(1), node(2, [1]), node(3, [2]), node(4)].map((n) => [n.number, n]))

describe('withBlocker', () => {
  it('adds a number once, keeping the list sorted', () => {
    expect(withBlocker([5, 2], 3)).toEqual([2, 3, 5])
    expect(withBlocker([2, 3], 3)).toEqual([2, 3])
  })
})

describe('itemsBlockedBy', () => {
  it('lists the items that wait on a number, in number order', () => {
    expect(itemsBlockedBy([node(9, [1]), node(3, [1, 2]), node(4)], 1).map((n) => n.number)).toEqual([3, 9])
    expect(itemsBlockedBy([node(4)], 1)).toEqual([])
  })
})

describe('wouldLoop', () => {
  it('finds direct and indirect loops', () => {
    expect(wouldLoop(graph, 1, 2)).toBe(true) // 1 waiting on 2, but 2 waits on 1
    expect(wouldLoop(graph, 1, 3)).toBe(true) // 3 -> 2 -> 1
    expect(wouldLoop(graph, 3, 1)).toBe(false)
    expect(wouldLoop(graph, 4, 3)).toBe(false)
  })

  it('copes with loops already in the data', () => {
    const looped = new Map([node(1, [2]), node(2, [1])].map((n) => [n.number, n]))
    expect(wouldLoop(looped, 3, 1)).toBe(false)
  })
})

describe('linkProblem', () => {
  it('allows a new, loop-free link', () => {
    expect(linkProblem(graph, node(4), 3)).toBeNull()
  })

  it('explains each refusal', () => {
    expect(linkProblem(graph, node(4), 4)).toMatch(/itself/)
    expect(linkProblem(graph, node(4), 99)).toMatch(/no item #99/)
    expect(linkProblem(graph, node(3, [2]), 2)).toMatch(/already blocked/)
    expect(linkProblem(graph, node(1), 3)).toMatch(/loop/)
    expect(linkProblem(graph, node(0), 1)).toMatch(/still being created/)
  })
})

describe('datesClash', () => {
  const dated = (start_date: string | null, due_date: string | null) => ({ start_date, due_date })

  it('is true when the blocked item starts before the blocker ends', () => {
    expect(datesClash(dated('2026-11-01', '2026-11-10'), dated('2026-11-05', '2026-11-20'))).toBe(true)
  })

  it('allows starting on the day the blocker ends, or later', () => {
    expect(datesClash(dated('2026-11-01', '2026-11-10'), dated('2026-11-10', '2026-11-20'))).toBe(false)
    expect(datesClash(dated('2026-11-01', '2026-11-10'), dated('2026-11-12', null))).toBe(false)
  })

  it('uses whichever date an item has, and never clashes without dates', () => {
    expect(datesClash(dated('2026-11-10', null), dated(null, '2026-11-05'))).toBe(true)
    expect(datesClash(dated(null, null), dated('2026-11-05', null))).toBe(false)
  })
})
