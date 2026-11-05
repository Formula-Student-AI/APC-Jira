// Drag and drop settings for the board: sensors, measuring, collision detection and screen reader text.

import {
  closestCenter,
  closestCorners,
  KeyboardCode,
  MeasuringStrategy,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  type KeyboardSensorOptions,
  type MeasuringConfiguration,
  type MouseSensorOptions,
  type ScreenReaderInstructions,
  type TouchSensorOptions,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { isCellId } from './boardModel'

let lastDragEnd = 0

/** Call when a drag ends or is cancelled, so the click that follows the drop doesn't open the card. */
export function markDragEnd(): void {
  lastDragEnd = Date.now()
}

/** True just after a drag, while the browser may still deliver the drop's click. */
export function justDragged(): boolean {
  return Date.now() - lastDragEnd < 300
}

// Sensor options are constants so the sensors (and every card's listeners) stay the same between renders.

/** Mouse: a press only becomes a drag after moving 6px, so a click still opens the item. */
export const MOUSE_OPTIONS: MouseSensorOptions = { activationConstraint: { distance: 6 } }

/** Touch: press and hold for 200ms to pick a card up; moving sooner scrolls the board instead. */
export const TOUCH_OPTIONS: TouchSensorOptions = { activationConstraint: { delay: 200, tolerance: 6 } }

/** Keyboard: Space picks a card up (Enter opens it), arrow keys move it, Space or Enter drops, Escape cancels. */
export const KEYBOARD_OPTIONS: KeyboardSensorOptions = {
  coordinateGetter: sortableKeyboardCoordinates,
  keyboardCodes: {
    start: [KeyboardCode.Space],
    cancel: [KeyboardCode.Esc],
    end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab],
  },
}

/** Keep measuring cells: they grow and shrink while the preview moves the card between them. */
export const MEASURING: MeasuringConfiguration = { droppable: { strategy: MeasuringStrategy.Always } }

function contains(rect: ClientRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/**
 * Pick the drop target. The cell under the pointer wins (for the keyboard, the cell under the card's
 * centre), and within it the nearest card, or the cell itself when it is empty. Outside every cell
 * (gaps, headers) the nearest target is used, so a drop just beside a column still lands.
 */
export const boardCollisions: CollisionDetection = (args) => {
  const { collisionRect, droppableContainers, droppableRects, pointerCoordinates } = args
  const x = pointerCoordinates?.x ?? collisionRect.left + collisionRect.width / 2
  const y = pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2
  const cell = droppableContainers.find((container) => {
    const rect = isCellId(container.id) ? droppableRects.get(container.id) : undefined
    return rect !== undefined && contains(rect, x, y)
  })
  if (!cell) return closestCorners(args)

  // Cards know their cell through the SortableContext id (see BoardCell).
  const cards = droppableContainers.filter((container) => container.data.current?.sortable?.containerId === cell.id)
  const nearest = cards.length > 0 ? closestCenter({ ...args, droppableContainers: cards }) : []
  return nearest.length > 0 ? nearest : [{ id: cell.id, data: { droppableContainer: cell, value: 0 } }]
}

export const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Press Enter to open this item. To move it, press Space, use the arrow keys to choose a place, ' +
    'then press Space again to drop it, or Escape to cancel.',
}

/** Spoken updates while a card moves, naming the card and the column (and lane) it is over. */
export function boardAnnouncements(cardName: (id: string) => string, placeName: (id: string) => string): Announcements {
  return {
    onDragStart: ({ active }) => `Picked up ${cardName(String(active.id))}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${cardName(String(active.id))} is over ${placeName(String(over.id))}.`
        : `${cardName(String(active.id))} is not over a column.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${cardName(String(active.id))} was dropped in ${placeName(String(over.id))}.`
        : `${cardName(String(active.id))} was put back.`,
    onDragCancel: ({ active }) => `Moving ${cardName(String(active.id))} was cancelled. It is back where it was.`,
  }
}
