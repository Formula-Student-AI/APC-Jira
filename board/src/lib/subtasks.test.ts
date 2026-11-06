import { describe, expect, it } from 'vitest'
import { describeActivity } from '../panel/describeChange'
import type { Activity, Item } from '../types'
import { groupForTimeline } from '../views/timeline/timelineMath'
import { matchesFilter, parseFilter } from './filter'
import { parentProblem, progressOf, subtaskIndex, subtaskProblem, subtasksOf, withSubtasksUnderParents } from './subtasks'

function item(number: number, extra: Partial<Item> = {}): Item {
  return {
    id: `id-${number}`, number, title: `Item ${number}`, description: '', status: 'Todo', subteam: 'Mechanical',
    domain: null, assignees: [], legacy_assignees: [], labels: [], start_date: null, due_date: null, blocked_reason: null,
    blocked_by: [], related_to: [], is_milestone: false, is_phase: false, parent_id: null, extra: {}, position: number,
    archived: false, github_item_id: null, github_url: null, created_by: null, updated_by: null, created_at: '', updated_at: '',
    ...extra,
  }
}

const bracket = item(12, { title: 'Steering rack bracket' })
const sketch = item(15, { parent_id: 'id-12', status: 'Done', position: 3 })
const cad = item(16, { parent_id: 'id-12', position: 1 })
const old = item(17, { parent_id: 'id-12', archived: true, status: 'Done', position: 2 })
const other = item(20)
const milestone = item(30, { is_milestone: true })
const items: Record<string, Item> = Object.fromEntries([bracket, sketch, cad, old, other, milestone].map((i) => [i.id, i]))

describe('subtasks', () => {
  it('indexes subtasks by parent, in the order added (not the order of their cards on the board)', () => {
    const index = subtaskIndex(Object.values(items))
    expect(index.get('id-12')?.map((i) => i.number)).toEqual([15, 16, 17])
    expect(index.has('id-20')).toBe(false)
    expect(subtasksOf(items, 'id-12').map((i) => i.number)).toEqual([15, 16, 17])
    expect(subtasksOf(items, 'id-20')).toEqual([])
    // Steps still being saved (number 0) come last, in the order typed.
    const typing = [item(0, { id: 'new-b', parent_id: 'id-12', position: 9 }), item(0, { id: 'new-a', parent_id: 'id-12', position: 8 }), sketch]
    expect(subtaskIndex(typing).get('id-12')?.map((i) => i.id)).toEqual(['id-15', 'new-a', 'new-b'])
  })

  it('counts progress without archived subtasks', () => {
    expect(progressOf(subtasksOf(items, 'id-12'))).toEqual({ done: 1, total: 2 })
    expect(progressOf([])).toEqual({ done: 0, total: 0 })
  })

  it('allows one level only, and only tasks as subtasks', () => {
    expect(parentProblem(other, bracket, items)).toBeNull()
    expect(parentProblem(other, milestone, items)).toBeNull()
    expect(parentProblem(other, other, items)).toMatch(/own subtask/)
    expect(parentProblem(other, sketch, items)).toMatch(/#15 is a subtask itself/)
    expect(parentProblem(bracket, other, items)).toMatch(/#12 has subtasks/)
    expect(parentProblem(milestone, other, items)).toMatch(/not milestones or phases/)
    expect(subtaskProblem(other, items)).toBeNull()
    expect(subtaskProblem(bracket, items)).toMatch(/has subtasks/)
  })

  it('puts subtasks just under their parent, keeping every row', () => {
    const order = withSubtasksUnderParents([sketch, other, bracket, cad])
    expect(order.map((i) => i.number)).toEqual([20, 12, 15, 16])
    // A subtask whose parent isn't in the list stays where it was.
    expect(withSubtasksUnderParents([other, sketch]).map((i) => i.number)).toEqual([20, 15])
    // Even impossible data (a subtask under a subtask) loses no row.
    const nested = item(40, { parent_id: 'id-15' })
    expect(withSubtasksUnderParents([bracket, sketch, nested]).map((i) => i.number).sort()).toEqual([12, 15, 40])
  })

  it('shows subtasks under their parent on the Timeline when they are in the same subteam', () => {
    const dated = (i: Item, start: string) => ({ ...i, start_date: start, due_date: start })
    const { groups } = groupForTimeline(
      [dated(sketch, '2026-11-01'), dated(other, '2026-11-05'), dated(bracket, '2026-11-10')],
      [{ id: 'm', field: 'subteam', name: 'Mechanical', color: 'BLUE', description: null, sort_order: 1, leads: [], parent_id: null, created_at: '' }],
    )
    expect(groups[0].items.map((i) => i.number)).toEqual([20, 12, 15])
  })

  it('also puts undated subtasks under their undated parent', () => {
    const { undated } = groupForTimeline([cad, other, bracket, sketch], [])
    expect(undated.map((i) => i.number)).toEqual([20, 12, 16, 15])
  })
})

describe('filter', () => {
  const ctx = { me: null, members: {}, items }
  const match = (filter: string, it: Item) => matchesFilter(it, parseFilter(filter), ctx)

  it('finds subtasks, and one task’s subtasks', () => {
    expect(match('is:subtask', sketch)).toBe(true)
    expect(match('is:subtask', bracket)).toBe(false)
    expect(match('-is:subtask', bracket)).toBe(true)
    expect(match('parent:12', sketch)).toBe(true)
    expect(match('parent:#12', cad)).toBe(true)
    expect(match('parent:20', sketch)).toBe(false)
    expect(match('parent:12', bracket)).toBe(false)
    expect(match('has:parent', sketch)).toBe(true)
    expect(match('no:parent', other)).toBe(true)
  })
})

describe('history', () => {
  const entry = (old: unknown, next: unknown): Activity => ({
    id: 1, item_id: 'id-20', item_number: 20, username: null, action: 'updated', changes: { parent_id: { old, new: next } }, created_at: '',
  })

  it('says a new subtask was created under its parent', () => {
    const created: Activity = { ...entry(null, 'id-12'), action: 'created' }
    expect(describeActivity(created, {}, items)).toEqual(['created this item as a subtask of #12'])
    expect(describeActivity({ ...created, changes: {} }, {}, items)).toEqual(['created this item'])
  })

  it('names parents by number', () => {
    expect(describeActivity(entry(null, 'id-12'), {}, items)).toEqual(['made this a subtask of #12'])
    expect(describeActivity(entry('id-12', 'id-30'), {}, items)).toEqual(['moved this from #12 to #30'])
    expect(describeActivity(entry('id-12', null), {}, items)).toEqual(['made this a separate task (it was a subtask of #12)'])
    expect(describeActivity(entry('gone', null), {}, items)).toEqual(['made this a separate task (it was a subtask of a deleted task)'])
  })
})
