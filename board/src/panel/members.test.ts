import { describe, expect, it } from 'vitest'
import { groupMemberRows, type MemberRow } from './members'

const row = (username: string, selected = false): MemberRow => ({ username, name: username.toUpperCase(), selected, retired: false })

describe('groupMemberRows', () => {
  const rows = [row('aa11111'), row('bb22222', true), row('cc33333'), row('dd44444')]

  it('lists the given people first, in their order, then everyone else in the order given', () => {
    const { first, rest } = groupMemberRows(rows, ['cc33333', 'aa11111'])
    expect(first.map((r) => r.username)).toEqual(['cc33333', 'aa11111'])
    expect(rest.map((r) => r.username)).toEqual(['bb22222', 'dd44444'])
  })

  it('leaves out people not in the rows (filtered out by a search, say) and lists each once', () => {
    const { first, rest } = groupMemberRows(rows, ['zz99999', 'bb22222', 'bb22222'])
    expect(first).toEqual([row('bb22222', true)])
    expect(rest.map((r) => r.username)).toEqual(['aa11111', 'cc33333', 'dd44444'])
  })

  it('puts everyone in the rest when there is no one to list first', () => {
    expect(groupMemberRows(rows, [])).toEqual({ first: [], rest: rows })
  })
})
