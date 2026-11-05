// Pure board logic: columns and swimlanes from options, items grouped into cells, where a drop lands
// and which position the moved card gets. No React or store code here (see boardModel.test.ts).

import type { ClientRect, UniqueIdentifier } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { positionBetween, respace } from '../../lib/position'
import type { FieldOption, Item, ItemPatch } from '../../types'
import type { BoardViewConfig } from '../config'

/** Fields that can be board columns or swimlanes. */
export type GroupField = 'status' | 'subteam'

/** One column or one swimlane. */
export interface Group {
  /** Stable key (from the option id where there is one): React key and remembered collapsed lanes */
  key: string
  /** Field value of the items in this group; null = "No subteam" */
  value: string | null
  name: string
  description: string | null
}

/** Where a cell is: its swimlane value (null on boards without swimlanes) and its column value. */
export interface CellPlace {
  lane: string | null
  column: string | null
}

/** The card being dragged and where it is previewed: a cell, at an index among that cell's other cards. */
export interface DragState {
  id: string
  cell: string
  index: number
}

/** The one implicit lane of a board without swimlanes. */
export const SINGLE_LANE: Group = { key: 'all', value: null, name: 'All items', description: null }

export function groupValue(item: Item, field: GroupField): string | null {
  return field === 'status' ? item.status : item.subteam
}

/** Write a column or lane value into a patch. Status can't be empty, so null is ignored for it. */
export function setGroupValue(patch: ItemPatch, field: GroupField, value: string | null): void {
  if (field === 'subteam') patch.subteam = value
  else if (value !== null) patch.status = value
}

/**
 * Columns or lanes for a field: one per option, in order. Values that items use but that aren't
 * options (e.g. for a moment after a rename) get their own group so no item goes missing, and
 * "No subteam" comes last when some item has no subteam.
 */
export function buildGroups(field: GroupField, options: FieldOption[], items: Item[]): Group[] {
  const groups: Group[] = options.map((option) => ({
    key: `option:${option.id}`,
    value: option.name,
    name: option.name,
    description: option.description,
  }))
  const known = new Set(options.map((option) => option.name))
  const unknown = new Set<string>()
  let hasNone = false
  for (const item of items) {
    const value = groupValue(item, field)
    if (value === null) hasNone = true
    else if (!known.has(value)) unknown.add(value)
  }
  for (const value of unknown) groups.push({ key: `value:${value}`, value, name: value, description: null })
  if (hasNone) {
    groups.push({ key: 'none', value: null, name: field === 'subteam' ? 'No subteam' : 'No status', description: null })
  }
  return groups
}

const CELL_PREFIX = 'cell:'

/** Droppable id of a cell. JSON keeps null apart from text and copes with any option name. */
export function cellId(lane: string | null, column: string | null): string {
  return CELL_PREFIX + JSON.stringify([lane, column])
}

/** The lane and column of a cell id (the reverse of cellId). */
export function placeOfCell(id: string): CellPlace {
  const [lane, column] = JSON.parse(id.slice(CELL_PREFIX.length)) as [string | null, string | null]
  return { lane, column }
}

/** Cell ids never clash with item ids (UUIDs). */
export function isCellId(id: UniqueIdentifier): boolean {
  return typeof id === 'string' && id.startsWith(CELL_PREFIX)
}

/** The cell an item belongs in, from its stored values. */
export function cellOf(item: Item, view: BoardViewConfig): string {
  const lane = view.swimlaneField ? groupValue(item, view.swimlaneField) : null
  return cellId(lane, groupValue(item, view.columnField))
}

/** Items per cell, keeping their order (the input is already sorted by position). */
export function groupByCell(items: Item[], view: BoardViewConfig): Map<string, Item[]> {
  const cells = new Map<string, Item[]>()
  for (const item of items) {
    const id = cellOf(item, view)
    const list = cells.get(id)
    if (list) list.push(item)
    else cells.set(id, [item])
  }
  return cells
}

