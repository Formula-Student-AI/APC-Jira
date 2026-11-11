// Whose milestones and phases run across every subteam on the Timeline (the whole team's, and Admin's,
// which stands for it) and whose stay in their own subteam's section; their names in a cascade of lines so
// none overlap; and headings that grow to hold them.

import { describe, expect, it } from 'vitest'
import type { FieldOption, Item } from '../../types'
import { cascadeLines, GROUP_H, isWholeTeam, ROW_H, rowLayout, type TimelineGroup } from './timelineMath'

describe('cascadeLines', () => {
  const at = (x0: number, x1: number) => ({ x0, x1 })

  it('keeps names that are clear of each other on the top line', () => {
    expect(cascadeLines([at(0, 50), at(60, 100), at(120, 200)], 6)).toEqual({ lines: [0, 0, 0], count: 1 })
  })

  it('steps names that would overlap down a line at a time, a cascade', () => {
    // Each starts before the one above it ends.
    expect(cascadeLines([at(0, 100), at(20, 120), at(40, 140), at(60, 160)], 6)).toEqual({ lines: [0, 1, 2, 3], count: 4 })
  })

  it('takes the top line again as soon as there is room, and keeps the gap between names on a line', () => {
    const { lines, count } = cascadeLines([at(0, 100), at(50, 150), at(104, 200), at(106, 200)], 6)
    // 104 is only 4 px after the first name ends, so it can't share its line; 106 can.
    expect(lines).toEqual([0, 1, 2, 0])
    expect(count).toBe(3)
  })

  it('looks at every name on a line, not only the last, so one placed first (Today) keeps its place', () => {
    // Today, at x 300, goes first; a name ending before it can still share the top line.
    expect(cascadeLines([at(300, 340), at(0, 100), at(250, 320)], 6)).toEqual({ lines: [0, 0, 1], count: 2 })
  })

  it('uses no lines for no names', () => {
    expect(cascadeLines([], 6)).toEqual({ lines: [], count: 0 })
  })
})

describe('rowLayout with taller headings', () => {
  const item = (number: number) => ({ number }) as Item
  const groups: TimelineGroup[] = [
    { key: 'a', value: 'Mechanical', name: 'Mechanical', items: [item(1), item(2)] },
    { key: 'b', value: 'Electrical', name: 'Electrical', items: [item(3)] },
  ]

  it('moves every row below a heading that grows, so the links still meet their bars', () => {
    const taller = rowLayout(groups, new Set(), (group) => (group.key === 'a' ? 67 : GROUP_H))
    expect(taller.centres.get(1)).toBe(67 + ROW_H / 2)
    expect(taller.centres.get(3)).toBe(67 + 2 * ROW_H + GROUP_H + ROW_H / 2)
    expect(taller.height).toBe(67 + GROUP_H + 3 * ROW_H)
    // Without heights, every heading is GROUP_H tall, as before.
    expect(rowLayout(groups, new Set()).height).toBe(2 * GROUP_H + 3 * ROW_H)
  })
})

const option = (field: string, name: string): FieldOption => ({
  id: `${field}-${name}`,
  field,
  name,
  color: 'BLUE',
  description: null,
  sort_order: 0,
  leads: [],
  parent_id: null,
  created_at: '',
})
const subteams = ['Mechanical', 'Electrical', 'Admin'].map((name) => option('subteam', name))

describe('isWholeTeam', () => {
  it('is true for the whole team (no subteam) and for Admin, which stands for it, whatever its case', () => {
    expect(isWholeTeam(null, subteams)).toBe(true)
    expect(isWholeTeam('', subteams)).toBe(true)
    expect(isWholeTeam('Admin', subteams)).toBe(true)
    expect(isWholeTeam('admin', subteams)).toBe(true)
  })

  it('is false for any other subteam on the board, whose milestones and phases stay in its own section', () => {
    expect(isWholeTeam('Mechanical', subteams)).toBe(false)
    expect(isWholeTeam('Electrical', subteams)).toBe(false)
  })

  it('is true for a subteam no longer on the board, as its items are listed under No subteam', () => {
    expect(isWholeTeam('Autonomy', subteams)).toBe(true)
    // Only subteam options count: a domain or status of the same name doesn't make it a subteam.
    expect(isWholeTeam('Chassis', [...subteams, option('domain', 'Chassis')])).toBe(true)
  })
})
