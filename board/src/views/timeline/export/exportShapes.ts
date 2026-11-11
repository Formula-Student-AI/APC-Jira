// Shapes for the Timeline export, as SVG path strings and prims in points. Every symbol is drawn (Geist has
// no tick, diamond, chevron, hook, triangle or status glyphs). Paths use only M, L, H, V, C, A, Z with
// numbers rounded to 0.01 pt, so the same string works in SVG and in canvas Path2D.

import { linkPath, ROW_H } from '../timelineMath'
import { INK } from './exportPalette'
import type { TaskWord } from './planTypes'
import type { Prim } from './scene'

export interface Radii {
  tl: number
  tr: number
  br: number
  bl: number
}

/** Rounded to 0.01 pt (far finer than any printer, and short in the markup), and never -0, so results
 *  compare equal to 0 in tests. */
function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return rounded === 0 ? 0 : rounded
}

const num = (value: number) => String(round2(value))
const pt = (x: number, y: number) => `${num(x)} ${num(y)}`

/** An arc of radius r to (x, y), turning clockwise on the page (SVG's y runs down, so sweep 1 is clockwise). */
const arcTo = (r: number, x: number, y: number) => `A${num(r)} ${num(r)} 0 0 1 ${pt(x, y)}`

/** A rectangle with its own radius at each corner (e.g. a bar cut off by the period: square at that end). */
export function roundedRectPath(x: number, y: number, w: number, h: number, radii: Radii): string {
  const width = Math.max(0, w)
  const height = Math.max(0, h)
  const tl = Math.max(0, radii.tl)
  const tr = Math.max(0, radii.tr)
  const br = Math.max(0, radii.br)
  const bl = Math.max(0, radii.bl)
  // Corners that don't fit shrink together, as in CSS, so a bar at its 3 pt minimum keeps a clean shape.
  const room = (length: number, sum: number) => (sum > 0 ? length / sum : Infinity)
  const k = Math.min(1, room(width, tl + tr), room(width, bl + br), room(height, tl + bl), room(height, tr + br))
  const r = { tl: tl * k, tr: tr * k, br: br * k, bl: bl * k }
  const right = x + width
  const bottom = y + height
  return (
    `M${pt(x + r.tl, y)}H${num(right - r.tr)}${r.tr > 0 ? arcTo(r.tr, right, y + r.tr) : ''}` +
    `V${num(bottom - r.br)}${r.br > 0 ? arcTo(r.br, right - r.br, bottom) : ''}` +
    `H${num(x + r.bl)}${r.bl > 0 ? arcTo(r.bl, x, bottom - r.bl) : ''}` +
    `V${num(y + r.tl)}${r.tl > 0 ? arcTo(r.tl, x + r.tl, y) : ''}Z`
  )
}

/** A diamond centred on (cx, cy), `r` from the centre to each point. */
export function diamondPath(cx: number, cy: number, r: number): string {
  return `M${pt(cx, cy - r)}L${pt(cx + r, cy)}L${pt(cx, cy + r)}L${pt(cx - r, cy)}Z`
}

/** An open chevron (to stroke) `size` tall at x, pointing left or right: marks a bar cut off by the period. */
export function chevronPath(x: number, cy: number, size: number, direction: 'left' | 'right'): string {
  // The point is at x and the arms reach back half the height (a right angle), so a chevron on the chart's
  // edge, pointing out of it, stays inside the chart.
  const half = size / 2
  const back = direction === 'right' ? x - half : x + half
  return `M${pt(back, cy - half)}L${pt(x, cy)}L${pt(back, cy + half)}`
}

/** A tick (to stroke) `size` wide, its left edge at x: Done bars and Done key dates. */
export function tickPath(x: number, cy: number, size: number): string {
  // A short stroke down and a long one up, 0.7 × size tall and centred on cy.
  const drop = size * 0.35
  return `M${pt(x, cy)}L${pt(x + drop, cy + drop)}L${pt(x + size, cy - drop)}`
}

/** The subtask hook ↳ (to stroke), `size` tall, top left at (x, y). */
export function hookPath(x: number, y: number, size: number): string {
  // As wide as it is tall: down from the top left, round the corner, along to an arrowhead at the right.
  const corner = size * 0.25
  const foot = y + size * 0.75
  const head = size * 0.25
  return (
    `M${pt(x, y)}V${num(foot - corner)}A${num(corner)} ${num(corner)} 0 0 0 ${pt(x + corner, foot)}H${num(x + size)}` +
    `M${pt(x + size - head, foot - head)}L${pt(x + size, foot)}L${pt(x + size - head, foot + head)}`
  )
}

/** An upright triangle (to fill) `size` tall, centred on (cx, cy): At risk. */
export function trianglePath(cx: number, cy: number, size: number): string {
  // Equilateral: half its base is its height over √3.
  const half = size / Math.sqrt(3)
  return `M${pt(cx, cy - size / 2)}L${pt(cx + half, cy + size / 2)}L${pt(cx - half, cy + size / 2)}Z`
}

/** A filled arrowhead `size` long whose tip is at (x, y), pointing right: dependency lines. */
export function arrowHeadPath(x: number, y: number, size: number): string {
  return `M${pt(x, y)}L${pt(x - size, y - size / 2)}L${pt(x - size, y + size / 2)}Z`
}

