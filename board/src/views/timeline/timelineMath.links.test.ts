import { describe, expect, it } from 'vitest'
import { datesClash } from '../../lib/links'
import type { Item } from '../../types'
import { DIAMOND_R, GROUP_H, linkPath, linkX, milestoneMarkers, ROW_H, rowLayout, shownBar, timelineLinks, type TimelineGroup } from './timelineMath'

function item(number: number, start: string | null, due: string | null, blocked_by: number[] = []): Item {
  return {
    id: `id-${number}`, number, title: `Item ${number}`, description: '', status: 'Todo', subteam: 'A', assignees: [],
    legacy_assignees: [], labels: [], start_date: start, due_date: due, blocked_reason: null, blocked_by, related_to: [], is_milestone: false, extra: {},
    position: number, archived: false, github_item_id: null, github_url: null, created_by: null, updated_by: null,
    created_at: '', updated_at: '',
  }
}

const range = { start: new Date(2026, 10, 1), days: 60 } // 1 Nov 2026
const groups: TimelineGroup[] = [
  { key: 'a', value: 'A', name: 'A', items: [item(1, '2026-11-01', '2026-11-05'), item(2, '2026-11-10', '2026-11-12', [1])] },
  { key: 'b', value: 'B', name: 'B', items: [item(3, '2026-11-03', '2026-11-04', [2])] },
]

describe('rowLayout', () => {
  it('stacks headings and rows, skipping the rows of collapsed groups', () => {
    const open = rowLayout(groups, new Set())
    expect(open.centres.get(1)).toBe(GROUP_H + ROW_H / 2)
    expect(open.centres.get(2)).toBe(GROUP_H + ROW_H + ROW_H / 2)
    expect(open.centres.get(3)).toBe(2 * GROUP_H + 2 * ROW_H + ROW_H / 2)
    expect(open.height).toBe(2 * GROUP_H + 3 * ROW_H)

    const closed = rowLayout(groups, new Set(['a']))
    expect(closed.centres.has(1)).toBe(false)
    expect(closed.centres.get(3)).toBe(2 * GROUP_H + ROW_H / 2)
  })
})

describe('linkPath', () => {
  it('draws an S from the end of one bar to the start of the next', () => {
    expect(linkPath(100, 18, 200, 54)).toBe('M100 18C140 18 160 54 200 54')
  })

  it('goes out, along the gap between the rows and back in when the next bar starts too early', () => {
    expect(linkPath(100, 18, 60, 90)).toBe('M100 18C114 18 114 36 100 36L60 36C46 36 46 90 60 90')
    expect(linkPath(100, 90, 60, 18)).toBe('M100 90C114 90 114 72 100 72L60 72C46 72 46 18 60 18')
  })
})

describe('timelineLinks', () => {
  it('links the end of each blocker to the start of what it blocks, flagging clashing dates', () => {
    const { centres } = rowLayout(groups, new Set())
    const lines = timelineLinks(groups, centres, range, 10, datesClash)
    expect(lines.map((l) => [l.key, l.clash])).toEqual([
      ['1>2', false], // #1 ends 5 Nov, #2 starts 10 Nov
      ['2>3', true], // #2 ends 12 Nov, #3 starts 3 Nov
    ])
    // #1's bar ends after day index 4 (5 Nov) -> x = 50; #2 starts at day index 9 -> x = 90.
    expect(lines[0].path.startsWith(`M50 ${GROUP_H + ROW_H / 2}`)).toBe(true)
    expect(lines[0].path.endsWith(`90 ${GROUP_H + ROW_H + ROW_H / 2}`)).toBe(true)
  })

  it('leaves out links to items that are hidden or have no bar', () => {
    const { centres } = rowLayout(groups, new Set(['b']))
    expect(timelineLinks(groups, centres, range, 10, datesClash).map((l) => l.key)).toEqual(['1>2'])
    const undated: TimelineGroup[] = [{ ...groups[0], items: [item(1, null, null), item(2, '2026-11-10', null, [1])] }]
    expect(timelineLinks(undated, rowLayout(undated, new Set()).centres, range, 10, datesClash)).toEqual([])
  })
})

describe('milestones', () => {
  const milestone = (number: number, start: string | null, due: string | null, extra: Partial<Item> = {}) => ({
    ...item(number, start, due),
    is_milestone: true,
    ...extra,
  })

  it('draws a milestone as one day: its due date, or its start date', () => {
    expect(shownBar(milestone(7, '2026-11-02', '2026-11-09'), range)).toEqual({ start: 8, end: 8 })
    expect(shownBar(milestone(7, '2026-11-02', null), range)).toEqual({ start: 1, end: 1 })
    expect(shownBar(item(7, '2026-11-02', '2026-11-09'), range)).toEqual({ start: 1, end: 8 })
  })

  it('meets links at the tips of the diamond', () => {
    const bar = { start: 8, end: 8 }
    expect(linkX(milestone(7, null, '2026-11-09'), bar, 'start', 10)).toBe(85 - DIAMOND_R)
    expect(linkX(milestone(7, null, '2026-11-09'), bar, 'end', 10)).toBe(85 + DIAMOND_R)
    expect(linkX(item(7, null, '2026-11-09'), bar, 'end', 10)).toBe(90)
  })

  it('lists dated, unarchived milestones in date order, at the centre of their day', () => {
    const markers = milestoneMarkers(
      [
        milestone(9, null, '2026-11-20', { title: 'FS UK' }),
        milestone(8, null, '2026-11-05', { title: 'Design freeze' }),
        milestone(10, null, null),
        milestone(11, null, '2026-11-06', { archived: true }),
        item(12, null, '2026-11-07'),
      ],
      range,
      10,
    )
    expect(markers.map((m) => [m.title, m.date, m.x])).toEqual([
      ['Design freeze', '2026-11-05', 45],
      ['FS UK', '2026-11-20', 195],
    ])
  })
})
