import { describe, expect, it } from 'vitest'
import { linkPath, ROW_H } from '../timelineMath'
import { INK } from './exportPalette'
import {
  arrowHeadPath,
  chevronPath,
  circlePath,
  diamondPath,
  hatchSegments,
  hookPath,
  printLinkPath,
  roundedRectPath,
  statusIconPrims,
  tickPath,
  trianglePath,
} from './exportShapes'
import type { TaskWord } from './planTypes'

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, A: 7, Z: 0 }
const NUMBER = /^-?\d+(\.\d{1,2})?$/

interface Command {
  command: string
  args: number[]
}

/** A path's commands. Fails unless it starts with M and uses only M L H V C A Z, each with whole sets of
 *  numbers written with at most two decimals, and arcs with 0/1 flags. */
function parsePath(d: string): Command[] {
  const commands: Command[] = []
  for (const token of d.replace(/([A-Za-z])/g, ' $1 ').trim().split(/\s+/)) {
    if (/^[A-Za-z]$/.test(token)) {
      expect(Object.keys(ARGS), `command ${token} in ${d}`).toContain(token)
      commands.push({ command: token, args: [] })
    } else {
      expect(token, `a number in ${d}`).toMatch(NUMBER)
      expect(commands.length, `a number before any command in ${d}`).toBeGreaterThan(0)
      commands[commands.length - 1].args.push(Number(token))
    }
  }
  expect(commands[0]?.command, d).toBe('M')
  for (const { command, args } of commands) {
    const size = ARGS[command]
    if (size === 0) expect(args, d).toEqual([])
    else {
      expect(args.length, d).toBeGreaterThan(0)
      expect(args.length % size, `${command} ${args.join(' ')} in ${d}`).toBe(0)
    }
    if (command === 'A') {
      for (let i = 0; i < args.length; i += 7) {
        expect(args[i], d).toBeGreaterThanOrEqual(0)
        expect(args[i + 1], d).toBeGreaterThanOrEqual(0)
        expect([0, 1], d).toContain(args[i + 3])
        expect([0, 1], d).toContain(args[i + 4])
      }
    }
  }
  return commands
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** The box a path covers: its points, a curve's control points, and the whole circle of a half-circle arc
 *  (corner arcs stay inside the box of their ends; the half circles are the only arcs that bulge past them). */
function bounds(d: string): Box {
  const xs: number[] = []
  const ys: number[] = []
  let x = 0
  let y = 0
  let start = { x: 0, y: 0 }
  const visit = (px: number, py: number) => {
    x = px
    y = py
    xs.push(px)
    ys.push(py)
  }
  for (const { command, args } of parsePath(d)) {
    if (command === 'M') start = { x: args[0], y: args[1] }
    if (command === 'M' || command === 'L') for (let i = 0; i < args.length; i += 2) visit(args[i], args[i + 1])
    if (command === 'H') for (const value of args) visit(value, y)
    if (command === 'V') for (const value of args) visit(x, value)
    if (command === 'C') {
      for (let i = 0; i < args.length; i += 6) {
        xs.push(args[i], args[i + 2])
        ys.push(args[i + 1], args[i + 3])
        visit(args[i + 4], args[i + 5])
      }
    }
    if (command === 'A') {
      for (let i = 0; i < args.length; i += 7) {
        const [r, ex, ey] = [args[i], args[i + 5], args[i + 6]]
        if (Math.hypot(ex - x, ey - y) > 2 * r - 0.05) {
          const [mx, my] = [(x + ex) / 2, (y + ey) / 2]
          xs.push(mx - r, mx + r)
          ys.push(my - r, my + r)
        }
        visit(ex, ey)
      }
    }
    if (command === 'Z') visit(start.x, start.y)
  }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
}

function expectWithin(inner: Box, outer: Box, slack = 0.011) {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - slack)
  expect(inner.right).toBeLessThanOrEqual(outer.right + slack)
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - slack)
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + slack)
}

const box = (left: number, top: number, w: number, h: number): Box => ({ left, right: left + w, top, bottom: top + h })

