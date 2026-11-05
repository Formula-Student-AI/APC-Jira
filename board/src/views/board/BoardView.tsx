// Board layout (Self Kanban, Kanban, Subteam Board): columns from one field's options, optional
// swimlanes from another, drag and drop between and within cells, and "+ Add item" in every cell.

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from '@primer/octicons-react'
import { memo, useMemo, useState, type FormEvent } from 'react'
import { useFieldOptions, useViewItems } from '../../store/hooks'
import type { Item } from '../../types'
import { OptionDot } from '../../ui/OptionChip'
import type { BoardViewConfig } from '../config'
import { addItem, moveCard } from './boardActions'
import {
  buildGroups,
  cellId,
  cellOf,
  cx,
  findCell,
  groupByCell,
  groupValue,
  isBelowCentre,
  isCellId,
  placeOfCell,
  resolveDrop,
  sameItems,
  SINGLE_LANE,
  withPreview,
  type DragState,
  type Group,
  type GroupField,
} from './boardModel'
import { CardBody, SortableCard } from './Card'
import {
  boardAnnouncements,
  boardCollisions,
  KEYBOARD_OPTIONS,
  markDragEnd,
  MEASURING,
  MOUSE_OPTIONS,
  SCREEN_READER_INSTRUCTIONS,
  TOUCH_OPTIONS,
} from './dnd'
import { useCollapsedLanes } from './useCollapsedLanes'
import './board.css'

const EMPTY: Item[] = []

