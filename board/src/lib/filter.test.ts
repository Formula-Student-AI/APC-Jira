import { describe, expect, it } from 'vitest'
import type { FieldOption, Item, Member } from '../types'
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
    extra: { priority: 'High' },
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

function member(username: string, full_name: string): Member {
  return {
    username,
    full_name,
    email: `${username}@bristol.ac.uk`,
    github_login: null,
    is_board_admin: false,
    active: true,
    created_at: '2026-11-01T10:00:00Z',
  }
}

function option(field: string, name: string, leads: string[] = []): FieldOption {
  return { id: `${field}:${name}`, field, name, color: 'GRAY', description: null, sort_order: 1, leads, created_at: '' }
}

const members: Record<string, Member> = {
  xy12345: member('xy12345', 'Sam Example'),
  ab12345: member('ab12345', 'Alex Example'),
}

const options: FieldOption[] = [
  option('status', 'In Progress'),
  option('subteam', 'Braking System', ['ab12345']),
  option('subteam', 'Mechanical'),
  option('priority', 'Highest'),
  option('priority', 'High'),
]

const ctx: FilterContext = { me: 'xy12345', members, options }
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

  it('maps aliases to field keys', () => {
    expect(parseFilter('label:x priority:High lead:@me team-lead:ab12345 subsystem:Admin')).toEqual([
      { kind: 'qualifier', key: 'labels', values: ['x'], negate: false },
      { kind: 'qualifier', key: 'priority', values: ['High'], negate: false },
      { kind: 'qualifier', key: 'lead', values: ['@me'], negate: false },
      { kind: 'qualifier', key: 'lead', values: ['ab12345'], negate: false },
      { kind: 'qualifier', key: 'subteam', values: ['Admin'], negate: false },
    ])
  })

  it('treats unknown qualifiers (including removed fields) and empty values as free text', () => {
    expect(parseFilter('foo:bar size:M status: https://example.com')).toEqual([
      { kind: 'text', value: 'foo:bar', negate: false },
      { kind: 'text', value: 'size:M', negate: false },
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

  it('matches labels and priority', () => {
    expect(match('label:URGENT')).toBe(true)
    expect(match('priority:high')).toBe(true)
    expect(match('priority:Lowest')).toBe(false)
  })

  it('matches lead: against the leads of the item’s subteam', () => {
    expect(match('lead:ab12345')).toBe(true)
    expect(match('lead:alex')).toBe(true)
    expect(match('lead:@me')).toBe(false)
    expect(match('lead:@me', item(), { ...ctx, me: 'ab12345' })).toBe(true)
    expect(match('lead:ab12345', item({ subteam: 'Mechanical' }))).toBe(false)
    expect(match('lead:ab12345', item({ subteam: null }))).toBe(false)
    expect(match('lead:ab12345', item(), { me: null, members })).toBe(false)
  })

  it('supports no: and has:', () => {
    expect(match('no:assignee', item({ assignees: [] }))).toBe(true)
    expect(match('no:assignee')).toBe(false)
    expect(match('has:label')).toBe(true)
    expect(match('no:subteam', item({ subteam: null }))).toBe(true)
    expect(match('has:priority')).toBe(true)
    expect(match('no:priority', item({ extra: {} }))).toBe(true)
    expect(match('has:lead')).toBe(true)
    expect(match('no:lead', item({ subteam: 'Mechanical' }))).toBe(true)
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
  const full = { ...ctx, options }

  it('turns plain qualifiers into new-item values with canonical option names', () => {
    expect(
      defaultsFromFilter('assignee:@me status:"in progress" subteam:"braking system" label:x priority:HIGHEST', full),
    ).toEqual({
      assignees: ['xy12345'],
      status: 'In Progress',
      subteam: 'Braking System',
      labels: ['x'],
      extra: { priority: 'Highest' },
    })
  })

  it('ignores negated, multi-value, unknown, lead and free-text parts', () => {
    expect(
      defaultsFromFilter('-status:"In Progress" subteam:A,B status:Nope assignee:nobody lead:@me brake no:label', full),
    ).toEqual({})
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
