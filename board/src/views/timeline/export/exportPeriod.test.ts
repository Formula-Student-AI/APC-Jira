import { describe, expect, it } from 'vitest'
import { PLAN_END, PLAN_START } from '../../../config'
import {
  dayOffset,
  monthOptions,
  needsYear,
  periodDays,
  periodFor,
  periodLabel,
  scaleFor,
  tiersFor,
  type DatedRow,
  type Scale,
} from './exportPeriod'
import type { Period } from './planTypes'
import type { FontSpec, Measure } from './scene'

// The spec's fake measure: every code point is as wide as 0.55 of the font size (0.6 in mono).
const measure: Measure = (text, font) => [...text].length * font.size * (font.family === 'mono' ? 0.6 : 0.55)

// The paper type sizes for the timescale: years 7.5/600, months 7/500, weeks and days 6.5.
const YEAR: FontSpec = { family: 'sans', size: 7.5, weight: 600 }
const MONTH: FontSpec = { family: 'sans', size: 7, weight: 500 }
const WEEK: FontSpec = { family: 'sans', size: 6.5, weight: 400 }
const yearsOverMonths = { upper: YEAR, lower: MONTH }
const monthsOverDates = { upper: MONTH, lower: WEEK }

const PLAN: Period = { first: '2026-09-01', last: '2027-08-31' }
const QUARTER: Period = { first: '2026-11-01', last: '2027-01-31' }
const NOVEMBER: Period = { first: '2026-11-01', last: '2026-11-30' }
const TODAY = '2026-11-10'

const row = (title: string, start: string | null, due: string | null): DatedRow => ({ title, start, due })
const plan = (rows: DatedRow[]) => periodFor({ preset: 'plan' }, TODAY, rows)
const texts = (labels: Scale['upper']) => labels.map((label) => label.text)

describe('periodFor', () => {
  it('gives the plan year from config.ts for Whole plan', () => {
    expect(PLAN_START).toBe(PLAN.first)
    expect(PLAN_END).toBe(PLAN.last)
    expect(plan([])).toEqual({ period: PLAN, warning: null })
  })

  it('widens Whole plan to whole months to cover every row, quietly up to 24 months', () => {
    const rows = [
      row('Early prep', '2026-07-20', '2026-09-10'),
      row('Late wrap-up', null, '2027-10-15'),
      row('Undated', null, null),
      row('Bad date', 'nonsense', null),
    ]
    expect(plan(rows)).toEqual({ period: { first: '2026-07-01', last: '2027-10-31' }, warning: null })
    // Exactly 24 months is still quiet.
    expect(plan([row('Long', '2027-01-01', '2028-08-15')]).warning).toBeNull()
  })

  it('names a row that alone stretches Whole plan past 24 months', () => {
    expect(plan([row('Sponsor renewal', '2027-03-01', '2029-03-10')])).toEqual({
      period: { first: '2026-09-01', last: '2029-03-31' },
      warning: '“Sponsor renewal” (due Mar 2029) stretches the whole plan to 31 months.',
    })
    expect(plan([row('Renewal', null, '2028-09-01')]).warning).toBe(
      '“Renewal” (due Sep 2028) stretches the whole plan to 25 months.',
    )
    expect(plan([row('Kick-off', '2025-06-01', '2026-09-10')]).warning).toBe(
      '“Kick-off” (starts Jun 2025) stretches the whole plan to 27 months.',
    )
    expect(plan([row('Long haul', '2025-01-15', '2028-12-01')]).warning).toBe(
      '“Long haul” (starts Jan 2025, due Dec 2028) stretches the whole plan to 48 months.',
    )
  })

  it('names the row that stretches it most, counts the others and gives the months they make together', () => {
    const rows = [
      row('Kick-off', '2025-06-01', '2026-09-10'),
      row('Sponsor renewal', '2027-03-01', '2029-03-10'),
      row('Fine', '2026-10-01', '2026-10-20'),
    ]
    expect(plan(rows)).toEqual({
      period: { first: '2025-06-01', last: '2029-03-31' },
      warning: '“Sponsor renewal” (due Mar 2029) and 1 other task stretch the whole plan to 46 months.',
    })
    expect(plan([...rows, row('Far off', null, '2029-01-01')]).warning).toBe(
      '“Sponsor renewal” (due Mar 2029) and 2 other tasks stretch the whole plan to 46 months.',
    )
  })

  it('cleans, quotes and shortens the title it names', () => {
    const warning = (title: string) => plan([row(title, null, '2029-03-10')]).warning
    expect(warning(`Sponsor${String.fromCodePoint(10)}  renewal`)).toMatch(/^“Sponsor renewal” \(due Mar 2029\)/)
    expect(warning('A'.repeat(100))).toMatch(new RegExp(`^“${'A'.repeat(59)}…” \\(due Mar 2029\\)`))
    expect(warning('  ')).toBe('A task (due Mar 2029) stretches the whole plan to 31 months.')
  })

  it('gives the next 3 or 6 whole months from the 1st of this month, whatever the rows', () => {
    const far = [row('Sponsor renewal', null, '2029-03-10')]
    expect(periodFor({ preset: 'next3' }, TODAY, far)).toEqual({ period: QUARTER, warning: null })
    expect(periodFor({ preset: 'next6' }, TODAY, far)).toEqual({
      period: { first: '2026-11-01', last: '2027-04-30' },
      warning: null,
    })
    expect(periodFor({ preset: 'next3' }, '2027-12-31', []).period).toEqual({ first: '2027-12-01', last: '2028-02-29' })
  })

  it('gives chosen months from the 1st of the first to the last day of the last', () => {
    const months = (from: string, to: string) => periodFor({ preset: 'months', from, to }, TODAY, []).period
    expect(months('2026-10', '2027-02')).toEqual({ first: '2026-10-01', last: '2027-02-28' })
    expect(months('2028-02', '2028-02')).toEqual({ first: '2028-02-01', last: '2028-02-29' })
    // While the dialog shows that To is before From, the two are used the right way round.
    expect(months('2027-02', '2026-10')).toEqual({ first: '2026-10-01', last: '2027-02-28' })
    // Something that isn't a month falls back to the whole plan.
    expect(months('nonsense', '2027-02')).toEqual(PLAN)
    expect(months('2027-13', '2027-02')).toEqual(PLAN)
  })
})

