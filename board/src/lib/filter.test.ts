import { describe, expect, it } from 'vitest'
import type { Item, Member } from '../types'
import { combineFilters, defaultsFromFilter, matchesFilter, parseFilter, tokenize, type FilterContext } from './filter'

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'id-' + (overrides.number ?? 1),
    number: 1,
    title: 'Design brake pedal box',
    description: 'Check the **pedal ratio** with the driver.',
    status: 'Todo',
    subteam: 'Braking System',
    assignees: ['xy12345'],
    legacy_assignees: [],
    labels: ['urgent'],
    start_date: '2026-11-01',
    due_date: '2026-11-20',
    blocked_reason: null,
    blocked_by: [],
    extra: { priority: 'Normal', size: 'M', work_package: 'WBS 1.2.3', team_lead: 'ab12345' },
    position: 1,
    archived: false,
    github_item_id: null,
    github_url: null,
    created_by: 'xy12345',
    updated_by: 'xy12345',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    ...overrides,
  }
}

const members: Record<string, Member> = {
  xy12345: {
    username: 'xy12345',
    full_name: 'Sam Example',
    email: 'xy12345@bristol.ac.uk',
    github_login: null,
    is_board_admin: true,
    active: true,
    created_at: '2026-11-01T10:00:00Z',
  },
  ab12345: {
    username: 'ab12345',
    full_name: 'Alex Example',
    email: 'ab12345@bristol.ac.uk',
    github_login: null,
    is_board_admin: false,
    active: true,
    created_at: '2026-11-01T10:00:00Z',
  },
}

const ctx: FilterContext = { me: 'xy12345', members }
const match = (filter: string, it: Item = item(), context: FilterContext = ctx) =>
  matchesFilter(it, parseFilter(filter), context)

describe('tokenize', () => {
  it('splits on spaces but keeps quoted values together', () => {
    expect(tokenize('subteam:"Braking System"  status:Todo  "brake pads"')).toEqual([
      'subteam:"Braking System"',
      'status:Todo',
      '"brake pads"',
    ])
  })
})

describe('parseFilter', () => {
  it('parses qualifiers, @me, quotes, commas and negation', () => {
    expect(parseFilter('assignee:@me subteam:"Braking System" -status:Done,"In Review" brake')).toEqual([
      { kind: 'qualifier', key: 'assignees', values: ['@me'], negate: false },
      { kind: 'qualifier', key: 'subteam', values: ['Braking System'], negate: false },
      { kind: 'qualifier', key: 'status', values: ['Done', 'In Review'], negate: true },
      { kind: 'text', value: 'brake', negate: false },
    ])
  })

  it('maps aliases and custom fields to field keys', () => {
    expect(parseFilter('label:x difficulty-level:D2 task-force:"1 person" lead:ab12345 subsystem:Admin')).toEqual([
      { kind: 'qualifier', key: 'labels', values: ['x'], negate: false },
      { kind: 'qualifier', key: 'difficulty', values: ['D2'], negate: false },
      { kind: 'qualifier', key: 'task_force', values: ['1 person'], negate: false },
      { kind: 'qualifier', key: 'team_lead', values: ['ab12345'], negate: false },
      { kind: 'qualifier', key: 'subteam', values: ['Admin'], negate: false },
    ])
  })

  it('treats unknown qualifiers and empty values as free text', () => {
    expect(parseFilter('foo:bar status: https://example.com')).toEqual([
      { kind: 'text', value: 'foo:bar', negate: false },
      { kind: 'text', value: 'status:', negate: false },
      { kind: 'text', value: 'https://example.com', negate: false },
    ])
  })

  it('keeps a lone minus as text and returns nothing for blank input', () => {
    expect(parseFilter('-')).toEqual([{ kind: 'text', value: '-', negate: false }])
    expect(parseFilter('   ')).toEqual([])
  })
})

