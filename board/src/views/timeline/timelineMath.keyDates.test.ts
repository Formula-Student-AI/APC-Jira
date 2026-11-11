// Whose milestones and phases run across every subteam on the Timeline (the whole team's, and Admin's,
// which stands for it) and whose stay in their own subteam's section.

import { describe, expect, it } from 'vitest'
import type { FieldOption } from '../../types'
import { isWholeTeam } from './timelineMath'

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
