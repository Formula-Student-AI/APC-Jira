// Start and due dates in the task panel.
//
// - A date box always shows exactly what has been typed in it. Setting it to anything else while
//   someone types (say '' while the year is still "0002") would wipe the day and month they typed.
// - Half-typed dates are never saved. Nor is a start date after the due date: it's shown with an
//   error, and saved once the order is put right.
// - Typed dates are saved when the box is left, on Enter, or when the panel closes: typing "25" passes
//   through "02", and Chrome waits as long as it takes for a part's second digit. Dates picked from
//   the calendar or changed with the arrow keys are saved after a short pause.

import { isWholeDay } from '../lib/format'
import type { Item, ItemPatch } from '../types'

export type DateKey = 'start_date' | 'due_date'

/** What a date box holds while it differs from the saved date. */
export interface DateDraft {
  /** The box's value: a date ('' = none), or e.g. "0002-11-05" or '' while it's half-typed */
  value: string
  /** True when it's a date to save, or empty; false while it's half-typed */
  done: boolean
}

export type DateDrafts = Partial<Record<DateKey, DateDraft>>

/** A box left half-typed, or holding a date the browser filled in by itself: dropped, never saved. */
export const HALF_TYPED: DateDraft = { value: '', done: false }

type Dates = Pick<Item, 'start_date' | 'due_date'>

const KEYS: DateKey[] = ['start_date', 'due_date']

/**
 * What a date box holds. Its value is '' both when it's empty and when it's half-typed ("05/11/yyyy");
 * the browser tells the two apart with validity.badInput.
 */
export function readDateBox(box: Pick<HTMLInputElement, 'value' | 'validity'>): DateDraft {
  const { value } = box
  return { value, done: value === '' ? !box.validity.badInput : isWholeDay(value) }
}

/** Keys that change a part of a date box: digits, and the keys that step a part up or down. */
const VALUE_KEY = /^(\d|ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/

/** Keys that move focus to another part of a date box, or out of it. */
const FOCUS_KEY = /^(Tab|ArrowLeft|ArrowRight|Escape)$/

/**
 * A change that was typed: a digit key is down (`key`), or a digit typed earlier is being committed
 * (`pendingDigit`). Firefox keeps a part's first digit to itself until the part is complete or focus
 * moves on. A pending "0" doesn't count: that is Chrome's lone zero, which it fills in by itself.
 */
export function isTyped(key: string | null, pendingDigit: string | null): boolean {
  return (key !== null && /^\d$/.test(key)) || (pendingDigit !== null && pendingDigit !== '0')
}

/**
 * Chrome and Edge fill in a part left with a lone "0" (as 01) when focus moves on: to another part,
 * out of the box or out of the window. The box then reports a whole date nobody typed, with a key that
 * moves focus down, or with the box not focused. Real changes come with a value key down, or from the
 * calendar (however it was opened) while the box is focused.
 */
export function isFilledIn(wasHalfTyped: boolean, box: DateDraft, key: string | null, focused: boolean): boolean {
  if (!wasHalfTyped || !isWholeDay(box.value)) return false
  if (key !== null && VALUE_KEY.test(key)) return false
  return !focused || (key !== null && FOCUS_KEY.test(key))
}

/**
 * Whether a change waits for the box to be left (or Enter) before it's saved, rather than a short
 * pause: typed changes ("25" is "02" on the way), and an emptied box (some browsers report one emptied
 * part as an empty box). Dates picked from the calendar are saved after the pause.
 */
export function waitsForLeave(box: DateDraft, typed: boolean): boolean {
  return typed || box.value === ''
}

/** The value a date box shows. */
export function shownDate(item: Dates, drafts: DateDrafts, key: DateKey): string {
  return drafts[key]?.value ?? item[key] ?? ''
}

/** Both dates are whole and the start is after the due date. */
export function datesOutOfOrder(start: string, due: string): boolean {
  return isWholeDay(start) && isWholeDay(due) && start > due
}

/** A finished draft, otherwise the saved date: a half-typed box counts as its saved date. */
function dateToSave(item: Dates, drafts: DateDrafts, key: DateKey): string {
  const draft = drafts[key]
  return draft?.done ? draft.value : (item[key] ?? '')
}

/** The dates as they would be saved have the start after the due date, so nothing can be saved. */
export function datesBlocked(item: Dates, drafts: DateDrafts): boolean {
  return datesOutOfOrder(dateToSave(item, drafts, 'start_date'), dateToSave(item, drafts, 'due_date'))
}

export interface DatePlan {
  /** Drafts to keep showing */
  drafts: DateDrafts
  /** What to save, if anything */
  patch: ItemPatch | null
}

/** What to save from the date boxes, and which drafts to keep showing. */
export function planDates(item: Dates, drafts: DateDrafts): DatePlan {
  if (datesBlocked(item, drafts)) {
    // Keep only drafts that differ from what's saved: a box left untouched follows later changes.
    const kept: DateDrafts = {}
    for (const k of KEYS) {
      const draft = drafts[k]
      if (draft && (!draft.done || (draft.value || null) !== item[k])) kept[k] = draft
    }
    return { drafts: Object.keys(kept).length === Object.keys(drafts).length ? drafts : kept, patch: null }
  }
  const patch: ItemPatch = {}
  const kept: DateDrafts = {}
  for (const k of KEYS) {
    const draft = drafts[k]
    if (!draft) continue
    if (!draft.done) kept[k] = draft
    else if ((draft.value || null) !== item[k]) patch[k] = draft.value || null
  }
  return { drafts: kept, patch: Object.keys(patch).length > 0 ? patch : null }
}

/** The drafts once a box is left: one left half-typed goes, so the box shows the saved date again. */
export function leftBox(drafts: DateDrafts, key: DateKey, box: DateDraft): DateDrafts {
  if (box.done) return { ...drafts, [key]: box }
  const next = { ...drafts }
  delete next[key]
  return next
}

/** Names the change in error messages. */
export function datesWhat(patch: ItemPatch): string {
  if ('start_date' in patch && 'due_date' in patch) return 'the dates'
  return 'start_date' in patch ? 'the start date' : 'the due date'
}