describe('matchesFilter', () => {
  it('matches everything (except archived) with an empty filter', () => {
    expect(match('')).toBe(true)
    expect(match('', item({ archived: true }))).toBe(false)
  })

  it('handles assignee:@me for the logged-in member only', () => {
    expect(match('assignee:@me')).toBe(true)
    expect(match('assignee:@me', item({ assignees: ['ab12345'] }))).toBe(false)
    expect(match('assignee:@me', item(), { me: null, members })).toBe(false)
  })

  it('matches assignees by username or part of their name', () => {
    expect(match('assignee:XY12345')).toBe(true)
    expect(match('assignee:sam')).toBe(true)
    expect(match('assignee:alex')).toBe(false)
  })

  it('matches multi-word subteams, case-insensitively', () => {
    expect(match('subteam:"braking system"')).toBe(true)
    expect(match('subteam:Mechanical')).toBe(false)
  })

  it('ORs comma-separated values and negates with a minus', () => {
    expect(match('status:Done,Todo')).toBe(true)
    expect(match('-status:Todo')).toBe(false)
    expect(match('-status:Done')).toBe(true)
  })

  it('ANDs tokens together', () => {
    expect(match('status:Todo label:urgent')).toBe(true)
    expect(match('status:Todo label:nope')).toBe(false)
  })

  it('matches labels and custom fields', () => {
    expect(match('label:URGENT')).toBe(true)
    expect(match('priority:normal size:M')).toBe(true)
    expect(match('priority:Stretch')).toBe(false)
    expect(match('work-package:1.2')).toBe(true)
    expect(match('team-lead:alex')).toBe(true)
  })

  it('supports no: and has:', () => {
    expect(match('no:assignee', item({ assignees: [] }))).toBe(true)
    expect(match('no:assignee')).toBe(false)
    expect(match('has:label')).toBe(true)
    expect(match('no:subteam', item({ subteam: null }))).toBe(true)
    expect(match('has:priority')).toBe(true)
    expect(match('no:reviewer')).toBe(true)
  })

  it('supports is:blocked and is:archived', () => {
    expect(match('is:blocked', item({ status: 'Blocked' }))).toBe(true)
    expect(match('is:blocked')).toBe(false)
    expect(match('is:archived', item({ archived: true }))).toBe(true)
    expect(match('is:archived')).toBe(false)
  })

  it('matches free text in the title or description, and #numbers', () => {
    expect(match('pedal')).toBe(true)
    expect(match('"pedal ratio"')).toBe(true)
    expect(match('brake pedal')).toBe(true)
    expect(match('gearbox')).toBe(false)
    expect(match('-gearbox')).toBe(true)
    expect(match('#1')).toBe(true)
    expect(match('#7')).toBe(false)
  })

  it('applies the Blocked view filter', () => {
    expect(match('status:Blocked', item({ status: 'Blocked' }))).toBe(true)
    expect(match('status:Blocked')).toBe(false)
  })
})

describe('defaultsFromFilter', () => {
  const options = [
    { id: '1', field: 'status', name: 'In Progress', color: 'YELLOW', description: null, sort_order: 2, created_at: '' },
    { id: '2', field: 'subteam', name: 'Braking System', color: 'PURPLE', description: null, sort_order: 4, created_at: '' },
    { id: '3', field: 'priority', name: 'Critical path', color: 'RED', description: null, sort_order: 1, created_at: '' },
  ] as const
  const full = { ...ctx, options: [...options] }

  it('turns plain qualifiers into new-item values with canonical option names', () => {
    expect(
      defaultsFromFilter('assignee:@me status:"in progress" subteam:"braking system" label:x priority:"critical PATH"', full),
    ).toEqual({
      assignees: ['xy12345'],
      status: 'In Progress',
      subteam: 'Braking System',
      labels: ['x'],
      extra: { priority: 'Critical path' },
    })
  })

  it('ignores negated, multi-value, unknown and free-text parts', () => {
    expect(defaultsFromFilter('-status:"In Progress" subteam:A,B status:Nope assignee:nobody brake no:label', full)).toEqual({})
  })

  it('needs a signed-in member for @me', () => {
    expect(defaultsFromFilter('assignee:@me', { ...full, me: null })).toEqual({})
  })
})

describe('combineFilters', () => {
  it('joins non-empty parts', () => {
    expect(combineFilters('assignee:@me', '', '  status:Todo ', undefined)).toBe('assignee:@me status:Todo')
  })
})
