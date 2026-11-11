import { describe, expect, it } from 'vitest'
import type { FieldOption, Member, SubteamMember } from '../types'
import { leadRoster, notInASubteam, subteamPeople, subteamRoster } from './subteamRoster'

const member = (username: string, fullName: string, active = true): Member =>
  ({ username, full_name: fullName, active, is_board_admin: false, email: '', github_login: null, created_at: '' }) as Member
const members: Record<string, Member> = Object.fromEntries(
  [
    member('ab12345', 'Zoe Adams'),
    member('cd67890', 'amy brown'),
    member('ef11111', 'Ben Carr'),
    member('gh22222', 'Old Hand', false),
    member('ij33333', 'Ida Lead'),
  ].map((m) => [m.username, m]),
)
const subteam = (id: string, name: string, leads: string[] = []): FieldOption =>
  ({ id, field: 'subteam', name, color: 'BLUE', description: null, sort_order: 0, leads, parent_id: null, created_at: '' }) as FieldOption
const MECH = subteam('mech', 'Mechanical', ['ij33333'])
const ELEC = subteam('elec', 'Electrical')
const options = [MECH, ELEC]
const row = (s: string, username: string): SubteamMember => ({ subteam: s, username, added_by: null, added_at: '' })

describe('subteamRoster', () => {
  it("lists a subteam's members by name, whatever the case, and no one else's", () => {
    const rows = [row('mech', 'ab12345'), row('mech', 'cd67890'), row('elec', 'ef11111')]
    expect(subteamRoster(rows, MECH, members)).toEqual(['cd67890', 'ab12345'])
    expect(subteamRoster(rows, ELEC, members)).toEqual(['ef11111'])
    expect(subteamRoster(rows, subteam('gone', 'Gone'), members)).toEqual([])
  })

  it('leaves out anyone no longer a board member, and lists someone in it once', () => {
    expect(subteamRoster([row('mech', 'zz99999'), row('mech', 'ab12345'), row('mech', 'ab12345')], MECH, members)).toEqual(['ab12345'])
  })

  it("doesn't count the subteam's leads as members, even if they were put in it", () => {
    expect(subteamRoster([row('mech', 'ij33333'), row('mech', 'ab12345')], MECH, members)).toEqual(['ab12345'])
    // Leading another subteam doesn't stop someone being a member of this one.
    expect(subteamRoster([row('elec', 'ij33333')], ELEC, members)).toEqual(['ij33333'])
  })
})

describe('leadRoster', () => {
  it('lists the leads who are board members, by name, once each', () => {
    expect(leadRoster({ leads: ['ij33333', 'zz99999', 'cd67890', 'ij33333'] }, members)).toEqual(['cd67890', 'ij33333'])
  })
})

describe('notInASubteam', () => {
  it('lists the active members neither in nor leading a subteam, by name', () => {
    expect(notInASubteam(members, [row('mech', 'ab12345')], options)).toEqual(['cd67890', 'ef11111'])
  })

  it("counts someone in a subteam that has gone as not in one, and leaves retired members out", () => {
    expect(notInASubteam(members, [row('gone', 'ab12345'), row('elec', 'cd67890'), row('mech', 'ef11111')], options)).toEqual(['ab12345'])
  })
})

describe('subteamPeople', () => {
  it('offers the active leads first, then the active members, each by name', () => {
    const rows = [row('mech', 'ab12345'), row('mech', 'cd67890'), row('mech', 'gh22222'), row('mech', 'ij33333')]
    const withRetiredLead = { ...MECH, leads: ['ij33333', 'gh22222'] }
    expect(subteamPeople(withRetiredLead, rows, members)).toEqual([
      { username: 'ij33333', lead: true },
      { username: 'cd67890', lead: false },
      { username: 'ab12345', lead: false },
    ])
  })

  it('leaves out a retired member who leads nothing', () => {
    expect(subteamPeople(MECH, [row('mech', 'gh22222'), row('mech', 'ab12345')], members)).toEqual([
      { username: 'ij33333', lead: true },
      { username: 'ab12345', lead: false },
    ])
  })

  it('offers no one for no subteam, or a subteam with no one in it', () => {
    expect(subteamPeople(undefined, [row('mech', 'ab12345')], members)).toEqual([])
    expect(subteamPeople(ELEC, [], members)).toEqual([])
  })
})
