// The six plain status words, the first-status rule, every way a task or key date comes to be at risk, and
// the key-date and phase states, all as of 10 November 2026.

import { describe, expect, it } from 'vitest'
import type { Item } from '../../../types'
import { sampleItem, sampleOption, sampleOptions } from './exportPlan.fixtures'
import {
  firstStatus,
  isAtRisk,
  keyDateDay,
  keyDateState,
  phaseState,
  taskFlags,
  taskStage,
  taskWord,
  wordFor,
  type StatusContext,
} from './exportStatus'

const AS_OF = '2026-11-10'

/** The board's items by number, with the seeded first status. */
function context(board: Item[], patch: Partial<StatusContext> = {}): StatusContext {
  return { firstStatus: 'Todo', asOf: AS_OF, byNumber: new Map(board.map((item) => [item.number, item])), ...patch }
}

const task = (number: number, patch: Partial<Item> = {}) =>
  sampleItem(number, { start_date: '2026-11-16', due_date: '2026-12-11', ...patch })
const NO_FLAGS = { blocked: false, overdue: false, atRisk: false }

describe('firstStatus', () => {
  it('is the status new items get: the first status in board order', () => {
    expect(firstStatus(sampleOptions())).toBe('Todo')
    // Only statuses count, however the options are ordered.
    const shuffled = [
      sampleOption('status', 'Blocked', 'RED', 5),
      sampleOption('subteam', 'Aero', 'BLUE', -1),
      sampleOption('status', 'In Progress', 'YELLOW', 1),
      sampleOption('status', 'Backlog', 'GRAY', 0),
    ]
    expect(firstStatus(shuffled)).toBe('Backlog')
  })

  it('breaks a tie of sort order by name, as the database does', () => {
    const tied = [sampleOption('status', 'Triage', 'GRAY', 0), sampleOption('status', 'Inbox', 'GRAY', 0)]
    expect(firstStatus(tied)).toBe('Inbox')
  })

  it('is null on a board without statuses', () => {
    expect(firstStatus([sampleOption('subteam', 'Mechanical', 'BLUE', 0)])).toBeNull()
    expect(firstStatus([])).toBeNull()
  })
})

describe('taskWord', () => {
  it('says Done for a finished task, even one whose due date has passed', () => {
    const done = task(1, { status: 'Done', due_date: '2026-10-01', start_date: null })
    expect(taskWord(done, context([done]))).toBe('Done')
    expect(taskFlags(done, context([done]))).toEqual(NO_FLAGS)
  })

  it('says Blocked for a blocked task, and still marks it overdue', () => {
    const blocked = task(1, { status: 'Blocked', start_date: '2026-10-01', due_date: '2026-11-06' })
    expect(taskWord(blocked, context([blocked]))).toBe('Blocked')
    expect(taskFlags(blocked, context([blocked]))).toEqual({ blocked: true, overdue: true, atRisk: false })
  })

  it('says Overdue once the due date is before the as-of date', () => {
    const late = task(1, { status: 'In Progress', start_date: '2026-10-01', due_date: '2026-11-09' })
    expect(taskWord(late, context([late]))).toBe('Overdue')
    expect(taskFlags(late, context([late]))).toEqual({ blocked: false, overdue: true, atRisk: false })
    // Due today is not late yet, and a task with only a start date can't be.
    const today = task(2, { status: 'In Progress', start_date: '2026-10-01', due_date: AS_OF })
    const startOnly = task(3, { status: 'In Progress', start_date: '2026-10-01', due_date: null })
    expect(taskWord(today, context([today]))).toBe('In progress')
    expect(taskWord(startOnly, context([startOnly]))).toBe('In progress')
  })

  it('says At risk when the task waits on work in trouble', () => {
    const blocker = task(1, { status: 'Blocked' })
    const waiting = task(2, { blocked_by: [1] })
    expect(taskWord(waiting, context([blocker, waiting]))).toBe('At risk')
    expect(taskFlags(waiting, context([blocker, waiting]))).toEqual({ blocked: false, overdue: false, atRisk: true })
  })

  it('puts Overdue before At risk, and marks only Overdue', () => {
    const blocker = task(1, { status: 'Blocked' })
    const lateAndWaiting = task(2, { blocked_by: [1], start_date: '2026-10-01', due_date: '2026-11-02' })
    const ctx = context([blocker, lateAndWaiting])
    expect(taskWord(lateAndWaiting, ctx)).toBe('Overdue')
    expect(taskFlags(lateAndWaiting, ctx)).toEqual({ blocked: false, overdue: true, atRisk: false })
  })

  it('says Not started for the first status, and In progress for every other one', () => {
    const word = (status: string) => {
      const item = task(1, { status })
      return taskWord(item, context([item]))
    }
    expect(word('Todo')).toBe('Not started')
    // Testing stands for any status added later.
    for (const status of ['In Progress', 'In Review', 'Updates Needed', 'Testing']) {
      expect(word(status)).toBe('In progress')
    }
  })

  it('follows the first status the board has, not a fixed name', () => {
    const todo = task(1, { status: 'Todo' })
    expect(taskWord(todo, context([todo], { firstStatus: 'Backlog' }))).toBe('In progress')
    const backlog = task(2, { status: 'Backlog' })
    expect(taskWord(backlog, context([backlog], { firstStatus: 'Backlog' }))).toBe('Not started')
    // With no statuses at all, nothing is taken to be unstarted.
    expect(taskWord(todo, context([todo], { firstStatus: null }))).toBe('In progress')
  })

  it('reads a parent as In progress once one of its subtasks is Done', () => {
    const parent = task(1)
    const done = task(2, { parent_id: parent.id, status: 'Done' })
    const todo = task(3, { parent_id: parent.id })
    const archivedDone = task(4, { parent_id: parent.id, status: 'Done', archived: true })
    const board = [parent, done, todo, archivedDone]
    expect(taskWord(parent, context(board, { subtasks: [todo] }))).toBe('Not started')
    expect(taskWord(parent, context(board, { subtasks: [todo, done] }))).toBe('In progress')
    // An archived subtask doesn't count, even if it is passed in.
    expect(taskWord(parent, context(board, { subtasks: [todo, archivedDone] }))).toBe('Not started')
  })

  it('agrees with the stage and the markings it is made from', () => {
    const blocker = task(1, { status: 'Blocked' })
    const items = [
      blocker,
      task(2, { status: 'Done' }),
      task(3, { status: 'Blocked', due_date: '2026-11-01', start_date: null }),
      task(4, { due_date: '2026-11-01', start_date: null }),
      task(5, { blocked_by: [1] }),
      task(6),
      task(7, { status: 'In Review' }),
    ]
    const ctx = context(items)
    expect(items.map((item) => taskStage(item, ctx))).toEqual([
      'Blocked', 'Done', 'Blocked', 'Not started', 'Not started', 'Not started', 'In progress',
    ])
    expect(items.map((item) => taskWord(item, ctx))).toEqual([
      'Blocked', 'Done', 'Blocked', 'Overdue', 'At risk', 'Not started', 'In progress',
    ])
    for (const item of items) expect(wordFor(taskStage(item, ctx), taskFlags(item, ctx))).toBe(taskWord(item, ctx))
  })
})

