import { describe, expect, it } from 'vitest'
import { keyDateLabelGeometry, mergeSpans, packTiers, placeKeyDateLabels, type KeyDateLabel, type KeyDateLabelInput } from './exportLanes'
import type { DateSpan } from './planTypes'
import type { FontSpec, Measure } from './scene'

const measure: Measure = (text, font) => [...text].length * font.size * (font.family === 'mono' ? 0.6 : 0.55)
const NAME: FontSpec = { family: 'sans', size: 7, weight: 600 }
const DATE: FontSpec = { family: 'sans', size: 7, weight: 400 }
// With the fake measure every 7 pt character is 3.85 pt, so 3.9655 pt with the 3% slack.
const { half, offset } = keyDateLabelGeometry(NAME)

describe('packTiers', () => {
  it('uses no tiers for no spans', () => {
    expect(packTiers([], 3, 2)).toEqual({ tiers: [], count: 0 })
  })

  it('keeps spans that are far enough apart on the top tier', () => {
    const spans = [
      { x0: 0, x1: 10 },
      { x0: 12, x1: 20 },
      { x0: 30, x1: 40 },
    ]
    expect(packTiers(spans, 3, 2)).toEqual({ tiers: [0, 0, 0], count: 1 })
  })

  it('moves a span down a tier when it comes within the gap', () => {
    expect(packTiers([{ x0: 0, x1: 10 }, { x0: 11, x1: 20 }], 3, 2)).toEqual({ tiers: [0, 1], count: 2 })
  })

  it('goes back up as soon as a tier has room', () => {
    const spans = [
      { x0: 0, x1: 10 },
      { x0: 5, x1: 15 },
      { x0: 8, x1: 20 },
      { x0: 13, x1: 30 },
    ]
    expect(packTiers(spans, 3, 2)).toEqual({ tiers: [0, 1, 2, 0], count: 3 })
  })

  it('puts a span that fits no tier in the last one', () => {
    const spans = [
      { x0: 0, x1: 10 },
      { x0: 1, x1: 10 },
      { x0: 2, x1: 10 },
      { x0: 3, x1: 10 },
    ]
    expect(packTiers(spans, 2, 2)).toEqual({ tiers: [0, 1, 1, 1], count: 2 })
  })

  it('takes spans in order of start whatever order they come in', () => {
    const spans = [
      { x0: 20, x1: 30 },
      { x0: 0, x1: 10 },
      { x0: 5, x1: 15 },
    ]
    expect(packTiers(spans, 3, 2)).toEqual({ tiers: [0, 0, 1], count: 2 })
  })

  it('never puts two spans closer than the gap in one tier when there are tiers enough', () => {
    const next = random(7)
    const spans = Array.from({ length: 60 }, () => {
      const x0 = next() * 500
      return { x0, x1: x0 + next() * 80 }
    }).sort((a, b) => a.x0 - b.x0)
    const { tiers, count } = packTiers(spans, 60, 2)
    expect(count).toBeGreaterThan(1)
    for (let a = 0; a < spans.length; a++) {
      for (let b = a + 1; b < spans.length; b++) {
        if (tiers[a] === tiers[b]) expect(spans[b].x0 - spans[a].x1 >= 2 || spans[a].x0 - spans[b].x1 >= 2).toBe(true)
      }
    }
  })
})

/** A label's text, as a span from the chart's left edge; null when it has none. */
function textSpan(label: KeyDateLabel): [number, number] | null {
  if (!label.width) return null
  return label.anchor === 'start' ? [label.x, label.x + label.width] : [label.x - label.width, label.x]
}

/** The space between two spans (negative when they overlap). */
const gapBetween = (a: [number, number], b: [number, number]) => Math.max(b[0] - a[1], a[0] - b[1])

/** The width the export gives a label: name, a space and the date, with the 3% slack. */
function widthOf(name: string, date: string): number {
  const text = (name ? measure(name, NAME) : 0) + (name && date ? measure(' ', DATE) : 0) + (date ? measure(date, DATE) : 0)
  return Math.round(text * 1.03 * 100) / 100
}

const place = (items: KeyDateLabelInput[], chartWidth: number, maxLines: number) =>
  placeKeyDateLabels(items, chartWidth, NAME, DATE, measure, maxLines)

