import { describe, expect, it } from 'vitest'
import { datesClash, itemsBlockedBy, linkProblem, linkTypeProblem, relatedNumbers, withNumber, wouldLoop } from './links'

const node = (number: number, blocked_by: number[] = []) => ({ number, blocked_by })
// 3 waits on 2, 2 waits on 1; 4 is on its own.
const graph = new Map([node(1), node(2, [1]), node(3, [2]), node(4)].map((n) => [n.number, n]))

describe('withNumber', () => {
  it('adds a number once, keeping the list sorted', () => {
    expect(withNumber([5, 2], 3)).toEqual([2, 3, 5])
    expect(withNumber([2, 3], 3)).toEqual([2, 3])
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

describe('relatedNumbers', () => {
  it('shows a relation on both items, whichever one keeps it', () => {
    const items = [
      { number: 1, related_to: [2] },
      { number: 2, related_to: [] },
      { number: 3, related_to: [1, 1] },
    ]
    expect(relatedNumbers(items, items[0])).toEqual([2, 3])
    expect(relatedNumbers(items, items[1])).toEqual([1])
    expect(relatedNumbers(items, items[2])).toEqual([1])
  })
})

describe('linkTypeProblem', () => {
  const linkable = (number: number, blocked_by: number[] = [], related_to: number[] = []) => ({ number, blocked_by, related_to })
  // 2 waits on 1; 3 relates to 4.
  const board = new Map([linkable(1), linkable(2, [1]), linkable(3, [], [4]), linkable(4)].map((n) => [n.number, n]))

  it('checks "is blocked by" and "blocks" from the right side', () => {
    expect(linkTypeProblem(board, board.get(4)!, 'blocked_by', 1)).toBeNull()
    expect(linkTypeProblem(board, board.get(1)!, 'blocked_by', 2)).toMatch(/loop/)
    expect(linkTypeProblem(board, board.get(2)!, 'blocks', 1)).toMatch(/loop/) // 1 waiting on 2
    expect(linkTypeProblem(board, board.get(1)!, 'blocks', 2)).toMatch(/already blocked/)
    expect(linkTypeProblem(board, board.get(1)!, 'blocks', 4)).toBeNull()
  })

  it('refuses a second relation between the same two items, from either side', () => {
    expect(linkTypeProblem(board, board.get(4)!, 'relates', 3)).toMatch(/already relates/)
    expect(linkTypeProblem(board, board.get(3)!, 'relates', 4)).toMatch(/already relates/)
    expect(linkTypeProblem(board, board.get(1)!, 'relates', 1)).toMatch(/itself/)
    expect(linkTypeProblem(board, board.get(1)!, 'relates', 9)).toMatch(/no item #9/)
    expect(linkTypeProblem(board, board.get(1)!, 'relates', 4)).toBeNull()
  })
})