describe('isAtRisk', () => {
  const waiting = task(10, { blocked_by: [1], start_date: '2026-11-16', due_date: '2026-12-11' })
  const atRisk = (blocker: Item, item: Item = waiting) => isAtRisk(item, context([blocker, item]))

  it('is at risk when a blocker is Blocked', () => {
    expect(atRisk(task(1, { status: 'Blocked', start_date: '2026-09-01', due_date: '2026-09-30' }))).toBe(true)
  })

  it('is at risk when a blocker is overdue on the as-of date', () => {
    expect(atRisk(task(1, { status: 'In Progress', start_date: '2026-10-01', due_date: '2026-11-09' }))).toBe(true)
  })

  it('is at risk when a blocker is due after this task starts (the Timeline’s red link)', () => {
    expect(atRisk(task(1, { status: 'In Progress', start_date: '2026-11-01', due_date: '2026-11-20' }))).toBe(true)
    // Due the day this one starts is fine, as on the Timeline.
    expect(atRisk(task(1, { status: 'In Progress', start_date: '2026-11-01', due_date: '2026-11-16' }))).toBe(false)
    // Due before it starts, and neither blocked nor late: on track.
    expect(atRisk(task(1, { status: 'In Progress', start_date: '2026-11-01', due_date: '2026-11-13' }))).toBe(false)
  })

  it('measures a clash from the start of a task with only a due date', () => {
    const dueOnly = task(10, { blocked_by: [1], start_date: null, due_date: '2026-11-30' })
    expect(atRisk(task(1, { start_date: '2026-11-11', due_date: '2026-12-04' }), dueOnly)).toBe(true)
    expect(atRisk(task(1, { start_date: '2026-11-11', due_date: '2026-11-27' }), dueOnly)).toBe(false)
  })

  it('ignores blockers that are Done, archived or missing, and a link to itself', () => {
    expect(atRisk(task(1, { status: 'Done', start_date: '2026-10-01', due_date: '2026-11-30' }))).toBe(false)
    expect(atRisk(task(1, { status: 'Blocked', archived: true }))).toBe(false)
    expect(isAtRisk(waiting, context([waiting]))).toBe(false)
    const itself = task(10, { blocked_by: [10] })
    expect(isAtRisk(itself, context([itself]))).toBe(false)
  })

  it('needs only one blocker in trouble', () => {
    const fine = task(1, { start_date: '2026-11-01', due_date: '2026-11-13' })
    const stuck = task(2, { status: 'Blocked' })
    const both = task(10, { blocked_by: [1, 2] })
    expect(isAtRisk(both, context([fine, stuck, both]))).toBe(true)
    expect(isAtRisk(task(10, { blocked_by: [1] }), context([fine, stuck]))).toBe(false)
  })

  it('is never at risk once Done, or with nothing to wait on', () => {
    const blocker = task(1, { status: 'Blocked' })
    expect(isAtRisk(task(10, { blocked_by: [1], status: 'Done' }), context([blocker]))).toBe(false)
    expect(isAtRisk(task(10), context([blocker]))).toBe(false)
  })

  it('takes a key date that has passed with only a start date as late', () => {
    const keyDate = sampleItem(1, { is_milestone: true, start_date: '2026-11-02', due_date: null })
    expect(atRisk(keyDate)).toBe(true)
    expect(atRisk({ ...keyDate, start_date: '2026-11-12' })).toBe(false)
  })

  it('marks At risk only when the task is neither Blocked nor Overdue', () => {
    const stuck = task(1, { status: 'Blocked' })
    const blockedToo = task(10, { blocked_by: [1], status: 'Blocked' })
    expect(isAtRisk(blockedToo, context([stuck, blockedToo]))).toBe(true)
    expect(taskFlags(blockedToo, context([stuck, blockedToo]))).toEqual({ ...NO_FLAGS, blocked: true })
  })
})

