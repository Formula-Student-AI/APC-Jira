import { describe, expect, it } from 'vitest'
import type { FieldOption, Item, SubteamMember } from '../types'
import { deletionText, joinNames, memberUse } from './memberDeletion'

function option(id: string, field: string, name: string, leads: string[] = []): FieldOption {
  return { id, field, name, color: 'GRAY', description: null, sort_order: 1, leads, parent_id: null, created_at: '' }
}

// memberUse only looks at assignees.
const item = (assignees: string[], archived = false) => ({ assignees, archived }) as Item

describe('memberUse', () => {
  const options = [
    option('s1', 'status', 'Todo'),
    option('elec', 'subteam', 'Electrical', ['ab12345', 'cd67890']),
    option('mech', 'subteam', 'Mechanical'),
    option('pow', 'subteam', 'Powertrain', ['ab12345']),
  ]

  it('counts the items they are assigned to, archived ones too', () => {
    const items = [item(['ab12345']), item(['cd67890', 'ab12345']), item(['cd67890']), item(['ab12345'], true), item([])]
    expect(memberUse(items, options, 'ab12345').assigned).toBe(3)
    expect(memberUse(items, options, 'cd67890').assigned).toBe(2)
    expect(memberUse(items, options, 'zz99999').assigned).toBe(0)
  })

  it('lists the subteams they lead, in board order', () => {
    expect(memberUse([], options, 'ab12345').leads).toEqual(['Electrical', 'Powertrain'])
    expect(memberUse([], options, 'cd67890').leads).toEqual(['Electrical'])
    expect(memberUse([], options, 'zz99999').leads).toEqual([])
  })

  it('only counts leads on subteams', () => {
    expect(memberUse([], [option('d1', 'domain', 'LV systems', ['ab12345'])], 'ab12345').leads).toEqual([])
  })

  it('lists the subteams they are in, in board order, leaving out ones no longer on the board', () => {
    const row = (subteam: string, username: string): SubteamMember => ({ subteam, username, added_by: null, added_at: '' })
    const rows = [row('pow', 'ab12345'), row('elec', 'ab12345'), row('gone', 'ab12345'), row('mech', 'cd67890')]
    expect(memberUse([], options, 'ab12345', rows).inSubteams).toEqual(['Electrical', 'Powertrain'])
    expect(memberUse([], options, 'cd67890', rows).inSubteams).toEqual(['Mechanical'])
    expect(memberUse([], options, 'zz99999', rows).inSubteams).toEqual([])
    expect(memberUse([], options, 'ab12345').inSubteams).toEqual([])
  })
})

describe('joinNames', () => {
  it('joins names in plain English', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['Electrical'])).toBe('Electrical')
    expect(joinNames(['Electrical', 'Admin'])).toBe('Electrical and Admin')
    expect(joinNames(['Electrical', 'Admin', 'Powertrain'])).toBe('Electrical, Admin and Powertrain')
  })
})

describe('deletionText', () => {
  const rest = 'Their past changes stay in the history, under their username, and any device signed in as them is signed out.'

  it('says what they are taken off', () => {
    expect(deletionText({ assigned: 3, leads: [], inSubteams: [] })).toBe(`They'll be taken off the 3 items they're assigned to. ${rest}`)
    expect(deletionText({ assigned: 1, leads: [], inSubteams: [] })).toBe(`They'll be taken off the item they're assigned to. ${rest}`)
    expect(deletionText({ assigned: 0, leads: ['Electrical', 'Admin'], inSubteams: [] })).toBe(`They'll no longer lead Electrical and Admin. ${rest}`)
    expect(deletionText({ assigned: 2, leads: ['Electrical'], inSubteams: [] })).toBe(
      `They'll be taken off the 2 items they're assigned to and no longer lead Electrical. ${rest}`,
    )
  })

  it('says which subteams they are taken out of, after the rest', () => {
    expect(deletionText({ assigned: 0, leads: [], inSubteams: ['Mechanical'] })).toBe(`They'll be taken out of Mechanical. ${rest}`)
    expect(deletionText({ assigned: 2, leads: ['Electrical'], inSubteams: ['Electrical', 'Admin'] })).toBe(
      `They'll be taken off the 2 items they're assigned to, no longer lead Electrical and be taken out of Electrical and Admin. ${rest}`,
    )
  })

  it('leaves that out when they have nothing', () => {
    expect(deletionText({ assigned: 0, leads: [], inSubteams: [] })).toBe(rest)
  })
})
