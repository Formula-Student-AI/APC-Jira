// The "Blocked by" list: numbers of the items this one waits on.

import type { Item } from '../types'

export type BlockerCheck = { ok: true; number: number } | { ok: false; error: string }

/** Check a typed "#12" (or "12"): it must be another item that exists and isn't listed yet. */
export function checkBlocker(input: string, item: Pick<Item, 'number' | 'blocked_by'>, existing: ReadonlySet<number>): BlockerCheck {
  const match = /^#?\s*(\d{1,9})$/.exec(input.trim())
  if (!match) return { ok: false, error: 'Enter an item number, like #12.' }
  const number = Number(match[1])
  if (number === item.number) return { ok: false, error: "An item can't be blocked by itself." }
  if (number <= 0 || !existing.has(number)) return { ok: false, error: `There's no item #${number}.` }
  if (item.blocked_by.includes(number)) return { ok: false, error: `#${number} is already listed.` }
  return { ok: true, number }
}

/** The list with `number` added, in the order the database keeps it (ascending, no repeats). */
export function withBlocker(list: number[], number: number): number[] {
  return [...new Set([...list, number])].sort((a, b) => a - b)
}
