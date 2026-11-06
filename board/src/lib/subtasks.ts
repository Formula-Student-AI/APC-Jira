// Subtasks (Jira's sub-tasks): an item can be a step of another item, its parent. One level only, as the
// database enforces: a subtask has no subtasks of its own, and only tasks (not milestones or phases)
// are subtasks.

import { DONE_STATUS } from '../fields'
import type { Item } from '../types'

const NO_ITEMS: readonly Item[] = []

/** Order added: by number, with steps still being saved (number 0) last, in the order typed. */
function byAdded(a: Item, b: Item): number {
  return (a.number || Infinity) - (b.number || Infinity) || a.position - b.position
}

/** Every item's subtasks (archived ones included), by the parent's id, each list in the order added. */
export function subtaskIndex(items: Iterable<Item>): Map<string, Item[]> {
  const index = new Map<string, Item[]>()
  for (const item of items) {
    if (!item.parent_id) continue
    const list = index.get(item.parent_id)
    if (list) list.push(item)
    else index.set(item.parent_id, [item])
  }
  for (const list of index.values()) list.sort(byAdded)
  return index
}

// Every card and panel asks, so the index is built once per change of the board's items.
let indexedItems: Record<string, Item> | null = null
let index = new Map<string, Item[]>()

/** The subtasks of item `id` on the board (archived ones included), in the order added. */
export function subtasksOf(items: Record<string, Item>, id: string): readonly Item[] {
  if (items !== indexedItems) {
    index = subtaskIndex(Object.values(items))
    indexedItems = items
  }
  return index.get(id) ?? NO_ITEMS
}

export interface Progress {
  done: number
  total: number
}

/** How many of these subtasks are done. Archived subtasks don't count. */
export function progressOf(subtasks: readonly Item[]): Progress {
  const shown = subtasks.filter((subtask) => !subtask.archived)
  return { done: shown.filter((subtask) => subtask.status === DONE_STATUS).length, total: shown.length }
}

/** Why `item` can't be a subtask of anything (a sentence), or null if it can be one. */
export function subtaskProblem(item: Item, items: Record<string, Item>): string | null {
  if (item.is_milestone || item.is_phase) return 'Only tasks can be subtasks, not milestones or phases.'
  if (subtasksOf(items, item.id).length > 0) return `#${item.number} has subtasks of its own, so it can't be a subtask.`
  return null
}

/** Why `parent` can't be `item`'s parent (a sentence), or null if it can. */
export function parentProblem(item: Item, parent: Item, items: Record<string, Item>): string | null {
  if (parent.id === item.id) return "A task can't be its own subtask."
  const problem = subtaskProblem(item, items)
  if (problem) return problem
  if (parent.parent_id) return `#${parent.number} is a subtask itself, and subtasks can't have subtasks.`
  return null
}

/** Rows in order, with each subtask moved to just under its parent when the parent is among them. */
export function withSubtasksUnderParents(items: Item[]): Item[] {
  const shown = new Set(items.map((item) => item.id))
  const under = new Map<string, Item[]>()
  const top: Item[] = []
  for (const item of items) {
    if (item.parent_id && shown.has(item.parent_id)) {
      const list = under.get(item.parent_id)
      if (list) list.push(item)
      else under.set(item.parent_id, [item])
    } else {
      top.push(item)
    }
  }
  const ordered = top.flatMap((item) => [item, ...(under.get(item.id) ?? [])])
  if (ordered.length === items.length) return ordered
  // Never lose a row, even if the data were ever inconsistent (a subtask under a subtask).
  const placed = new Set(ordered.map((item) => item.id))
  return [...ordered, ...items.filter((item) => !placed.has(item.id))]
}