describe('monthOptions', () => {
  it('runs from 12 months before the plan to 12 months after it', () => {
    const options = monthOptions(TODAY)
    expect(options).toHaveLength(36)
    expect(options[0]).toEqual({ value: '2025-09', label: 'September 2025' })
    expect(options[35]).toEqual({ value: '2028-08', label: 'August 2028' })
    expect(options.map((option) => option.value)).toContain('2026-11')
  })

  it('starts 12 months before today when today is earlier, and reaches 12 months past a later today', () => {
    expect(monthOptions('2026-03-15')[0].value).toBe('2025-03')
    const late = monthOptions('2029-01-05')
    expect(late[0].value).toBe('2025-09')
    expect(late[late.length - 1].value).toBe('2030-01')
  })
})

describe('period arithmetic', () => {
  it('labels a period by its months', () => {
    expect(periodLabel(PLAN)).toBe('Sep 2026 – Aug 2027')
    expect(periodLabel(QUARTER)).toBe('Nov 2026 – Jan 2027')
    expect(periodLabel(NOVEMBER)).toBe('Nov 2026')
    expect(periodLabel({ first: 'nonsense', last: '2026-11-30' })).toBe('')
  })

  it('counts days inclusively', () => {
    expect(periodDays(PLAN)).toBe(365)
    expect(periodDays({ first: '2028-02-01', last: '2028-02-29' })).toBe(29)
    expect(periodDays({ first: '2026-09-01', last: '2028-08-31' })).toBe(731)
    expect(periodDays({ first: '2026-11-10', last: '2026-11-10' })).toBe(1)
    expect(periodDays({ first: '2026-11-10', last: '2026-11-01' })).toBe(0)
  })

  it('counts days from the first day of the period', () => {
    expect(dayOffset(PLAN, '2026-09-01')).toBe(0)
    expect(dayOffset(PLAN, '2026-09-11')).toBe(10)
    expect(dayOffset(PLAN, '2026-08-31')).toBe(-1)
    expect(dayOffset(PLAN, '2027-09-01')).toBe(periodDays(PLAN))
    expect(dayOffset(PLAN, 'nonsense')).toBeNaN()
  })
})

describe('needsYear', () => {
  it('needs no year inside a period of 12 months or less', () => {
    expect(needsYear('2026-11-04', PLAN)).toBe(false)
    expect(needsYear('2027-08-31', PLAN)).toBe(false)
    expect(needsYear('2026-12-20', QUARTER)).toBe(false)
    // Twelve months that don't start on the 1st still never repeat a day.
    expect(needsYear('2026-12-01', { first: '2026-09-15', last: '2027-09-14' })).toBe(false)
  })

  it('needs one outside the period', () => {
    expect(needsYear('2026-08-31', PLAN)).toBe(true)
    expect(needsYear('2027-09-01', PLAN)).toBe(true)
  })

  it('needs one throughout a period longer than 12 months, where days come round twice', () => {
    expect(needsYear('2027-01-14', { first: '2026-09-01', last: '2027-09-30' })).toBe(true)
    expect(needsYear('2026-12-01', { first: '2026-09-01', last: '2027-09-01' })).toBe(true)
  })

  it('needs none for something that is not a day', () => {
    expect(needsYear('nonsense', PLAN)).toBe(false)
  })
})