/** A circle of radius `r` centred on (cx, cy), as two half arcs (a single arc can't end where it starts). */
export function circlePath(cx: number, cy: number, r: number): string {
  const arc = `A${num(r)} ${num(r)} 0 1 1 `
  return `M${pt(cx - r, cy)}${arc}${pt(cx + r, cy)}${arc}${pt(cx - r, cy)}Z`
}

/** A white '!', drawn rather than typed so it sits centred whatever font loads: a round-ended stem and a dot
 *  as wide as it, `height` tall from `top`. */
function exclamationPrims(cx: number, top: number, height: number, width: number): Prim[] {
  const gap = width * 0.7
  const stem = height - width - gap
  const left = round2(cx - width / 2)
  return [
    { kind: 'rect', x: left, y: round2(top), w: round2(width), h: round2(stem), radius: round2(width / 2), fill: INK.white },
    { kind: 'path', d: circlePath(cx, top + height - width / 2, width / 2), fill: INK.white },
  ]
}

/**
 * The status icon drawn before each status word, `size` across, centred on (cx, cy), in the print palette:
 * Not started an empty circle, In progress a half-filled circle, Done a filled circle, Blocked a red square,
 * Overdue a red circle with a white '!', At risk an amber triangle with a white '!'.
 */
export function statusIconPrims(word: TaskWord, cx: number, cy: number, size: number): Prim[] {
  const r = size / 2
  const line = round2(size / 8)
  // Outlines sit inside the icon's size, so every circle covers the same area, outlined or filled.
  const inner = r - line / 2
  const ring: Prim = { kind: 'path', d: circlePath(cx, cy, inner), fill: INK.white, stroke: { color: INK.muted, width: line } }
  switch (word) {
    case 'Not started':
      return [ring]
    case 'In progress':
      // The right half, as a progress pie fills clockwise from twelve o'clock.
      return [ring, { kind: 'path', d: `M${pt(cx, cy - inner)}${arcTo(inner, cx, cy + inner)}Z`, fill: INK.muted }]
    case 'Done':
      return [{ kind: 'path', d: circlePath(cx, cy, r), fill: INK.muted }]
    case 'Blocked': {
      // A square looks bigger than a circle of the same width, so it is drawn a little smaller.
      const side = round2(size * 0.84)
      const corner = { x: round2(cx - side / 2), y: round2(cy - side / 2) }
      return [{ kind: 'rect', ...corner, w: side, h: side, radius: round2(side * 0.15), fill: INK.problem }]
    }
    case 'Overdue':
      return [
        { kind: 'path', d: circlePath(cx, cy, r), fill: INK.problem },
        ...exclamationPrims(cx, cy - size * 0.3, size * 0.6, size * 0.14),
      ]
    case 'At risk':
      // As wide as the icon, so a little shorter than it; the '!' sits low, where the triangle is wide enough.
      return [
        { kind: 'path', d: trianglePath(cx, cy, (size * Math.sqrt(3)) / 2), fill: INK.amber },
        ...exclamationPrims(cx, cy - size * 0.2, size * 0.54, size * 0.12),
      ]
  }
}

/**
 * The Blocked hatch: 45° lines (rising to the right) every `spacing` points, already cut to the rectangle
 * (every segment's ends lie inside or on it), so no clip path is needed.
 */
export function hatchSegments(x: number, y: number, w: number, h: number, spacing: number): { x1: number; y1: number; x2: number; y2: number }[] {
  if (!(w > 0 && h > 0 && spacing > 0)) return []
  // Each line is x + y = c on the page, which rises to the right because y runs down. `spacing` is the
  // distance between neighbouring lines (as in the Timeline's CSS hatch), so c steps by spacing × √2. The
  // lines are centred on the rectangle, leaving both corners the same gap, never more than three quarters of
  // a spacing.
  const step = spacing * Math.SQRT2
  const low = x + y
  const high = x + w + y + h
  const count = Math.max(1, Math.round((high - low) / step))
  const first = (low + high - (count - 1) * step) / 2
  const right = x + w
  const bottom = y + h
  // Rounding could nudge an end just outside the rectangle, so each end is put back on it.
  const onX = (value: number) => Math.min(right, Math.max(x, round2(value)))
  const onY = (value: number) => Math.min(bottom, Math.max(y, round2(value)))
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (let k = 0; k < count; k++) {
    const c = first + k * step
    const x1 = Math.max(x, c - bottom) // on the left or the bottom edge
    const x2 = Math.min(right, c - y) // on the top or the right edge
    segments.push({ x1: onX(x1), y1: onY(c - x1), x2: onX(x2), y2: onY(c - x2) })
  }
  return segments
}

/** The Timeline's link sizes at its 36 px row (timelineMath keeps them private): the S-curve's bend, the
 *  shortest run drawn as an S, and the loop. Print keeps their proportions to the row. */
const SCREEN_LINK = { bend: 40, minRun: 16, loop: 14 }

/** A dependency line at print sizes: timelineMath's linkPath with sizes scaled to a row of `rowH` points. */
export function printLinkPath(x1: number, y1: number, x2: number, y2: number, rowH: number): string {
  const k = rowH / ROW_H
  const sizes = { rowH, bend: SCREEN_LINK.bend * k, minRun: SCREEN_LINK.minRun * k, loop: SCREEN_LINK.loop * k }
  return linkPath(x1, y1, x2, y2, sizes)
}
