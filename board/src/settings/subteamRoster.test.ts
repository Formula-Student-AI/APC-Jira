import { describe, expect, it } from 'vitest'
import type { FieldOption, Member, SubteamMember } from '../types'
import { notInASubteam, subteamRoster } from './subteamRoster'

const member = (username: string, fullName: string, active = true): Member =>
  ({ username, full_name: fullName, active, is_board_admin: false, email: '', github_login: null, created_at: '' }) as Member
const members: Record<string, Member> = Object.fromEntries(
  [member('ab12345', 'Zoe Adams'), member('cd67890', 'amy brown'), member('ef11111', 'Ben Carr'), member('gh22222', 'Old Hand', false)].map(
    (m) => [m.username, m],
  ),
)
const subteam = (id: string, name: string): FieldOption =>
  ({ id, field: 'subteam', name, color: 'BLUE', description: null, sort_order: 0, leads: [], parent_id: null, created_at: '' }) as FieldOption
const options = [subteam('mech', 'Mechanical'), subteam('elec', 'Electrical')]
const row = (s: string, username: string): SubteamMember => ({ subteam: s, username, added_by: null, added_at: '' })

describe('subteamRoster', () => {
  it("lists a subteam's members by name, whatever the case, and no one else's", () => {
    const rows = [row('mech', 'ab12345'), row('mech', 'cd67890'), row('elec', 'ef11111')]
    expect(subteamRoster(rows, 'mech', members)).toEqual(['cd67890', 'ab12345'])
    expect(subteamRoster(rows, 'elec', members)).toEqual(['ef11111'])
    expect(subteamRoster(rows, 'gone', members)).toEqual([])
  })

  it('leaves out anyone no longer a board member, and lists someone in it once', () => {
    expect(subteamRoster([row('mech', 'zz99999'), row('mech', 'ab12345'), row('mech', 'ab12345')], 'mech', members)).toEqual(['ab12345'])
  })
})

describe('notInASubteam', () => {
  it('lists the active members in no subteam, by name', () => {
    expect(notInASubteam(members, [row('mech', 'ab12345')], options)).toEqual(['cd67890', 'ef11111'])
  })

  it("counts someone in a subteam that has gone as not in one, and leaves retired members out", () => {
    expect(notInASubteam(members, [row('gone', 'ab12345'), row('elec', 'cd67890'), row('mech', 'ef11111')], options)).toEqual(['ab12345'])
  })
})