describe('roundedRectPath', () => {
  it('draws a plain rectangle when every radius is 0', () => {
    expect(roundedRectPath(10, 20, 40, 8, { tl: 0, tr: 0, br: 0, bl: 0 })).toBe('M10 20H50V28H10V20Z')
  })

  it('rounds each corner by its own radius', () => {
    expect(roundedRectPath(0, 0, 40, 8, { tl: 1.5, tr: 1.5, br: 1.5, bl: 1.5 })).toBe(
      'M1.5 0H38.5A1.5 1.5 0 0 1 40 1.5V6.5A1.5 1.5 0 0 1 38.5 8H1.5A1.5 1.5 0 0 1 0 6.5V1.5A1.5 1.5 0 0 1 1.5 0Z',
    )
  })

  it('keeps a square end where the period cuts a bar off', () => {
    expect(roundedRectPath(0, 0, 40, 8, { tl: 0, tr: 1.5, br: 1.5, bl: 0 })).toBe('M0 0H38.5A1.5 1.5 0 0 1 40 1.5V6.5A1.5 1.5 0 0 1 38.5 8H0V0Z')
  })

  it('shrinks corners that do not fit, keeping the shape inside its rectangle', () => {
    expect(roundedRectPath(0, 0, 40, 6, { tl: 4, tr: 4, br: 4, bl: 4 })).toContain('A3 3 0 0 1')
    const narrow = roundedRectPath(5, 5, 2, 8, { tl: 1.5, tr: 1.5, br: 1.5, bl: 1.5 })
    expect(narrow).toContain('A1 1 0 0 1')
    expect(bounds(narrow)).toEqual(box(5, 5, 2, 8))
    expect(roundedRectPath(0, 0, 0, 8, { tl: 1.5, tr: 1.5, br: 1.5, bl: 1.5 })).toBe('M0 0H0V8H0V0Z')
  })

  it('covers exactly its rectangle, with numbers rounded to 0.01 pt', () => {
    const d = roundedRectPath(1 / 3, 2 / 3, 100 / 7, 8, { tl: 1.5, tr: 0, br: 1.5, bl: 0 })
    expectWithin(bounds(d), box(1 / 3, 2 / 3, 100 / 7, 8), 0.006)
    expectWithin(box(1 / 3, 2 / 3, 100 / 7, 8), bounds(d), 0.006)
  })
})

describe('symbols', () => {
  it('draws a diamond with its points on the four sides', () => {
    expect(diamondPath(10, 10, 3.5)).toBe('M10 6.5L13.5 10L10 13.5L6.5 10Z')
  })

  it('points a chevron out of the chart from its tip, so it stays inside', () => {
    expect(chevronPath(100, 10, 3, 'right')).toBe('M98.5 8.5L100 10L98.5 11.5')
    expect(chevronPath(0, 10, 3, 'left')).toBe('M1.5 8.5L0 10L1.5 11.5')
  })

  it('draws a tick size wide from its left edge, centred on cy', () => {
    const d = tickPath(10, 10, 5)
    expect(d).toBe('M10 10L11.75 11.75L15 8.25')
    expect(bounds(d)).toEqual({ left: 10, right: 15, top: 8.25, bottom: 11.75 })
  })

  it('draws the subtask hook in a square of its size from the top left', () => {
    const d = hookPath(2, 3, 6)
    expect(d.startsWith('M2 3V')).toBe(true)
    expect(bounds(d)).toEqual(box(2, 3, 6, 6))
  })

  it('draws an upright triangle size tall, centred', () => {
    const d = trianglePath(10, 10, 5)
    expect(d).toBe('M10 7.5L12.89 12.5L7.11 12.5Z')
  })

  it('draws an arrowhead pointing right from its tip', () => {
    expect(arrowHeadPath(50, 10, 3)).toBe('M50 10L47 8.5L47 11.5Z')
  })

  it('draws a circle as two half arcs', () => {
    const d = circlePath(10, 10, 3)
    expect(d).toBe('M7 10A3 3 0 1 1 13 10A3 3 0 1 1 7 10Z')
    expect(bounds(d)).toEqual(box(7, 7, 6, 6))
  })

  it('parses as M L H V C A Z only, with awkward numbers rounded to 0.01 pt', () => {
    const [a, b, c] = [1 / 3, 2 / 3, 7 / 3]
    const paths = [
      roundedRectPath(a, b, c * 10, c, { tl: a, tr: b, br: a, bl: b }),
      diamondPath(a, b, c),
      chevronPath(a, b, c, 'left'),
      chevronPath(a, b, c, 'right'),
      tickPath(a, b, c),
      hookPath(a, b, c),
      trianglePath(a, b, c),
      arrowHeadPath(a, b, c),
      circlePath(a, b, c),
      circlePath(-a, -b, c),
    ]
    for (const d of paths) expect(parsePath(d).length).toBeGreaterThan(1)
  })
})

