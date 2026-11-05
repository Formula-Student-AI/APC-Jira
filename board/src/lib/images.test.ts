import { describe, expect, it } from 'vitest'
import { fitWithin, formatBytes } from './images'

describe('fitWithin', () => {
  it('shrinks the longest side to the limit, keeping the shape', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(5000, 10, 400)).toEqual({ width: 400, height: 1 })
  })

  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

describe('formatBytes', () => {
  it('reads like a file manager', () => {
    expect(formatBytes(820)).toBe('820 bytes')
    expect(formatBytes(250_000)).toBe('244 KB')
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1.3 MB')
    expect(formatBytes(900 * 1024 * 1024)).toBe('900 MB')
  })
})
