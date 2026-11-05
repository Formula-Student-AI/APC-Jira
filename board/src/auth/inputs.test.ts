import { describe, expect, it } from 'vitest'
import { cleanCodeInput, cleanUsernameInput } from './inputs'

describe('cleanUsernameInput', () => {
  it('lowercases and drops spaces', () => {
    expect(cleanUsernameInput('XY12345 ')).toBe('xy12345')
    expect(cleanUsernameInput(' ab 12345')).toBe('ab12345')
  })

  it('drops a typed or pasted email domain', () => {
    expect(cleanUsernameInput('XY12345@bristol.ac.uk')).toBe('xy12345')
    expect(cleanUsernameInput('xy12345@')).toBe('xy12345')
  })
})

describe('cleanCodeInput', () => {
  it('keeps at most six digits', () => {
    expect(cleanCodeInput('12 34-56')).toBe('123456')
    expect(cleanCodeInput('1234567')).toBe('123456')
    expect(cleanCodeInput('abc')).toBe('')
  })
})
