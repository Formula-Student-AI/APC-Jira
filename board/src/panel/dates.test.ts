import { describe, expect, it } from 'vitest'
import { isWholeDay } from '../lib/format'
import {
  datesBlocked,
  HALF_TYPED,
  isFilledIn,
  isTyped,
  leftBox,
  planDates,
  readDateBox,
  shownDate,
  waitsForLeave,
  type DateDrafts,
} from './dates'

const box = (value: string, badInput = false) => readDateBox({ value, validity: { badInput } as ValidityState })
const empty = { start_date: null, due_date: null }

describe('date boxes', () => {
  it('knows a whole date from one still being typed', () => {
    expect(isWholeDay('2026-11-06')).toBe(true)
    expect(isWholeDay('0002-11-06')).toBe(false)
    expect(isWholeDay('0202-11-06')).toBe(false)
    expect(isWholeDay('20261-11-06')).toBe(false)
    expect(isWholeDay('')).toBe(false)
    expect(box('2026-11-06')).toEqual({ value: '2026-11-06', done: true })
    expect(box('0020-11-06')).toEqual({ value: '0020-11-06', done: false })
    // '' is an empty box, or a half-typed one ("06/11/yyyy"), which the browser flags as bad input.
    expect(box('')).toEqual({ value: '', done: true })
    expect(box('', true)).toEqual({ value: '', done: false })
  })

  it('keeps showing the day and month while the year is typed; a whole year gives a date to save', () => {
    // The box reports each step of the year; none is saved, and the box shows exactly what it holds.
    for (const value of ['0002-11-06', '0020-11-06', '0202-11-06']) {
      const plan = planDates(empty, { due_date: box(value) })
      expect(plan.patch).toBeNull()
      expect(shownDate(empty, plan.drafts, 'due_date')).toBe(value)
    }
    expect(planDates(empty, { due_date: box('2026-11-06') })).toEqual({ drafts: {}, patch: { due_date: '2026-11-06' } })
  })

  it('never clears a saved date while it is half-typed (a leading zero, or Backspace in one part)', () => {
    const item = { start_date: null, due_date: '2026-11-20' }
    const plan = planDates(item, { due_date: box('', true) })
    expect(plan.patch).toBeNull()
    expect(shownDate(item, plan.drafts, 'due_date')).toBe('')
    // Typing on finishes it.
    expect(planDates(item, { due_date: box('2026-11-07') }).patch).toEqual({ due_date: '2026-11-07' })
  })

  it('shows the saved date again when a box is left half-typed, and clears one left empty', () => {
    const item = { start_date: '2026-11-02', due_date: '2026-11-20' }
    const typing: DateDrafts = { due_date: box('', true) }
    const left = leftBox(typing, 'due_date', HALF_TYPED)
    expect(left).toEqual({})
    expect(shownDate(item, left, 'due_date')).toBe('2026-11-20')
    // Emptied with Backspace in every part: the box only says it's empty (not half-typed) as it's left.
    expect(planDates(item, leftBox(typing, 'due_date', box(''))).patch).toEqual({ due_date: null })
    expect(planDates(empty, { start_date: box('') }).patch).toBeNull()
  })

  it('saves nothing while the start is after the due date, then both dates at once', () => {
    const item = { start_date: '2026-11-02', due_date: '2026-11-20' }
    const late = planDates(item, { start_date: box('2026-11-25') })
    expect(late.patch).toBeNull()
    expect(datesBlocked(item, late.drafts)).toBe(true)
    expect(shownDate(item, late.drafts, 'start_date')).toBe('2026-11-25')
    const fixed = planDates(item, { ...late.drafts, due_date: box('2026-11-30') })
    expect(fixed).toEqual({ drafts: {}, patch: { start_date: '2026-11-25', due_date: '2026-11-30' } })
  })

  it('plans the held-back date once the saved dates allow it', () => {
    const late: DateDrafts = { start_date: box('2026-11-25') }
    expect(datesBlocked({ start_date: '2026-11-02', due_date: '2026-11-20' }, late)).toBe(true)
    // Someone moves the due date to 30 Nov (the Timeline, or a live change).
    const moved = { start_date: '2026-11-02', due_date: '2026-11-30' }
    expect(datesBlocked(moved, late)).toBe(false)
    expect(planDates(moved, late)).toEqual({ drafts: {}, patch: { start_date: '2026-11-25' } })
  })

  it("doesn't pin a box left untouched while the dates are out of order", () => {
    const item = { start_date: '2026-11-02', due_date: '2026-11-20' }
    // Start 25 Nov is held back; the due box is clicked into and left without typing.
    const plan = planDates(item, { start_date: box('2026-11-25'), due_date: box('2026-11-20') })
    expect(plan).toEqual({ drafts: { start_date: box('2026-11-25') }, patch: null })
    // So the due box follows a later change from someone else, and the held start is saved.
    expect(shownDate({ ...item, due_date: '2026-11-30' }, plan.drafts, 'due_date')).toBe('2026-11-30')
    expect(planDates({ ...item, due_date: '2026-11-30' }, plan.drafts).patch).toEqual({ start_date: '2026-11-25' })
    // Nothing to drop: the same drafts come back (no needless re-render).
    const held: DateDrafts = { start_date: box('2026-11-25') }
    expect(planDates(item, held).drafts).toBe(held)
  })

  it('counts a half-typed box as its saved date, for saving and for the error', () => {
    const item = { start_date: '2026-11-10', due_date: '2026-11-20' }
    const typing = box('0002-11-20')
    const plan = planDates(item, { due_date: typing, start_date: box('2026-11-15') })
    expect(plan).toEqual({ drafts: { due_date: typing }, patch: { start_date: '2026-11-15' } })
    // A start after the saved due date waits, and the error stays, whatever the half-typed due date says.
    const late: DateDrafts = { due_date: box('', true), start_date: box('2026-11-25') }
    expect(planDates(item, late).patch).toBeNull()
    expect(datesBlocked(item, late)).toBe(true)
  })

  it('sends nothing when nothing changed', () => {
    const item = { start_date: '2026-11-10', due_date: null }
    expect(planDates(item, { start_date: box('2026-11-10'), due_date: box('') })).toEqual({ drafts: {}, patch: null })
  })
})