describe('placeKeyDateLabels', () => {
  it('places labels just right of their diamonds, on the top line when there is room', () => {
    const items = [
      { x: 10, name: 'Kick-off', date: '1 Sep' },
      { x: 200, name: 'Design freeze', date: '15 Dec' },
    ]
    expect(place(items, 400, 3)).toEqual({
      labels: [
        { line: 0, x: 15.6, anchor: 'start', name: 'Kick-off', date: '1 Sep', width: 55.52 },
        { line: 0, x: 205.6, anchor: 'start', name: 'Design freeze', date: '15 Dec', width: 79.31 },
      ],
      lines: 1,
      shortened: [],
    })
  })

  it('moves a label that would collide down to the next line, up to the most lines allowed', () => {
    const items = [
      { x: 10, name: 'Kick-off', date: '1 Sep' },
      { x: 40, name: 'Design freeze', date: '15 Dec' },
    ]
    const { labels, lines } = place(items, 400, 3)
    expect(labels.map((label) => label.line)).toEqual([0, 1])
    expect(lines).toBe(2)
    const crowded = Array.from({ length: 6 }, (_, i) => ({ x: 10 + i * 10, name: `Key date ${i}`, date: `${i + 1} Oct` }))
    const three = place(crowded, 400, 3)
    expect(three.lines).toBe(3)
    expect(Math.max(...three.labels.map((label) => label.line))).toBe(2)
  })

  it('flips a label left of its diamond when it would pass the right edge', () => {
    const items = [
      { x: 100, name: 'Design freeze', date: '15 Dec' },
      { x: 280, name: 'Design freeze', date: '15 Dec' },
    ]
    const [kept, flipped] = place(items, 300, 3).labels
    expect(kept).toMatchObject({ anchor: 'start', x: 105.6 })
    expect(flipped).toMatchObject({ anchor: 'end', x: 274.4, name: 'Design freeze', width: 79.31 })
    expect(flipped.x - flipped.width).toBeGreaterThanOrEqual(0)
  })

  it('shortens the earlier label to make room, keeping at least 6 characters', () => {
    const items = [
      { x: 0, name: 'Chassis design review', date: '2 Oct' },
      { x: 100, name: 'Sign-off', date: '9 Oct' },
    ]
    const { labels, lines, shortened } = place(items, 400, 1)
    expect(labels).toEqual([
      { line: 0, x: 5.6, anchor: 'start', name: 'Chassis design…', date: '2 Oct', width: 83.28 },
      { line: 0, x: 105.6, anchor: 'start', name: 'Sign-off', date: '9 Oct', width: 55.52 },
    ])
    expect(lines).toBe(1)
    expect(shortened).toEqual(['Chassis design review'])
    // The shortened label ends at least 4 pt before the next diamond.
    expect(labels[0].x + labels[0].width + 4).toBeLessThanOrEqual(100 - half)
  })

  it('never cuts a name to a space before its …', () => {
    const items = [
      { x: 0, name: 'Final review of the chassis', date: '2 Oct' },
      { x: 72, name: 'Sign-off', date: '9 Oct' },
    ]
    const [first] = place(items, 400, 1).labels
    expect(first.name.endsWith(' …')).toBe(false)
    expect([...first.name.replace(/…$/, '')].length).toBeGreaterThanOrEqual(6)
  })

  it('then cuts the later label back to its date, when that clears it', () => {
    // The later label sits left of its diamond at the right edge; the earlier can't shorten enough.
    const items = [
      { x: 60, name: 'Kick-off', date: '1 Oct' },
      { x: 190, name: 'Design freeze', date: '15 Dec' },
    ]
    const { labels, shortened } = place(items, 200, 1)
    expect(labels[0]).toMatchObject({ name: 'Kick-off', date: '1 Oct', anchor: 'start' })
    expect(labels[1]).toEqual({ line: 0, x: 184.4, anchor: 'end', name: '', date: '15 Dec', width: 23.79 })
    expect(shortened).toEqual(['Design freeze'])
  })

  it('cuts the earlier label back to its date rather than below 6 characters', () => {
    // A label right of its diamond starts there however long it is, so cutting the later one can't help.
    const items = [
      { x: 0, name: 'Chassis design review', date: '2 Oct' },
      { x: 40, name: 'Sign-off', date: '9 Oct' },
    ]
    const { labels, shortened } = place(items, 400, 1)
    expect(labels).toEqual([
      { line: 0, x: 5.6, anchor: 'start', name: '', date: '2 Oct', width: 19.83 },
      { line: 0, x: 45.6, anchor: 'start', name: 'Sign-off', date: '9 Oct', width: 55.52 },
    ])
    expect(shortened).toEqual(['Chassis design review'])
  })

  it('keeps just the diamond of a key date on the same day as others when the lines run out', () => {
    const items = ['Chassis', 'Powertrain', 'Electrical', 'Autonomy'].map((team) => ({ x: 50, name: `${team} freeze`, date: '4 Dec' }))
    const { labels, lines, shortened } = place(items, 400, 3)
    expect(labels.slice(0, 3).map((label) => [label.line, label.name])).toEqual([
      [0, 'Chassis freeze'],
      [1, 'Powertrain freeze'],
      [2, 'Electrical freeze'],
    ])
    expect(labels[3]).toMatchObject({ name: '', date: '', width: 0 })
    expect(lines).toBe(3)
    expect(shortened).toEqual(['Autonomy freeze'])
  })

  it('shortens a label too wide for either side of its diamond', () => {
    const { labels, shortened } = place([{ x: 80, name: 'A very long key date name here', date: '1 Oct' }], 160, 3)
    expect(labels).toEqual([{ line: 0, x: 85.6, anchor: 'start', name: 'A very long…', date: '1 Oct', width: 71.38 }])
    expect(shortened).toEqual(['A very long key date name here'])
    const narrow = place([{ x: 50, name: 'A very long key date name here', date: '1 Oct' }], 100, 3).labels[0]
    expect(narrow).toMatchObject({ name: '', date: '1 Oct' })
  })

  it('uses no lines for no key dates, and at least one for any', () => {
    expect(place([], 400, 3)).toEqual({ labels: [], lines: 0, shortened: [] })
    expect(place([{ x: 10, name: 'Launch', date: '1 Sep' }], 400, 0).lines).toBe(1)
  })

  it('never overlaps text, never runs past the chart, and says what it cut', () => {
    const words = ['Design', 'freeze', 'review', 'Sponsor', 'evening', 'FS', 'UK', 'competition', 'Chassis', 'sign-off', 'Battery', 'test']
    const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb']
    // How often each way of making room came up, so the cases can't quietly stop being tested.
    const seen = { flipped: 0, shortened: 0, dateOnly: 0, diamondOnly: 0 }
    for (let seed = 1; seed <= 60; seed++) {
      const next = random(seed)
      const chartWidth = 150 + next() * 450
      const maxLines = 1 + Math.floor(next() * 3)
      // Some plans spread their key dates out, others bunch them into a few weeks.
      const spread = next() < 0.5 ? chartWidth : 40 + next() * 60
      const start = next() * (chartWidth - Math.min(spread, chartWidth))
      const items = Array.from({ length: 2 + Math.floor(next() * 16) }, () => ({
        x: start + next() * Math.min(spread, chartWidth),
        name: Array.from({ length: 1 + Math.floor(next() * 4) }, () => words[Math.floor(next() * words.length)]).join(' '),
        date: `${1 + Math.floor(next() * 28)} ${months[Math.floor(next() * months.length)]}`,
      })).sort((a, b) => a.x - b.x)

      const { labels, lines, shortened } = place(items, chartWidth, maxLines)
      const context = `seed ${seed}`
      expect(labels, context).toHaveLength(items.length)
      expect(lines, context).toBe(Math.max(...labels.map((label) => label.line)) + 1)
      expect(lines, context).toBeLessThanOrEqual(maxLines)

      labels.forEach((label, i) => {
        const item = items[i]
        if (label.anchor === 'end' && label.width) seen.flipped++
        if (label.name.endsWith('…')) seen.shortened++
        if (!label.name && label.date) seen.dateOnly++
        if (!label.date) seen.diamondOnly++
        expect(label.x, context).toBeCloseTo(label.anchor === 'start' ? item.x + offset : item.x - offset, 2)
        expect(label.width, context).toBeCloseTo(widthOf(label.name, label.date), 2)
        // A name is whole, shortened to 6 characters or more, or gone; a date is whole or gone with it.
        if (label.name && label.name !== item.name) {
          const kept = label.name.slice(0, -1)
          expect(label.name.endsWith('…'), context).toBe(true)
          expect(item.name.startsWith(kept), context).toBe(true)
          expect([...kept].length, context).toBeGreaterThanOrEqual(6)
        }
        expect([item.date, ''], context).toContain(label.date)
        if (!label.date) expect(label.name, context).toBe('')
        const text = textSpan(label)
        if (text) {
          expect(text[0], context).toBeGreaterThanOrEqual(-0.01)
          expect(text[1], context).toBeLessThanOrEqual(chartWidth + 0.01)
        }
      })

      for (let a = 0; a < labels.length; a++) {
        for (let b = 0; b < labels.length; b++) {
          if (a === b || labels[a].line !== labels[b].line) continue
          const text = textSpan(labels[a])
          if (!text) continue
          const other = textSpan(labels[b])
          if (other && b > a) expect(gapBetween(text, other), `${context}: labels ${a} and ${b}`).toBeGreaterThanOrEqual(4 - 0.01)
          const diamond: [number, number] = [items[b].x - half, items[b].x + half]
          expect(gapBetween(text, diamond), `${context}: label ${a}, diamond ${b}`).toBeGreaterThanOrEqual(1 - 0.01)
        }
      }

      const changed = items.filter((item, i) => labels[i].name !== item.name || labels[i].date !== item.date).map((item) => item.name)
      expect(shortened, context).toEqual([...new Set(changed)])
    }
    expect(Object.values(seen).every((count) => count > 0), JSON.stringify(seen)).toBe(true)
  })

  it('keeps every label whole and 4 pt apart when they have room', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ x: 10 + i * 90, name: 'Review', date: `${i + 1} Mar` }))
    const { labels, lines, shortened } = place(items, 460, 3)
    expect(lines).toBe(1)
    expect(shortened).toEqual([])
    for (let i = 1; i < labels.length; i++) {
      expect(items[i].x - half - (labels[i - 1].x + labels[i - 1].width)).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('mergeSpans', () => {
  const span = (start: string, end: string): DateSpan => ({ start, end })

  it('merges overlapping spans and closes gaps shorter than gapDays', () => {
    const spans = [
      span('2026-09-01', '2026-09-10'),
      span('2026-09-05', '2026-09-20'), // overlaps
      span('2026-09-25', '2026-09-30'), // 4 days between
      span('2026-10-08', '2026-10-10'), // 7 days between: a real gap
    ]
    expect(mergeSpans(spans, 7)).toEqual([span('2026-09-01', '2026-09-30'), span('2026-10-08', '2026-10-10')])
  })

  it('joins spans that touch only when some gap is allowed, and swallows a span inside another', () => {
    const spans = [span('2026-09-01', '2026-09-30'), span('2026-09-10', '2026-09-12'), span('2026-10-01', '2026-10-05')]
    expect(mergeSpans(spans, 1)).toEqual([span('2026-09-01', '2026-10-05')])
    expect(mergeSpans(spans, 0)).toEqual([span('2026-09-01', '2026-09-30'), span('2026-10-01', '2026-10-05')])
  })

  it('counts days across months and years', () => {
    expect(mergeSpans([span('2026-12-28', '2026-12-31'), span('2027-01-04', '2027-01-08')], 7)).toEqual([span('2026-12-28', '2027-01-08')])
    expect(mergeSpans([span('2027-02-20', '2027-02-28'), span('2027-03-08', '2027-03-09')], 7)).toEqual([
      span('2027-02-20', '2027-02-28'),
      span('2027-03-08', '2027-03-09'),
    ])
  })

  it('sorts its spans and reads one given back to front', () => {
    expect(mergeSpans([span('2026-11-01', '2026-11-03'), span('2026-09-30', '2026-09-01')], 7)).toEqual([
      span('2026-09-01', '2026-09-30'),
      span('2026-11-01', '2026-11-03'),
    ])
  })

  it('leaves its input alone and skips dates it cannot read', () => {
    const spans = [span('2026-09-01', '2026-09-03'), span('', '2026-09-04'), span('2026-09-05', '2026-09-06')]
    const copy = structuredClone(spans)
    expect(mergeSpans(spans, 7)).toEqual([span('2026-09-01', '2026-09-06')])
    expect(spans).toEqual(copy)
    expect(mergeSpans([], 7)).toEqual([])
  })
})

/** A small seeded generator, so the random cases are the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}