function countBy(items: Item[], field: GroupField): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = JSON.stringify(groupValue(item, field))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function BoardView({ view, query }: { view: BoardViewConfig; query: string }) {
  const items = useViewItems(view.filter, query)
  const columnOptions = useFieldOptions(view.columnField)
  const laneOptions = useFieldOptions(view.swimlaneField ?? '')
  const columns = useMemo(() => buildGroups(view.columnField, columnOptions, items), [view.columnField, columnOptions, items])
  const lanes = useMemo(
    () => (view.swimlaneField ? buildGroups(view.swimlaneField, laneOptions, items) : [SINGLE_LANE]),
    [view.swimlaneField, laneOptions, items],
  )
  const cells = useMemo(() => groupByCell(items, view), [items, view])
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const columnCounts = useMemo(() => countBy(items, view.columnField), [items, view.columnField])
  const laneCounts = useMemo(
    () => (view.swimlaneField ? countBy(items, view.swimlaneField) : new Map<string, number>()),
    [items, view.swimlaneField],
  )
  const [drag, setDrag] = useState<DragState | null>(null)
  const [collapsed, toggleLane] = useCollapsedLanes(view.id)
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  )

  const dragged = drag ? (byId.get(drag.id) ?? null) : null
  // While dragging, the card is shown where it would land.
  const shown = useMemo(
    () => (drag && dragged ? withPreview(cells, dragged, cellOf(dragged, view), drag) : cells),
    [cells, drag, dragged, view],
  )

  const announcements = useMemo(() => {
    const placeName = (id: string) => {
      const cell = isCellId(id) ? id : findCell(cells, id)
      if (!cell) return 'the board'
      const { lane, column } = placeOfCell(cell)
      const columnName = columns.find((c) => c.value === column)?.name ?? 'the column'
      if (!view.swimlaneField) return columnName
      return `${columnName}, ${lanes.find((l) => l.value === lane)?.name ?? 'the lane'}`
    }
    const cardName = (id: string) => {
      const item = byId.get(id)
      return item ? `#${item.number} ${item.title}` : 'the card'
    }
    return boardAnnouncements(cardName, placeName)
  }, [byId, cells, columns, lanes, view.swimlaneField])

  function onDragStart({ active }: DragStartEvent) {
    const item = byId.get(String(active.id))
    if (!item) return
    const cell = cellOf(item, view)
    setDrag({ id: item.id, cell, index: (cells.get(cell) ?? []).findIndex((other) => other.id === item.id) })
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!drag || !over) return
    const overId = String(over.id)
    const overCell = isCellId(overId) ? overId : findCell(shown, overId)
    if (!overCell || overCell === drag.cell) return
    const others = (shown.get(overCell) ?? []).filter((other) => other.id !== drag.id)
    let index = isCellId(overId) ? others.length : others.findIndex((other) => other.id === overId)
    if (index < 0) index = others.length
    else if (!isCellId(overId) && isBelowCentre(active.rect.current.translated, over.rect)) index += 1
    setDrag({ ...drag, cell: overCell, index })
  }

  function onDragEnd({ over }: DragEndEvent) {
    markDragEnd()
    const current = drag
    setDrag(null)
    if (!current || !over || !dragged) return
    const overId = String(over.id)
    const overCell = isCellId(overId) ? overId : (findCell(shown, overId) ?? current.cell)
    const { cell, ids } = resolveDrop(shown, current.id, current.cell, overId, overCell)
    moveCard(dragged, view, placeOfCell(cell), ids, byId)
  }

  function onDragCancel() {
    markDragEnd()
    setDrag(null)
  }

  const filtering = query.trim() !== ''

  return (
    <div className="bview">
      {items.length === 0 && (
        <p className="bview-hint">
          {filtering
            ? 'No items match the filter.'
            : view.id === 'self-kanban'
              ? 'Nothing is assigned to you yet. Use “+ Add item” in a column to create something for yourself, or get assigned on the Kanban.'
              : 'No items yet. Use “+ Add item” in a column to create the first one.'}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisions}
        measuring={MEASURING}
        accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="bview-scroll">
          <div className="bview-grid">
            <div className="bview-header">
              {columns.map((column) => (
                <ColumnHeader
                  key={column.key}
                  field={view.columnField}
                  group={column}
                  count={columnCounts.get(JSON.stringify(column.value)) ?? 0}
                />
              ))}
            </div>
            {lanes.map((lane) => {
              const laneField = view.swimlaneField
              const isCollapsed = laneField !== null && collapsed.has(lane.key)
              return (
                <section key={lane.key} className="bview-lane" aria-label={laneField ? lane.name : undefined}>
                  {laneField && (
                    <LaneHeader
                      field={laneField}
                      group={lane}
                      count={laneCounts.get(JSON.stringify(lane.value)) ?? 0}
                      collapsed={isCollapsed}
                      onToggle={() => toggleLane(lane.key)}
                    />
                  )}
                  {!isCollapsed && (
                    <div className="bview-row">
                      {columns.map((column) => {
                        const id = cellId(laneField ? lane.value : null, column.value)
                        return <BoardCell key={column.key} id={id} items={shown.get(id) ?? EMPTY} view={view} query={query} />
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
        <DragOverlay>{dragged ? <CardBody item={dragged} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}

function ColumnHeader({ field, group, count }: { field: GroupField; group: Group; count: number }) {
  return (
    <div className="bview-colhead" title={group.description ?? undefined}>
      <OptionDot field={field} name={group.value} />
      <span className="bview-colname">{group.name}</span>
      <span className="badge badge-count" aria-label={`${count} items`}>
        {count}
      </span>
    </div>
  )
}

interface LaneHeaderProps {
  field: GroupField
  group: Group
  count: number
  collapsed: boolean
  onToggle: () => void
}

function LaneHeader({ field, group, count, collapsed, onToggle }: LaneHeaderProps) {
  return (
    <div className="bview-lanehead">
      <button type="button" className="bview-lanetoggle" aria-expanded={!collapsed} onClick={onToggle}>
        {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        <OptionDot field={field} name={group.value} />
        <span className="bview-lanename">{group.name}</span>
        <span className="badge badge-count" aria-label={`${count} items`}>
          {count}
        </span>
      </button>
    </div>
  )
}

interface CellProps {
  id: string
  items: Item[]
  view: BoardViewConfig
  query: string
}

/** One (lane, column) cell: a drop target with a sortable list of cards and an "Add item" composer. */
const BoardCell = memo(
  function BoardCell({ id, items, view, query }: CellProps) {
    const { setNodeRef, isOver } = useDroppable({ id })
    return (
      <div ref={setNodeRef} className={cx('bview-cell', isOver && 'bview-cell-over')}>
        <SortableContext id={id} items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableCard key={item.id} item={item} />
          ))}
        </SortableContext>
        <AddItem cell={id} items={items} view={view} query={query} />
      </div>
    )
  },
  (a, b) => a.id === b.id && a.view === b.view && a.query === b.query && sameItems(a.items, b.items),
)

/** "+ Add item" at the foot of a cell; stays open for adding several in a row. */
function AddItem({ cell, items, view, query }: { cell: string; items: Item[]; view: BoardViewConfig; query: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setOpen(false)
    setTitle('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = title.trim()
    if (!text || busy) return
    setBusy(true)
    setTitle('')
    try {
      await addItem(view, query, placeOfCell(cell), text, items)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="bview-add" onClick={() => setOpen(true)}>
        <PlusIcon size={14} />
        Add item
      </button>
    )
  }

  return (
    <form className="bview-composer" onSubmit={(event) => void submit(event)}>
      <input
        className="input"
        autoFocus
        value={title}
        maxLength={300}
        placeholder="Title, then Enter"
        aria-label="New item title"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
      />
      <div className="bview-composer-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !title.trim()}>
          Add
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
          Done
        </button>
      </div>
    </form>
  )
}