const WORDS: TaskWord[] = ['Not started', 'In progress', 'Done', 'Blocked', 'Overdue', 'At risk']

describe('statusIconPrims', () => {
  const look = (word: TaskWord) =>
    statusIconPrims(word, 20, 10, 6).map((prim) => [
      prim.kind,
      'fill' in prim ? (prim.fill ?? null) : null,
      'stroke' in prim ? (prim.stroke?.color ?? null) : null,
    ])

  it('draws each word as shapes in the print palette', () => {
    expect(look('Not started')).toEqual([['path', INK.white, INK.muted]])
    expect(look('In progress')).toEqual([
      ['path', INK.white, INK.muted],
      ['path', INK.muted, null],
    ])
    expect(look('Done')).toEqual([['path', INK.muted, null]])
    expect(look('Blocked')).toEqual([['rect', INK.problem, null]])
    expect(look('Overdue')).toEqual([
      ['path', INK.problem, null],
      ['rect', INK.white, null],
      ['path', INK.white, null],
    ])
    expect(look('At risk')).toEqual([
      ['path', INK.amber, null],
      ['rect', INK.white, null],
      ['path', INK.white, null],
    ])
  })

  it('never uses text: every icon is rects and paths that parse', () => {
    for (const word of WORDS) {
      for (const prim of statusIconPrims(word, 20, 10, 6)) {
        expect(['rect', 'path']).toContain(prim.kind)
        if (prim.kind === 'path') parsePath(prim.d)
      }
    }
  })

  it('keeps every icon, outline included, within its size', () => {
    const icon = box(17, 7, 6, 6)
    for (const word of WORDS) {
      for (const prim of statusIconPrims(word, 20, 10, 6)) {
        if (prim.kind === 'rect') expectWithin(box(prim.x, prim.y, prim.w, prim.h), icon)
        if (prim.kind === 'path') {
          const half = (prim.stroke?.width ?? 0) / 2
          const b = bounds(prim.d)
          expectWithin({ left: b.left - half, right: b.right + half, top: b.top - half, bottom: b.bottom + half }, icon)
        }
      }
    }
  })

  it('fits the white ! inside its red circle and its amber triangle', () => {
    const size = 6
    const inCircle = (px: number, py: number) => Math.hypot(px - 20, py - 10) <= size / 2
    // The triangle is as wide as the icon: its apex and base are √3/4 of the size above and below the centre.
    const h = (size * Math.sqrt(3)) / 2
    const inTriangle = (px: number, py: number) => py >= 10 - h / 2 && py <= 10 + h / 2 && Math.abs(px - 20) <= ((py - (10 - h / 2)) / h) * (size / 2)
    for (const [word, inside] of [
      ['Overdue', inCircle],
      ['At risk', inTriangle],
    ] as const) {
      const [, ...mark] = statusIconPrims(word, 20, 10, size)
      for (const prim of mark) {
        const b = prim.kind === 'rect' ? box(prim.x, prim.y, prim.w, prim.h) : prim.kind === 'path' ? bounds(prim.d) : null
        expect(b).not.toBeNull()
        if (!b) continue
        for (const [px, py] of [
          [b.left, b.top],
          [b.right, b.top],
          [b.left, b.bottom],
          [b.right, b.bottom],
        ]) {
          expect(inside(px, py), `${word}: (${px}, ${py})`).toBe(true)
        }
      }
    }
  })
})

/** Distance from a point to a segment. */
function distance(px: number, py: number, s: { x1: number; y1: number; x2: number; y2: number }): number {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy))
}