describe('keyDateState', () => {
  const milestone = (patch: Partial<Item>) => sampleItem(50, { is_milestone: true, subteam: null, ...patch })
  const state = (item: Item, board: Item[] = []) => keyDateState(item, context([...board, item]))

  it('is done when marked Done, even after its date', () => {
    expect(state(milestone({ status: 'Done', due_date: '2026-09-05' }))).toBe('done')
  })

  it('is overdue once its date has passed, going by the due date, else the start date', () => {
    expect(state(milestone({ due_date: '2026-11-02' }))).toBe('overdue')
    expect(state(milestone({ start_date: '2026-11-02', due_date: null }))).toBe('overdue')
    expect(state(milestone({ start_date: '2026-11-02', due_date: '2026-11-30' }))).toBe('upcoming')
    expect(state(milestone({ due_date: AS_OF }))).toBe('upcoming')
    expect(keyDateDay(milestone({ start_date: '2026-11-02', due_date: '2026-11-30' }))).toBe('2026-11-30')
  })

  it('is at risk by the task rule, against its own date', () => {
    const designFreeze = milestone({ blocked_by: [1], due_date: '2026-12-15' })
    expect(state(designFreeze, [task(1, { start_date: '2026-10-12', due_date: '2026-12-18' })])).toBe('atRisk')
    expect(state(designFreeze, [task(1, { status: 'Blocked', due_date: '2026-12-01' })])).toBe('atRisk')
    expect(state(designFreeze, [task(1, { start_date: '2026-10-12', due_date: '2026-12-10' })])).toBe('upcoming')
    // A milestone that also has a start date is still judged on the day its diamond sits.
    const withStart = milestone({ blocked_by: [1], start_date: '2026-12-01', due_date: '2026-12-15' })
    expect(state(withStart, [task(1, { start_date: '2026-10-12', due_date: '2026-12-10' })])).toBe('upcoming')
  })

  it('says overdue before at risk, and ignores finished blockers', () => {
    const late = milestone({ blocked_by: [1], due_date: '2026-11-02' })
    expect(state(late, [task(1, { status: 'Blocked' })])).toBe('overdue')
    const freeze = milestone({ blocked_by: [1], due_date: '2026-12-15' })
    expect(state(freeze, [task(1, { status: 'Done', due_date: '2026-12-18' })])).toBe('upcoming')
  })
})

describe('phaseState', () => {
  const phase = (start: string | null, due: string | null) =>
    sampleItem(60, { is_phase: true, subteam: null, start_date: start, due_date: due })

  it('is finished once it ended before the as-of date', () => {
    expect(phaseState(phase('2026-09-01', '2026-11-09'), AS_OF)).toBe('finished')
  })

  it('is now while it contains the as-of date, both ends included', () => {
    expect(phaseState(phase('2026-10-19', '2026-12-20'), AS_OF)).toBe('now')
    expect(phaseState(phase(AS_OF, '2026-12-20'), AS_OF)).toBe('now')
    expect(phaseState(phase('2026-10-19', AS_OF), AS_OF)).toBe('now')
    expect(phaseState(phase(null, AS_OF), AS_OF)).toBe('now')
  })

  it('is upcoming before it starts, and while it has no dates', () => {
    expect(phaseState(phase('2026-11-11', '2027-01-31'), AS_OF)).toBe('upcoming')
    expect(phaseState(phase(null, '2027-01-31'), AS_OF)).toBe('upcoming')
    expect(phaseState(phase(null, null), AS_OF)).toBe('upcoming')
  })
})
