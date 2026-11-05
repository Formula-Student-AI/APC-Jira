import { describe, expect, it } from 'vitest'
import type { TableViewConfig } from '../config'
import { columnsWidth, countText, firstName, formatCellDay, isBlockedView, tableColumns } from './columns'

const view: TableViewConfig = { id: 'blocked', name: 'Blocked', layout: 'table', filter: 'status:Blocked', columns: [] }

describe('tableColumns', () => {
  it('labels columns from the field definitions', () => {
    const columns = tableColumns(['assignees', 'difficulty', 'team_lead', 'blocked_reason'])
    expect(columns.map((c) => c.label)).toEqual(['Assignees', 'Difficulty level', 'Team lead', 'Blocked reason'])
    expect(columns.filter((c) => c.grow).map((c) => c.key)).toEqual(['blocked_reason'])
    expect(columnsWidth(columns)).toBe(128 + 132 + 168 + 280)
  })
})

describe('isBlockedView', () => {
  it('recognises views that only show blocked items', () => {
    expect(isBlockedView(view)).toBe(true)
    expect(isBlockedView({ ...view, filter: 'is:blocked subteam:Electrical' })).toBe(true)
    expect(isBlockedView({ ...view, filter: '-status:Blocked' })).toBe(false)
    expect(isBlockedView({ ...view, filter: 'status:Blocked,Todo' })).toBe(false)
    expect(isBlockedView({ ...view, filter: '' })).toBe(false)
  })
})

describe('countText', () => {
  it('counts items and says how many the filter box hides', () => {
    expect(countText(3, 3, 'blocked item', false)).toBe('3 blocked items')
    expect(countText(1, 1, 'blocked item', false)).toBe('1 blocked item')
    expect(countText(2, 5, 'blocked item', true)).toBe('2 of 5 blocked items')
    expect(countText(4, 4, 'item', true)).toBe('4 items')
  })
})

describe('firstName', () => {
  it('takes the first word of a full name', () => {
    expect(firstName(' Alex  Smith ')).toBe('Alex')
    expect(firstName('Sam')).toBe('Sam')
  })
})

describe('formatCellDay', () => {
  it('leaves the year out for dates this year', () => {
    expect(formatCellDay('2026-11-04', '2026-11-05')).toBe('4 Nov')
    expect(formatCellDay('2027-01-20', '2026-11-05')).toBe('20 Jan 2027')
    expect(formatCellDay(null, '2026-11-05')).toBe('')
  })
})
