import { describe, expect, it } from 'vitest'
import { matchesFilter, parseFilter } from '../lib/filter'
import { formatHash, parseHash } from '../lib/router'
import type { FieldOption, Item } from '../types'
import { VIEWS, type BoardViewConfig, type ViewConfig } from './config'
import { boardForSubteams, filterWithSubteams, shownSubteams, subteamsFilter } from './subteams'

const option = (name: string, sort_order: number): FieldOption => ({
  id: name,
  field: 'subteam',
  name,
  color: 'GRAY',
  description: null,
  sort_order,
  parent_id: null,
  leads: [],
  created_at: '',
})
const options = [option('Mechanical', 1), option('Powertrain', 2), option('Braking System', 3)]
const view = (id: string) => VIEWS.find((v) => v.id === id) as ViewConfig
const subteamBoard = view('subteam-board') as BoardViewConfig
const timeline = view('timeline')

describe('subteamsFilter', () => {
  it('quotes each name and ORs them', () => {
    expect(subteamsFilter([])).toBe('')
    expect(subteamsFilter(['Braking System', 'Mechanical'])).toBe('subteam:"Braking System","Mechanical"')
  })

  it('matches items of those subteams only', () => {
    const tokens = parseFilter(subteamsFilter(['Braking System', 'Mechanical']))
    const ctx = { me: null, members: {} }
    const item = (subteam: string | null) => ({ subteam, archived: false, title: '', description: '', number: 1 }) as Item
    expect(matchesFilter(item('Braking System'), tokens, ctx)).toBe(true)
    expect(matchesFilter(item('Mechanical'), tokens, ctx)).toBe(true)
    expect(matchesFilter(item('Powertrain'), tokens, ctx)).toBe(false)
    expect(matchesFilter(item(null), tokens, ctx)).toBe(false)
  })
})

describe('shownSubteams', () => {
  it('keeps existing picks in board order and drops unknown ones', () => {
    expect(shownSubteams(timeline, ['Braking System', 'Gone', 'Mechanical'], options)).toEqual(['Mechanical', 'Braking System'])
  })

  it('shows one subteam on the Subteam Board only when exactly one is picked', () => {
    expect(shownSubteams(subteamBoard, ['Powertrain'], options)).toEqual(['Powertrain'])
    expect(shownSubteams(subteamBoard, ['Powertrain', 'Mechanical'], options)).toEqual([])
    expect(shownSubteams(subteamBoard, [], options)).toEqual([])
  })

  it('ignores picks on views without a subteam bar', () => {
    expect(shownSubteams(view('kanban'), ['Mechanical'], options)).toEqual([])
  })
})

describe('boardForSubteams', () => {
  it('turns the Subteam Board into one subteam in Status columns', () => {
    const board = boardForSubteams(subteamBoard, ['Braking System'])
    expect(board).toMatchObject({ columnField: 'status', swimlaneField: null, filter: 'subteam:"Braking System"' })
  })

  it('leaves the board alone when all subteams are shown', () => {
    expect(boardForSubteams(subteamBoard, [])).toBe(subteamBoard)
  })

  it('adds the pick to the view filter', () => {
    expect(filterWithSubteams(view('blocked'), ['Mechanical'])).toBe('status:Blocked subteam:"Mechanical"')
  })
})

describe('router teams', () => {
  it('round-trips several subteams, including names with spaces and commas', () => {
    const route = { view: 'timeline' as const, item: null, q: '', teams: ['Braking System', 'A, B'] }
    const hash = formatHash(route)
    expect(hash).toBe('#/timeline?team=Braking+System&team=A%2C+B')
    expect(parseHash(hash).teams).toEqual(['Braking System', 'A, B'])
  })
})
