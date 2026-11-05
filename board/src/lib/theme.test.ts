import { describe, expect, it } from 'vitest'
import { choiceFrom, DEFAULT_THEME, resolveTheme } from './theme'

describe('choiceFrom', () => {
  it('starts a first visit in light mode', () => {
    expect(DEFAULT_THEME).toBe('light')
    expect(choiceFrom(null)).toBe('light')
    expect(choiceFrom('nonsense')).toBe('light')
  })

  it('keeps a saved choice', () => {
    expect(choiceFrom('dark')).toBe('dark')
    expect(choiceFrom('light')).toBe('light')
    expect(choiceFrom('system')).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('follows the device only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