describe('scaleFor', () => {
  it('picks the tiers from points per day', () => {
    expect(tiersFor(12)).toBe('months-days')
    expect(tiersFor(9)).toBe('months-days')
    expect(tiersFor(8.99)).toBe('months-weeks')
    expect(tiersFor(2)).toBe('months-weeks')
    expect(tiersFor(1.99)).toBe('years-months')
    expect(scaleFor(NOVEMBER, 270, monthsOverDates, measure).tiers).toBe('months-days')
    expect(scaleFor(NOVEMBER, 269, monthsOverDates, measure).tiers).toBe('months-weeks')
    const hundredDays: Period = { first: '2026-11-01', last: '2027-02-08' }
    expect(scaleFor(hundredDays, 200, monthsOverDates, measure).tiers).toBe('months-weeks')
    expect(scaleFor(hundredDays, 199, yearsOverMonths, measure).tiers).toBe('years-months')
  })

  it('shows the plan year in years over months on A4, A3 and slides, and six months in Monday dates on A4', () => {
    expect(scaleFor(PLAN, 376, yearsOverMonths, measure).tiers).toBe('years-months')
    expect(scaleFor(PLAN, 616, yearsOverMonths, measure).tiers).toBe('years-months')
    expect(scaleFor(PLAN, 560, yearsOverMonths, measure).tiers).toBe('years-months')
    // A slide's chart is about 622 pt wide with the Status column only: 1.7 pt a day, still a year view.
    expect(scaleFor(PLAN, 622, yearsOverMonths, measure).tiers).toBe('years-months')
    const sixMonths: Period = { first: '2026-11-01', last: '2027-04-30' }
    expect(scaleFor(sixMonths, 376, monthsOverDates, measure).tiers).toBe('months-weeks')
  })

  it('lays the plan year out on A4: years over months, a line at every month and a year line in January', () => {
    const scale = scaleFor(PLAN, 376, yearsOverMonths, measure)
    const ppd = 376 / 365
    expect(scale.ppd).toBeCloseTo(ppd)
    expect(scale.width).toBe(376)
    expect(scale.x('2026-09-01')).toBe(0)
    expect(scale.x('2027-09-01')).toBeCloseTo(376)
    expect(scale.x('2026-08-31')).toBeCloseTo(-ppd)
    expect(texts(scale.upper)).toEqual(['2026', '2027'])
    expect(scale.upper[0]).toMatchObject({ x: 0 })
    expect(scale.upper[0].width).toBeCloseTo(122 * ppd)
    expect(scale.upper[1].x).toBeCloseTo(122 * ppd)
    const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
    expect(texts(scale.lower)).toEqual(months)
    expect(scale.lines).toHaveLength(11)
    expect(scale.lines.filter((line) => line.kind === 'year')).toEqual([{ x: scale.x('2027-01-01'), kind: 'year' }])
    expect(scale.lines.filter((line) => line.kind === 'week')).toEqual([])
    expect(scale.lines[0]).toEqual({ x: scale.x('2026-10-01'), kind: 'month' })
  })

  it('makes the labels of each tier fit inside the chart, and the upper tier fill it', () => {
    for (const period of [PLAN, QUARTER, NOVEMBER]) {
      const scale = scaleFor(period, 376, monthsOverDates, measure)
      expect(scale.upper.reduce((sum, label) => sum + label.width, 0)).toBeCloseTo(376)
      for (const label of [...scale.upper, ...scale.lower]) {
        expect(label.x).toBeGreaterThanOrEqual(0)
        expect(label.x + label.width).toBeLessThanOrEqual(376 + 1e-6)
      }
    }
  })

  it('shortens month names alike across a tier: Sep, then S, then none, and always draws the lines', () => {
    // At 160 pt a 31-day month could still show 'Jan', but February can't show 'Feb', so every month
    // shows one letter.
    const narrow = scaleFor(PLAN, 160, yearsOverMonths, measure)
    expect(texts(narrow.lower)).toEqual(['S', 'O', 'N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A'])
    const tiny = scaleFor(PLAN, 60, yearsOverMonths, measure)
    expect(texts(tiny.lower).every((text) => text === '')).toBe(true)
    expect(texts(tiny.upper)).toEqual(['2026', '2027'])
    expect(tiny.lines).toHaveLength(11)
  })

  it('lays out months over Monday dates, with faint week lines', () => {
    const scale = scaleFor(QUARTER, 376, monthsOverDates, measure)
    expect(scale.tiers).toBe('months-weeks')
    expect(texts(scale.upper)).toEqual(['November 2026', 'December 2026', 'January 2027'])
    expect(texts(scale.lower)).toEqual(['2', '9', '16', '23', '30', '7', '14', '21', '28', '4', '11', '18', '25'])
    // 2 Nov 2026 is the first Monday: its date spans the week from there.
    expect(scale.lower[0].x).toBeCloseTo(scale.x('2026-11-02'))
    expect(scale.lower[0].width).toBeCloseTo(7 * scale.ppd)
    expect(scale.lines.filter((line) => line.kind === 'week')).toHaveLength(13)
    expect(scale.lines.filter((line) => line.kind !== 'week')).toEqual([
      { x: scale.x('2026-12-01'), kind: 'month' },
      { x: scale.x('2027-01-01'), kind: 'year' },
    ])
    const xs = scale.lines.map((line) => line.x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
  })

  it('draws no week line where a Monday starts a month', () => {
    // 1 Feb and 1 Mar 2027 are Mondays.
    const scale = scaleFor({ first: '2027-01-01', last: '2027-03-31' }, 376, monthsOverDates, measure)
    const at = (day: string) => scale.lines.filter((line) => line.x === scale.x(day))
    expect(at('2027-02-01')).toEqual([{ x: scale.x('2027-02-01'), kind: 'month' }])
    expect(at('2027-03-01')).toEqual([{ x: scale.x('2027-03-01'), kind: 'month' }])
    expect(scale.lines.filter((line) => line.kind === 'week')).toHaveLength(11)
  })

  it('shortens month names to fit their span: November 2026, Nov 2026, Nov, N, then none', () => {
    const upper = (width: number, size: number) =>
      texts(scaleFor(QUARTER, width, { upper: { ...MONTH, size }, lower: WEEK }, measure).upper)
    expect(upper(376, 7)).toEqual(['November 2026', 'December 2026', 'January 2027'])
    // At 190 pt (about 2.07 pt a day, still months over weeks) November's 30 days can't hold its full name in
    // 9 pt, so none of the months shows one.
    expect(upper(190, 9)).toEqual(['Nov 2026', 'Dec 2026', 'Jan 2027'])
    expect(upper(190, 20)).toEqual(['Nov', 'Dec', 'Jan'])
    expect(upper(190, 40)).toEqual(['N', 'D', 'J'])
    expect(upper(190, 120)).toEqual(['', '', ''])
  })

  it('lets a month cut short by the period show a shorter name', () => {
    const scale = scaleFor({ first: '2026-11-28', last: '2026-12-27' }, 300, monthsOverDates, measure)
    expect(scale.tiers).toBe('months-days')
    expect(texts(scale.upper)).toEqual(['Nov', 'December 2026'])
  })

  it('lays out months over days for a short period, numbering every day or none', () => {
    const november = scaleFor(NOVEMBER, 376, monthsOverDates, measure)
    expect(november.tiers).toBe('months-days')
    expect(texts(november.upper)).toEqual(['November 2026'])
    expect(texts(november.lower)).toEqual(Array.from({ length: 30 }, (_, i) => String(i + 1)))
    expect(november.lines).toEqual([])

    const twoMonths: Period = { first: '2026-11-01', last: '2026-12-31' }
    const days = scaleFor(twoMonths, 600, monthsOverDates, measure)
    expect(days.tiers).toBe('months-days')
    expect(days.lower).toHaveLength(61)
    expect(days.lower.every((label) => label.text !== '')).toBe(true)
    expect(days.lines).toEqual([{ x: days.x('2026-12-01'), kind: 'month' }])
    // When the 10th to the 31st can't be numbered, no day is, rather than only the 1st to the 9th.
    const big = scaleFor(twoMonths, 600, { upper: MONTH, lower: { ...WEEK, size: 8 } }, measure)
    expect(big.lower.every((label) => label.text === '')).toBe(true)
  })

  it('gives an empty scale when there is no width or no period', () => {
    const empty = { ppd: 0, upper: [], lower: [], lines: [] }
    expect(scaleFor(PLAN, 0, yearsOverMonths, measure)).toMatchObject({ ...empty, width: 0 })
    const backwards: Period = { first: '2026-11-10', last: '2026-11-01' }
    expect(scaleFor(backwards, 376, yearsOverMonths, measure)).toMatchObject(empty)
  })
})
