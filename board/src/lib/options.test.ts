import { describe, expect, it } from 'vitest'
import type { FieldOption, OptionColor } from '../types'
import { canManageDomains, domainsOf, findDomain, nextDomainColor, subteamChange, subteamLeads } from './options'

function option(id: string, field: string, name: string, extra: Partial<FieldOption> = {}): FieldOption {
  return { id, field, name, color: 'GRAY', description: null, sort_order: 1, leads: [], parent_id: null, created_at: '', ...extra }
}

const electrical = option('elec', 'subteam', 'Electrical', { leads: ['ab12345'] })
const mechanical = option('mech', 'subteam', 'Mechanical')
const options: FieldOption[] = [
  option('d1', 'domain', 'LV systems', { parent_id: 'elec', sort_order: 1, color: 'BLUE' }),
  option('d2', 'domain', 'Accumulator', { parent_id: 'elec', sort_order: 2 }),
  option('d3', 'domain', 'LV systems', { parent_id: 'mech' }),
  option('d4', 'domain', 'Chassis', { parent_id: 'mech' }),
  option('s1', 'status', 'Todo'),
  electrical,
  mechanical,
]

const me = { username: 'ab12345', active: true }
const trusted = { adminActive: false, sessionTrusted: true }

describe('domains', () => {
  it("lists only that subteam's domains, in order", () => {
    expect(domainsOf(options, 'Electrical').map((d) => d.id)).toEqual(['d1', 'd2'])
    expect(domainsOf(options, 'Mechanical').map((d) => d.id)).toEqual(['d3', 'd4'])
    expect(domainsOf(options, null)).toEqual([])
    expect(domainsOf(options, 'Powertrain')).toEqual([])
  })

  it('finds a domain within its subteam only', () => {
    expect(findDomain(options, 'Electrical', 'LV systems')?.id).toBe('d1')
    expect(findDomain(options, 'Mechanical', 'LV systems')?.id).toBe('d3')
    expect(findDomain(options, 'Electrical', 'Chassis')).toBeUndefined()
    expect(findDomain(options, 'Electrical', null)).toBeUndefined()
  })

  it('clears the domain on a subteam change unless the new subteam has one of that name', () => {
    expect(subteamChange(options, { domain: 'LV systems' }, 'Mechanical')).toEqual({ subteam: 'Mechanical' })
    expect(subteamChange(options, { domain: 'Accumulator' }, 'Mechanical')).toEqual({ subteam: 'Mechanical', domain: null })
    expect(subteamChange(options, { domain: 'Accumulator' }, null)).toEqual({ subteam: null, domain: null })
    expect(subteamChange(options, { domain: null }, 'Mechanical')).toEqual({ subteam: 'Mechanical' })
  })

  it('still finds subteam leads', () => {
    expect(subteamLeads(options, 'Electrical')).toEqual(['ab12345'])
    expect(subteamLeads(options, null)).toEqual([])
  })
})

describe('canManageDomains', () => {
  it('lets a lead manage their own subteam on a trusted session', () => {
    expect(canManageDomains(electrical, me, trusted)).toBe(true)
    expect(canManageDomains(mechanical, me, trusted)).toBe(false)
  })

  it('needs a trusted session and an active member', () => {
    expect(canManageDomains(electrical, me, { adminActive: false, sessionTrusted: false })).toBe(false)
    expect(canManageDomains(electrical, { ...me, active: false }, trusted)).toBe(false)
    expect(canManageDomains(electrical, null, trusted)).toBe(false)
  })

  it('lets board admins manage every subteam, but only subteams', () => {
    const admin = { adminActive: true, sessionTrusted: true }
    expect(canManageDomains(mechanical, { username: 'zz00000', active: true }, admin)).toBe(true)
    expect(canManageDomains(undefined, me, admin)).toBe(false)
    expect(canManageDomains(option('s1', 'status', 'Todo'), me, admin)).toBe(false)
  })
})

describe('nextDomainColor', () => {
  it('picks the first colour not used yet, then cycles', () => {
    expect(nextDomainColor([])).toBe('BLUE')
    expect(nextDomainColor(domainsOf(options, 'Electrical'))).toBe('GREEN')
    const all: OptionColor[] = ['BLUE', 'GREEN', 'PURPLE', 'ORANGE', 'PINK', 'YELLOW', 'RED', 'GRAY']
    const full = all.map((color, i) => option(`c${i}`, 'domain', `D${i}`, { color, parent_id: 'elec' }))
    expect(nextDomainColor(full)).toBe('BLUE')
  })
})
