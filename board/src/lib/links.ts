// Links between items, as in Jira: an item "is blocked by" the items in its blocked_by list (their numbers),
// and "blocks" every item that lists it. The Timeline draws each link from the end of the blocking item's
// bar to the start of the blocked one's, in red when the dates clash.

import type { Item } from '../types'

type Linkable = Pick<Item, 'number' | 'blocked_by'>
type Dated = Pick<Item, 'start_date' | 'due_date'>

/** The list with `number` added, in the order the database keeps it (ascending, no repeats). */
export function withBlocker(list: number[], number: number): number[] {
  return [...new Set([...list, number])].sort((a, b) => a - b)
}

/** The items that wait on item `number` (the ones it blocks), by number. */
export function itemsBlockedBy<T extends Linkable>(items: Iterable<T>, number: number): T[] {
  return [...items].filter((other) => other.blocked_by.includes(number)).sort((a, b) => a.number - b.number)
}

/** True when item `blocker` already waits on item `item`, directly or through others: linking them would make a loop. */
export function wouldLoop(byNumber: ReadonlyMap<number, Linkable>, item: number, blocker: number): boolean {
  const seen = new Set<number>()
  const stack = [blocker]
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    if (current === item) return true
    if (seen.has(current)) continue
    seen.add(current)
    stack.push(...(byNumber.get(current)?.blocked_by ?? []))
  }
  return false
}

/** Why `item` can't be blocked by item number `blocker`, or null when it can. */
export function linkProblem(byNumber: ReadonlyMap<number, Linkable>, item: Linkable, blocker: number): string | null {
  if (item.number <= 0 || blocker <= 0) return 'Wait a moment: the item is still being created.'
  if (blocker === item.number) return "An item can't be blocked by itself."
  if (!byNumber.has(blocker)) return `There's no item #${blocker}.`
  if (item.blocked_by.includes(blocker)) return `#${item.number} is already blocked by #${blocker}.`
  if (wouldLoop(byNumber, item.number, blocker)) {
    return `#${blocker} already waits on #${item.number}, so linking them would make a loop.`
  }
  return null
}

/** The blocked item is planned to start before the blocking item ends (Jira draws such links in red). */
export function datesClash(blocker: Dated, blocked: Dated): boolean {
  const blockerEnd = blocker.due_date ?? blocker.start_date
  const blockedStart = blocked.start_date ?? blocked.due_date
  return !!blockerEnd && !!blockedStart && blockedStart < blockerEnd
}
