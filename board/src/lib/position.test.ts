import { describe, expect, it } from 'vitest'
import { byPosition, positionBetween, respace } from './position'

describe('positionBetween', () => {
  it('puts an item between, before or after its neighbours', () => {
    expect(positionBetween(1, 2)).toBe(1.5)
    expect(positionBetween(undefined, 5)).toBe(4)
    expect(positionBetween(5, undefined)).toBe(6)
  })

  it('returns null when there is no room left', () => {
    expect(positionBetween(1, 1 + 1e-9)).toBeNull()
  })

  it('returns a timestamp-like value for an empty column', () => {
    expect(positionBetween(undefined, undefined)).toBeGreaterThan(1_700_000_000)
  })
})

describe('respace', () => {
  it('spaces items evenly in the given order', () => {
    expect([...respace(['a', 'b', 'c'], 10)]).toEqual([
      ['a', 10],
      ['b', 11],
      ['c', 12],
    ])
  })
})

describe('byPosition', () => {
  it('sorts by position, then number', () => {
    const items = [
      { position: 2, number: 1 },
      { position: 1, number: 3 },
      { position: 1, number: 2 },
    ]
    expect(items.sort(byPosition)).toEqual([
      { position: 1, number: 2 },
      { position: 1, number: 3 },
      { position: 2, number: 1 },
    ])
  })
})
