// Links between items, as in Jira. Three types:
//   "is blocked by" / "blocks": an item's blocked_by lists the numbers of the items it waits on, and it
//                               blocks every item that lists it. The Timeline draws these as lines.
//   "relates to":               an item's related_to lists numbers of related items; a relation is kept
//                               on one of the two items and shown on both.

import type { Item } from '../types'

export type LinkType = 'blocked_by' | 'blocks' | 'relates'

/** The link types in Jira's words, in the order of the panel's dropdown. */
export const LINK_TYPES: { id: LinkType; label: string }[] = [
  { id: 'blocked_by', label: 'is blocked by' },
  { id: 'blocks', label: 'blocks' },
  { id: 'relates', label: 'relates to' },
]

type Blocking = Pick<Item, 'number' | 'blocked_by'>
type Relating = Pick<Item, 'number' | 'related_to'>
type Linkable = Pick<Item, 'number' | 'blocked_by' | 'related_to'>
type Dated = Pick<Item, 'start_date' | 'due_date'>

/** The list with `number` added, in the order the database keeps it (ascending, no repeats). */
export function withNumber(list: number[], number: number): number[] {
  return [...new Set([...list, number])].sort((a, b) => a - b)
}

/** The items that wait on item `number` (the ones it blocks), by number. */
export function itemsBlockedBy<T extends Blocking>(items: Iterable<T>, number: number): T[] {
  return [...items].filter((other) => other.blocked_by.includes(number)).sort((a, b) => a.number - b.number)
}

/** Numbers of the items related to `item`: the ones it lists and the ones that list it. */
export function relatedNumbers(items: Iterable<Relating>, item: Relating): number[] {
  const numbers = new Set(item.related_to)
  for (const other of items) if (other.related_to.includes(item.number)) numbers.add(other.number)
  numbers.delete(item.number)
  return [...numbers].sort((a, b) => a - b)
}

/** True when item `blocker` already waits on item `item`, directly or through others: linking them would make a loop. */
export function wouldLoop(byNumber: ReadonlyMap<number, Blocking>, item: number, blocker: number): boolean {
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
export function linkProblem(byNumber: ReadonlyMap<number, Blocking>, item: Blocking, blocker: number): string | null {
  if (item.number <= 0 || blocker <= 0) return 'Wait a moment: the item is still being created.'
  if (blocker === item.number) return "An item can't be blocked by itself."
  if (!byNumber.has(blocker)) return `There's no item #${blocker}.`
  if (item.blocked_by.includes(blocker)) return `#${item.number} is already blocked by #${blocker}.`
  if (wouldLoop(byNumber, item.number, blocker)) {
    return `#${blocker} already waits on #${item.number}, so linking them would make a loop.`
  }
  return null
}

/** Why `item` can't get a link of `type` to item number `other`, or null when it can. */
export function linkTypeProblem(byNumber: ReadonlyMap<number, Linkable>, item: Linkable, type: LinkType, other: number): string | null {
  if (type === 'blocked_by') return linkProblem(byNumber, item, other)
  const target = byNumber.get(other)
  if (type === 'blocks') return target ? linkProblem(byNumber, target, item.number) : `There's no item #${other}.`
  if (item.number <= 0 || other <= 0) return 'Wait a moment: the item is still being created.'
  if (other === item.number) return "An item can't relate to itself."
  if (!target) return `There's no item #${other}.`
  if (item.related_to.includes(other) || target.related_to.includes(item.number)) {
    return `#${item.number} already relates to #${other}.`
  }
  return null
}

/** The blocked item is planned to start before the blocking item ends (Jira draws such links in red). */
export function datesClash(blocker: Dated, blocked: Dated): boolean {
  const blockerEnd = blocker.due_date ?? blocker.start_date
  const blockedStart = blocked.start_date ?? blocked.due_date
  return !!blockerEnd && !!blockedStart && blockedStart < blockerEnd
}