describe('what made a date box change', () => {
  const half = true
  const filled = box('2026-11-01')

  it('tells typed changes from others, including a digit Firefox held back until focus moved on', () => {
    expect(isTyped('7', null)).toBe(true)
    expect(isTyped('ArrowUp', null)).toBe(false)
    expect(isTyped(null, null)).toBe(false)
    // Firefox commits a held "3" (or "1") as Tab or a click moves focus on: still typed.
    expect(isTyped('Tab', '3')).toBe(true)
    expect(isTyped(null, '1')).toBe(true)
    // A pending "0" is Chrome's lone zero: what follows is its fill-in, not typing.
    expect(isTyped('Tab', '0')).toBe(false)
  })

  it('waits for the box to be left for typed and emptied boxes, but not for a picked date', () => {
    expect(waitsForLeave(box('2026-11-02'), true)).toBe(true)
    expect(waitsForLeave(box(''), false)).toBe(true)
    expect(waitsForLeave(box('', true), false)).toBe(true)
    expect(waitsForLeave(box('2026-11-02'), false)).toBe(false)
  })

  it("spots Chrome filling in a lone 0 as focus moves on, and doesn't mistake real changes for it", () => {
    // Focus moved out of the box (a click elsewhere or on another part, Escape, the calendar button) with no
    // key, or with Tab or the left/right arrows to the next part; or the window lost focus.
    expect(isFilledIn(half, filled, null, false)).toBe(true)
    expect(isFilledIn(half, filled, 'Tab', true)).toBe(true)
    expect(isFilledIn(half, filled, 'ArrowRight', false)).toBe(true)
    expect(isFilledIn(half, filled, 'Escape', false)).toBe(true)
    // Real changes: a digit (Firefox reports it as focus moves to the next part), the arrow keys that step
    // a part, or a date picked from the calendar while the box has focus, however it was opened (F4, or
    // Enter or Space on the calendar button, whose key-up the calendar takes).
    expect(isFilledIn(half, filled, '5', false)).toBe(false)
    expect(isFilledIn(half, filled, 'ArrowUp', true)).toBe(false)
    expect(isFilledIn(half, filled, null, true)).toBe(false)
    expect(isFilledIn(half, filled, 'F4', true)).toBe(false)
    expect(isFilledIn(half, filled, 'Enter', true)).toBe(false)
    expect(isFilledIn(half, filled, ' ', true)).toBe(false)
    // Only a box that was half-typed, and only a whole date.
    expect(isFilledIn(false, filled, null, false)).toBe(false)
    expect(isFilledIn(half, box('', true), null, false)).toBe(false)
  })
})