describe('hatchSegments', () => {
  const rects = [
    { x: 100, y: 40, w: 40, h: 8 }, // a bar
    { x: 0, y: 0, w: 3, h: 8 }, // the narrowest bar
    { x: 10, y: 0, w: 8, h: 40 },
    { x: 0, y: 0, w: 20, h: 20 },
    { x: 1 / 3, y: 5 / 3, w: 160 / 9, h: 6.111 },
  ]
  const spacing = 2.5

  it('keeps every segment inside the rectangle, ends on its edges', () => {
    for (const { x, y, w, h } of rects) {
      const segments = hatchSegments(x, y, w, h, spacing)
      expect(segments.length).toBeGreaterThan(0)
      const onEdge = (px: number, py: number) => Math.min(Math.abs(px - x), Math.abs(px - x - w), Math.abs(py - y), Math.abs(py - y - h))
      for (const s of segments) {
        for (const [px, py] of [
          [s.x1, s.y1],
          [s.x2, s.y2],
        ]) {
          expect(px).toBeGreaterThanOrEqual(x)
          expect(px).toBeLessThanOrEqual(x + w)
          expect(py).toBeGreaterThanOrEqual(y)
          expect(py).toBeLessThanOrEqual(y + h)
          expect(onEdge(px, py)).toBeLessThan(0.006)
        }
      }
    }
  })

  it('draws 45° lines rising to the right, one spacing apart', () => {
    for (const { x, y, w, h } of rects) {
      const segments = hatchSegments(x, y, w, h, spacing)
      for (const s of segments) {
        expect(s.x2).toBeGreaterThan(s.x1)
        expect(s.y2).toBeLessThan(s.y1)
        expect(Math.abs(s.x2 - s.x1 - (s.y1 - s.y2))).toBeLessThan(0.02)
      }
      for (let k = 1; k < segments.length; k++) {
        const gap = (segments[k].x1 + segments[k].y1 - segments[k - 1].x1 - segments[k - 1].y1) / Math.SQRT2
        expect(Math.abs(gap - spacing)).toBeLessThan(0.02)
      }
    }
  })

  it('covers the whole rectangle: no point is more than three quarters of a spacing from a line', () => {
    for (const { x, y, w, h } of rects) {
      const segments = hatchSegments(x, y, w, h, spacing)
      for (let px = x; px <= x + w; px += 0.25) {
        for (let py = y; py <= y + h; py += 0.25) {
          const nearest = Math.min(...segments.map((s) => distance(px, py, s)))
          expect(nearest, `(${px}, ${py}) in ${w} × ${h}`).toBeLessThanOrEqual(0.75 * spacing + 0.02)
        }
      }
    }
  })

  it('draws as many lines as fit, and at least one', () => {
    expect(hatchSegments(0, 0, 40, 8, 2.5)).toHaveLength(14)
    expect(hatchSegments(0, 0, 1, 0.5, 2.5)).toHaveLength(1)
  })

  it('draws nothing for an empty rectangle or no spacing', () => {
    expect(hatchSegments(0, 0, 0, 8, 2.5)).toEqual([])
    expect(hatchSegments(0, 0, 10, 8, 0)).toEqual([])
  })
})

describe('printLinkPath', () => {
  it("is the Timeline's own line at the Timeline's row height", () => {
    expect(printLinkPath(100, 18, 200, 54, ROW_H)).toBe(linkPath(100, 18, 200, 54))
    expect(printLinkPath(100, 18, 60, 90, ROW_H)).toBe(linkPath(100, 18, 60, 90))
  })

  it('scales the bend, the shortest S and the loop to a print row', () => {
    // At a 15 pt row: bend 16.67, shortest S 6.67, loop 5.83, and the gap between rows 7.5 below.
    expect(printLinkPath(100, 7.5, 200, 22.5, 15)).toBe('M100 7.5C116.7 7.5 183.3 22.5 200 22.5')
    expect(printLinkPath(100, 7.5, 110, 22.5, 15)).toBe('M100 7.5C105 7.5 105 22.5 110 22.5')
    expect(printLinkPath(100, 7.5, 95, 22.5, 15)).toBe('M100 7.5C105.8 7.5 105.8 15 100 15L95 15C89.2 15 89.2 22.5 95 22.5')
  })

  it('parses as M L H V C A Z only', () => {
    for (const d of [printLinkPath(1 / 3, 7.5, 50, 22.5, 15), printLinkPath(50, 22.5, 10, 7.5, 13)]) parsePath(d)
  })
})
