// Plain status for stakeholders, worked out from the board's own rules: six words instead of workflow
// statuses (In Review, Updates Needed), plus whether a task or key date is at risk.

import { differenceInCalendarDays } from 'date-fns'
import { BLOCKED_STATUS, DONE_STATUS, isBlocked } from '../../../fields'
import { isOverdue, parseDay } from '../../../lib/format'
import { datesClash } from '../../../lib/links'
import { optionsFor, sortOptions } from '../../../lib/options'
import type { FieldOption, Item } from '../../../types'
import type { Flags, KeyDateState, PhaseState, TaskStage, TaskWord } from './planTypes'

export type { TaskStage } from './planTypes'

export interface StatusContext {
  /** The status new items get: the first status option in board order (see firstStatus) */
  firstStatus: string | null
  /** 'YYYY-MM-DD' */
  asOf: string
  /** Every board item by number (blockers are looked up here, whether or not they are exported) */
  byNumber: ReadonlyMap<number, Item>
  /** The item's unarchived subtasks on the whole board, if any */
  subtasks?: readonly Item[]
}

/** The status new items get (createItem and the database default): the first status in board order. */
export function firstStatus(options: FieldOption[]): string | null {
  // The database orders by sort_order and then name when it picks the default, and so does sortOptions.
  return sortOptions(optionsFor(options, 'status'))[0]?.name ?? null
}

/** A key date's own date: its due date, else its start date (as the Timeline places its diamond). */
export function keyDateDay(item: Pick<Item, 'start_date' | 'due_date'>): string | null {
  return item.due_date ?? item.start_date
}

/** Overdue on `asOf`: past its due date and not Done. A key date goes by its own date, so one with only a
 *  start date can be overdue too, and anything waiting on it is then at risk. */
function overdueOn(item: Item, asOf: string): boolean {
  return isOverdue(item.is_milestone ? keyDateDay(item) : item.due_date, item.status, asOf)
}

/**
 * At risk: not Done, and waits on (blocked_by) an unarchived item that isn't Done and is either Blocked,
 * overdue on the as-of date, or due after this item starts (datesClash, the Timeline's red-link rule).
 * Missing and archived blockers are ignored.
 */
export function isAtRisk(item: Item, ctx: StatusContext): boolean {
  if (item.status === DONE_STATUS) return false
  return item.blocked_by.some((number) => {
    // The board refuses a link to itself; one would always clash with its own dates.
    if (number === item.number) return false
    const blocker = ctx.byNumber.get(number)
    if (!blocker || blocker.archived || blocker.status === DONE_STATUS) return false
    return isBlocked(blocker) || overdueOn(blocker, ctx.asOf) || datesClash(blocker, item)
  })
}

/**
 * The markings: blocked (status Blocked), overdue (isOverdue on the as-of date), atRisk (isAtRisk, and only
 * when neither of the others).
 */
export function taskFlags(item: Item, ctx: StatusContext): Flags {
  const blocked = isBlocked(item)
  const overdue = isOverdue(item.due_date, item.status, ctx.asOf)
  return { blocked, overdue, atRisk: !blocked && !overdue && isAtRisk(item, ctx) }
}

/**
 * The stage of the work: Done (DONE_STATUS); Blocked (BLOCKED_STATUS); Not started (the first status, unless
 * one of its subtasks is Done, which makes it In progress); otherwise In progress.
 */
export function taskStage(item: Item, ctx: StatusContext): TaskStage {
  if (item.status === DONE_STATUS) return 'Done'
  if (item.status === BLOCKED_STATUS) return 'Blocked'
  // A ticked step shows the work has begun, whatever the task's own status still says.
  const begun = ctx.subtasks?.some((subtask) => !subtask.archived && subtask.status === DONE_STATUS) ?? false
  return ctx.firstStatus !== null && item.status === ctx.firstStatus && !begun ? 'Not started' : 'In progress'
}

/** The word from a task's stage and markings: Done and Blocked first, then Overdue and At risk, then the stage. */
export function wordFor(stage: TaskStage, flags: Flags): TaskWord {
  if (stage === 'Done' || stage === 'Blocked') return stage
  if (flags.overdue) return 'Overdue'
  if (flags.atRisk) return 'At risk'
  return stage
}

/**
 * The word, first match wins: Done (DONE_STATUS); Blocked (BLOCKED_STATUS); Overdue; At risk; Not started
 * (the first status, unless one of its subtasks is Done, which makes it In progress); otherwise In progress.
 */
export function taskWord(item: Item, ctx: StatusContext): TaskWord {
  return wordFor(taskStage(item, ctx), taskFlags(item, ctx))
}

/**
 * A key date (milestone): done when Done; overdue when its date (due, else start) is before the as-of date
 * and it isn't done; at risk by the task rule against its date; otherwise upcoming.
 */
export function keyDateState(item: Item, ctx: StatusContext): KeyDateState {
  if (item.status === DONE_STATUS) return 'done'
  const day = keyDateDay(item)
  if (isOverdue(day, item.status, ctx.asOf)) return 'overdue'
  // A key date marked Blocked on the board is itself in doubt, whatever it waits on.
  if (isBlocked(item)) return 'atRisk'
  // The diamond sits on that one day, so a blocker clashes when it is due after it, whatever start date the
  // milestone may also carry.
  const onItsDay = day ? { ...item, start_date: day, due_date: day } : item
  return isAtRisk(onItsDay, ctx) ? 'atRisk' : 'upcoming'
}

/** A phase: finished (ended before the as-of date), now (contains it) or upcoming. */
export function phaseState(item: Item, asOf: string): PhaseState {
  const today = parseDay(asOf)
  const start = parseDay(item.start_date ?? item.due_date)
  const end = parseDay(item.due_date ?? item.start_date)
  // Undated phases are never drawn; until they get dates they are still to come.
  if (!today || !start || !end) return 'upcoming'
  if (differenceInCalendarDays(end, today) < 0) return 'finished'
  return differenceInCalendarDays(start, today) > 0 ? 'upcoming' : 'now'
}
