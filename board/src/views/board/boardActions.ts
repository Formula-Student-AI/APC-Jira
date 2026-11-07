// Changes made from the board: saving a drop, and adding an item from a cell's composer.
// The store functions update the board at once and show their own error messages.

import { combineFilters, defaultsFromFilter, matchesFilter, parseFilter } from '../../lib/filter'
import { subteamChange } from '../../lib/options'
import { positionBetween } from '../../lib/position'
import { useAuth } from '../../store/auth'
import { createItem, pushToast, updateItem, useBoard } from '../../store/board'
import type { Item, ItemPatch, NewItem } from '../../types'
import type { BoardViewConfig } from '../config'
import { groupValue, planPosition, setGroupValue, type CellPlace } from './boardModel'

/**
 * Save a drop: the card goes to `place`, at its index in `orderedIds` (the target cell's ids in their
 * new order, including the card). Only the fields that changed are sent.
 */
export function moveCard(
  item: Item,
  view: BoardViewConfig,
  place: CellPlace,
  orderedIds: string[],
  byId: Map<string, Item>,
): void {
  const { position, respaced } = planPosition(orderedIds, item.id, byId)
  // No room between the neighbours: the cell was re-spaced, so the other cards move first.
  // (Cards still being created, number 0, can't be saved yet and keep their place.)
  for (const [id, newPosition] of respaced) {
    if (byId.get(id)?.number) void updateItem(id, { position: newPosition }, 'reordering the cards')
  }

  const patch: ItemPatch = {}
  if (groupValue(item, view.columnField) !== place.column) setGroupValue(patch, view.columnField, place.column)
  if (view.swimlaneField && groupValue(item, view.swimlaneField) !== place.lane) {
    setGroupValue(patch, view.swimlaneField, place.lane)
  }
  if (position !== item.position) patch.position = position
  // A card moved to another subteam loses its domain, unless that subteam has one of the same name
  // (as in the panel, and as the database does).
  if ('subteam' in patch) Object.assign(patch, subteamChange(useBoard.getState().options, item, patch.subteam ?? null))
  if (Object.keys(patch).length > 0) void updateItem(item.id, patch, 'moving the card')
}

/**
 * Create an item at the end of a cell. It gets the cell's column (and lane) value plus whatever the
 * view's filter implies, e.g. assigned to me on Self Kanban, so it stays visible where it was added.
 */
export async function addItem(
  view: BoardViewConfig,
  query: string,
  place: CellPlace,
  title: string,
  cellItems: Item[],
): Promise<void> {
  const { members, options } = useBoard.getState()
  const me = useAuth.getState().member?.username ?? null
  const filter = combineFilters(view.filter, query)
  const defaults = defaultsFromFilter(filter, { me, members, options })

  const input: NewItem = { title }
  const position = positionBetween(cellItems.at(-1)?.position, undefined)
  if (position !== null) input.position = position
  if (defaults.assignees) input.assignees = defaults.assignees
  if (defaults.labels) input.labels = defaults.labels
  if (defaults.extra) input.extra = defaults.extra
  const cellFields = [view.columnField, view.swimlaneField]
  if (defaults.status && !cellFields.includes('status')) input.status = defaults.status
  if (defaults.subteam && !cellFields.includes('subteam')) input.subteam = defaults.subteam
  setGroupValue(input, view.columnField, place.column)
  if (view.swimlaneField) setGroupValue(input, view.swimlaneField, place.lane)

  const created = await createItem(input)
  // Free text in the filter box can't be filled in for the new item, so say where it went.
  if (created && !matchesFilter(created, parseFilter(filter), { me, members })) {
    pushToast('info', `#${created.number} was added, but the current filter hides it.`)
  }
}
