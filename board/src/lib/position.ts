// Manual ordering: items.position is a float; lower comes first.

export const POSITION_STEP = 1
const MIN_GAP = 1e-6

/**
 * Position for an item placed between two neighbours (either may be missing).
 * Returns null when the neighbours are too close: re-space the column with `respace` first.
 */
export function positionBetween(before: number | undefined, after: number | undefined): number | null {
  if (before === undefined && after === undefined) return Date.now() / 1000
  if (before === undefined) return (after as number) - POSITION_STEP
  if (after === undefined) return before + POSITION_STEP
  if (after - before < MIN_GAP) return null
  return (before + after) / 2
}

/** Evenly spaced positions for items in the given order (returns id -> new position). */
export function respace(orderedIds: string[], start: number): Map<string, number> {
  return new Map(orderedIds.map((id, index) => [id, start + index * POSITION_STEP]))
}

/** Sort comparator for items in a column: position, then number. */
export function byPosition(a: { position: number; number: number }, b: { position: number; number: number }): number {
  return a.position - b.position || a.number - b.number
}