/** The cells with the dragged item moved from cell `from` to its preview place. */
export function withPreview(cells: Map<string, Item[]>, item: Item, from: string, drag: DragState): Map<string, Item[]> {
  const next = new Map(cells)
  next.set(
    from,
    (cells.get(from) ?? []).filter((other) => other.id !== item.id),
  )
  const target = (next.get(drag.cell) ?? []).filter((other) => other.id !== item.id)
  target.splice(Math.min(Math.max(drag.index, 0), target.length), 0, item)
  next.set(drag.cell, target)
  return next
}

/** The cell that shows an item, or null. */
export function findCell(cells: Map<string, Item[]>, itemId: string): string | null {
  for (const [id, list] of cells) {
    if (list.some((item) => item.id === itemId)) return id
  }
  return null
}

/** Same items in the same order (used to skip re-rendering unchanged cells). */
export function sameItems(a: readonly Item[], b: readonly Item[]): boolean {
  return a === b || (a.length === b.length && a.every((item, index) => item === b[index]))
}

/** Is the dragged card's centre below the middle of the card it is over? */
export function isBelowCentre(dragged: ClientRect | null, over: ClientRect): boolean {
  return dragged !== null && dragged.top + dragged.height / 2 > over.top + over.height / 2
}

/**
 * Where a drop lands: the target cell and the ids of its items in their new order, including the
 * dragged one. `activeCell` is the cell the card is previewed in; `overId` is a card or a cell.
 */
export function resolveDrop(
  cells: Map<string, Item[]>,
  activeId: string,
  activeCell: string,
  overId: string,
  overCell: string,
): { cell: string; ids: string[] } {
  const idsIn = (cell: string) => (cells.get(cell) ?? []).map((item) => item.id)
  if (overCell === activeCell) {
    const ids = idsIn(activeCell)
    const from = ids.indexOf(activeId)
    if (from < 0) return { cell: activeCell, ids: [...ids, activeId] }
    const to = ids.indexOf(overId)
    return { cell: activeCell, ids: to >= 0 && to !== from ? arrayMove(ids, from, to) : ids }
  }
  // Over another cell (the preview hadn't followed yet): before the card it is over, or at the end.
  const ids = idsIn(overCell).filter((id) => id !== activeId)
  const at = ids.indexOf(overId)
  ids.splice(at >= 0 ? at : ids.length, 0, activeId)
  return { cell: overCell, ids }
}

export interface PositionPlan {
  /** Position for the moved card */
  position: number
  /** New positions for other cards in the cell, when it had to be re-spaced to make room */
  respaced: Map<string, number>
}

/**
 * Position for the card `activeId` at its place in `ids` (the cell's ids in their new order).
 * Keeps the current position when it already sorts correctly there, so nothing else changes.
 */
export function planPosition(ids: string[], activeId: string, byId: Map<string, Item>): PositionPlan {
  const index = ids.indexOf(activeId)
  const current = byId.get(activeId)?.position
  const before = index > 0 ? byId.get(ids[index - 1])?.position : undefined
  const after = index >= 0 && index < ids.length - 1 ? byId.get(ids[index + 1])?.position : undefined
  const none = new Map<string, number>()

  if (current !== undefined && (before === undefined || before < current) && (after === undefined || current < after)) {
    return { position: current, respaced: none }
  }
  const between = positionBetween(before, after)
  if (between !== null) return { position: between, respaced: none }

  // The neighbours are too close together: space the whole cell out again, in the new order.
  const others = ids.filter((id) => id !== activeId)
  const start = Math.min(...others.map((id) => byId.get(id)?.position ?? 0))
  const spaced = respace(ids, start)
  const respaced = new Map<string, number>()
  for (const [id, position] of spaced) {
    if (id !== activeId && byId.get(id)?.position !== position) respaced.set(id, position)
  }
  return { position: spaced.get(activeId) ?? start, respaced }
}

/** Join class names, skipping empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}
