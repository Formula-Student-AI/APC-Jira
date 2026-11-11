// The marks the Timeline export draws on its chart, as prims in points: task bars with every state marking
// (hollow, tinted, solid or part done; the Blocked hatch, the Overdue cap and slip trail, the At risk
// triangle, and chevrons where the period cuts a bar off), group summary bars, the merged segments of
// summary rows, key-date diamonds, phase segments and dependency lines. The legend draws its samples with
// these same functions in neutral grey, so the key always matches the chart.

import type { OptionColor } from '../../../types'
import { linkPath, ROW_H } from '../timelineMath'
import { INK, NEUTRAL, OPTION_INK, WHOLE_TEAM_INK, type SubteamInk } from './exportPalette'
import { arrowHeadPath, chevronPath, diamondPath, hatchSegments, roundedRectPath, tickPath, trianglePath } from './exportShapes'
import type { KeyDateState } from './planTypes'
import type { Hex, Prim, Stroke } from './scene'

/** A subteam's colours, navy for the whole team (null), and grey for a colour the palette doesn't know. */
export function inkOf(color: OptionColor | null): SubteamInk {
  if (color === null) return WHOLE_TEAM_INK
  return Object.hasOwn(OPTION_INK, color) ? OPTION_INK[color] : OPTION_INK.GRAY
}

/** The legend's samples of states are grey, so they don't suggest a subteam. */
const SAMPLE_INK: SubteamInk = { solid: NEUTRAL.sample, tint: NEUTRAL.sampleTint, ink: NEUTRAL.sampleInk }

/** Not started, In progress, Done, and Part done (a parent's done share solid, the rest tinted). */
export type BarFill = 'hollow' | 'tint' | 'solid' | 'partial'

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** A bar's outline, cut square at either end where the period cuts it off, with an optional fill and stroke. */
function barShape(x: number, y: number, w: number, h: number, radius: number, squareLeft: boolean, squareRight: boolean, fill?: Hex, stroke?: Stroke): Prim {
  const paint = { ...(fill ? { fill } : {}), ...(stroke ? { stroke } : {}) }
  if (!squareLeft && !squareRight) return { kind: 'rect', x, y, w, h, radius, ...paint }
  const left = squareLeft ? 0 : radius
  const right = squareRight ? 0 : radius
  return { kind: 'path', d: roundedRectPath(x, y, w, h, { tl: left, tr: right, br: right, bl: left }), ...paint }
}

export interface BarSpec {
  /** Left edge, top, width and height in page points, already cut to the chart */
  x: number
  y: number
  w: number
  h: number
  radius: number
  /** The period cuts the bar off at this end: square, with a chevron pointing out */
  cutLeft: boolean
  cutRight: boolean
  ink: SubteamInk
  fill: BarFill
  /** A part-done bar's done share, 0 to 1 */
  share: number
  blocked: boolean
  overdue: boolean
  /** Where an overdue bar's slip trail ends: the as-of line (null: no trail) */
  trailTo: number | null
  atRisk: boolean
  /** The chart's left edge, which the At risk triangle never crosses */
  minX: number
}

/**
 * A task bar with its state markings, drawn by sizes that scale with the bar (8 pt on paper): the fill and an
 * ink outline; for Blocked a red hatch under a 1 pt red outline; for Done a white tick at the left; a chevron
 * at each end the period cuts off; for Overdue a red cap on the end and a dotted trail to the as-of line; for
 * At risk an amber triangle 2 pt before the start.
 */
export function barPrims(bar: BarSpec): Prim[] {
  const { x, y, w, h, radius, cutLeft, cutRight, ink } = bar
  const k = h / 8
  const cy = y + h / 2
  const share = bar.fill === 'partial' ? clamp(bar.share, 0, 1) : 0
  const outline: Stroke = bar.blocked
    ? { color: INK.problem, width: 1 }
    : { color: ink.ink, width: bar.fill === 'hollow' ? 0.75 : 0.5 }
  const base = bar.fill === 'hollow' ? INK.white : bar.fill === 'solid' ? ink.solid : ink.tint
  // The outline goes on last when the hatch or the done share is drawn over the fill.
  const outlineLast = bar.blocked || share > 0
  const prims: Prim[] = [barShape(x, y, w, h, radius, cutLeft, cutRight, base, outlineLast ? undefined : outline)]
  if (share > 0) prims.push(barShape(x, y, w * share, h, radius, cutLeft, share < 1 || cutRight, ink.solid))
  if (bar.blocked) {
    for (const segment of hatchSegments(x, y, w, h, 2.5 * k)) {
      prims.push({ kind: 'line', ...segment, stroke: { color: INK.problem, width: 0.5 } })
    }
  }
  if (outlineLast) prims.push(barShape(x, y, w, h, radius, cutLeft, cutRight, undefined, outline))

  const chevronRoom = 3 * k
  if (bar.fill === 'solid' && w >= 10 * k + (cutLeft ? chevronRoom : 0)) {
    const tickX = x + 2.5 * k + (cutLeft ? chevronRoom : 0)
    prims.push({ kind: 'path', d: tickPath(tickX, cy, 4.5 * k), stroke: { color: INK.white, width: k } })
  }
  // On a solid end the chevron is white, as the tick is; elsewhere it is the subteam's ink.
  const solidLeft = bar.fill === 'solid' || share > 0
  const solidRight = bar.fill === 'solid' || share >= 1
  const chevron = (tip: number, direction: 'left' | 'right', solid: boolean): Prim => ({
    kind: 'path',
    d: chevronPath(tip, cy, 3 * k, direction),
    stroke: { color: solid && !bar.blocked ? INK.white : ink.ink, width: 0.75 },
  })
  if (cutLeft) prims.push(chevron(x + 1.5 * k, 'left', solidLeft))
  if (cutRight) prims.push(chevron(x + w - 1.5 * k, 'right', solidRight))

  // A bar the period cuts off at its end doesn't show its due date, so it has no cap or trail.
  if (bar.overdue && !cutRight) {
    const end = x + w
    prims.push({ kind: 'line', x1: end - 0.5, y1: y, x2: end - 0.5, y2: y + h, stroke: { color: INK.problem, width: 1 } })
    if (bar.trailTo !== null && bar.trailTo > end + 0.5) {
      prims.push({ kind: 'line', x1: end, y1: cy, x2: bar.trailTo, y2: cy, stroke: { color: INK.problem, width: 0.75, dash: [1, 1.5] } })
    }
  }
  if (bar.atRisk) {
    const size = 5 * k
    const half = size / Math.sqrt(3)
    const before = x - 2 * k - half
    // A bar that starts at the chart's edge has no room before it: the triangle sits on its start instead,
    // with a white edge so it reads on any fill.
    const clear = before - half >= bar.minX + 0.5
    const cx = clear ? before : bar.minX + 0.5 + half
    prims.push({
      kind: 'path',
      d: trianglePath(cx, cy, size),
      fill: INK.amber,
      ...(clear ? {} : { stroke: { color: INK.white, width: 0.5 } }),
    })
  }
  return prims
}

/**
 * A task due before the period and still open, whose bar is off the chart to the left: a red chevron at the
 * chart's left edge pointing back to it, then its dotted slip trail on to `to` (the as-of line), drawn as an
 * Overdue bar's trail is. Sizes scale with k (the bar's height / 8, so 1 on paper).
 */
export function slipInPrims(x: number, cy: number, to: number, k: number): Prim[] {
  const prims: Prim[] = [{ kind: 'path', d: chevronPath(x + 1.5 * k, cy, 3 * k, 'left'), stroke: { color: INK.problem, width: 0.75 } }]
  const from = x + 3 * k
  if (to > from + 0.5) prims.push({ kind: 'line', x1: from, y1: cy, x2: to, y2: cy, stroke: { color: INK.problem, width: 0.75, dash: [1, 1.5] } })
  return prims
}

/** A group's summary bar: 3 pt in the subteam's colour, centred on cy, with end ticks like an MS Project
 *  summary task (none at an end the period cuts off, nor on a bar too short to read as a span). Sizes scale
 *  with k (1 on paper). */
export function summaryBarPrims(x0: number, x1: number, cy: number, cutLeft: boolean, cutRight: boolean, ink: SubteamInk, k: number): Prim[] {
  const h = 3 * k
  const top = cy - h / 2
  const w = Math.max(0, x1 - x0)
  const prims: Prim[] = [{ kind: 'rect', x: x0, y: top, w, h, fill: ink.solid, stroke: { color: ink.ink, width: 0.5 } }]
  if (w < 8 * k) return prims
  const tick = (x: number): Prim => ({ kind: 'line', x1: x, y1: top - k, x2: x, y2: top + h + 3 * k, stroke: { color: ink.ink, width: k } })
  if (!cutLeft) prims.push(tick(x0 + k / 2))
  if (!cutRight) prims.push(tick(x1 - k / 2))
  return prims
}

/** One stretch of a summary row's merged bars, in page points. */
export interface Segment {
  x0: number
  x1: number
  cutLeft: boolean
  cutRight: boolean
}

/** A summary row: its merged bars as tinted segments with an ink outline, joined by a thin ink line, so real
 *  gaps in the work stay visible. */
export function segmentPrims(segments: readonly Segment[], y: number, h: number, radius: number, ink: SubteamInk): Prim[] {
  const cy = y + h / 2
  const k = h / 8
  const prims: Prim[] = []
  for (let i = 1; i < segments.length; i++) {
    prims.push({ kind: 'line', x1: segments[i - 1].x1, y1: cy, x2: segments[i].x0, y2: cy, stroke: { color: ink.ink, width: 0.5 } })
  }
  for (const segment of segments) {
    const w = segment.x1 - segment.x0
    prims.push(barShape(segment.x0, y, w, h, radius, segment.cutLeft, segment.cutRight, ink.tint, { color: ink.ink, width: 0.5 }))
    const stroke = { color: ink.ink, width: 0.75 }
    if (segment.cutLeft) prims.push({ kind: 'path', d: chevronPath(segment.x0 + 1.5 * k, cy, 3 * k, 'left'), stroke })
    if (segment.cutRight) prims.push({ kind: 'path', d: chevronPath(segment.x1 - 1.5 * k, cy, 3 * k, 'right'), stroke })
  }
  return prims
}

/** How far an At risk key date's amber ring reaches past its diamond, as a share of the diamond's half-width. */
export const RING = 1.35

/** A key date's diamond, `r` from its centre to each point: hollow when upcoming, solid when done, a red
 *  outline when overdue, an amber ring when at risk. Every diamond has an ink outline. */
export function diamondPrims(cx: number, cy: number, r: number, state: KeyDateState, ink: SubteamInk): Prim[] {
  const d = diamondPath(cx, cy, r)
  const k = r / 3.5
  switch (state) {
    case 'done':
      return [{ kind: 'path', d, fill: ink.solid, stroke: { color: ink.ink, width: 0.5 * k } }]
    case 'overdue':
      return [{ kind: 'path', d, fill: INK.white, stroke: { color: INK.problem, width: k } }]
    case 'atRisk':
      return [
        { kind: 'path', d: diamondPath(cx, cy, r * RING), stroke: { color: INK.amber, width: 0.75 * k } },
        { kind: 'path', d, fill: INK.white, stroke: { color: ink.ink, width: 0.75 * k } },
      ]
    default:
      return [{ kind: 'path', d, fill: INK.white, stroke: { color: ink.ink, width: 0.75 * k } }]
  }
}

/** A phase in its lane: a tinted segment with a 1 pt top edge in the solid colour, as on the Timeline, and a
 *  navy outline for the phase the as-of date falls in. */
export function phasePrims(x0: number, x1: number, top: number, h: number, ink: SubteamInk, now: boolean): Prim[] {
  const w = Math.max(0, x1 - x0)
  const prims: Prim[] = [
    { kind: 'rect', x: x0, y: top, w, h, fill: ink.tint },
    { kind: 'line', x1: x0, y1: top + 0.5, x2: x0 + w, y2: top + 0.5, stroke: { color: ink.solid, width: 1 } },
  ]
  if (now) prims.push({ kind: 'rect', x: x0, y: top, w, h, stroke: { color: INK.navy, width: 0.75 } })
  return prims
}

/** The Timeline's own link sizes at its 36 px row (timelineMath keeps them private); print keeps their
 *  proportions to the row, as printLinkPath does. */
const SCREEN_LINK = { bend: 40, minRun: 16, loop: 14 }

export const LINK_STROKE: Stroke = { color: INK.subtle, width: 0.6 }
export const CLASH_STROKE: Stroke = { color: INK.problem, width: 0.9, dash: [2.5, 1.5] }

/**
 * A dependency line from the end of the blocking bar (x1, y1) to the start of the waiting one (x2, y2), with
 * a 3 pt arrowhead (scaled by k): the Timeline's linkPath at print sizes, its loop kept between `left` and
 * `right` (the chart) and run along the edge of the blocking row (`rowH` tall). Dashed red when the dates
 * clash.
 */
export function linkPrims(x1: number, y1: number, x2: number, y2: number, rowH: number, k: number, left: number, right: number, clash: boolean): Prim[] {
  const scale = (15 * k) / ROW_H
  const loop = clamp(Math.min(SCREEN_LINK.loop * scale, right - x1, x2 - left), 0.5, SCREEN_LINK.loop * scale)
  const d = linkPath(x1, y1, x2, y2, { rowH, bend: SCREEN_LINK.bend * scale, minRun: SCREEN_LINK.minRun * scale, loop })
  const stroke = clash ? CLASH_STROKE : LINK_STROKE
  return [
    { kind: 'path', d, stroke },
    { kind: 'path', d: arrowHeadPath(x2, y2, 3 * k), fill: stroke.color },
  ]
}

/** The markings the legend can list, in the order it lists them. */
export const SAMPLE_KINDS = [
  'notStarted',
  'inProgress',
  'done',
  'partDone',
  'blocked',
  'overdue',
  'atRisk',
  'keyDate',
  'keyDateDone',
  'phase',
  'asOf',
  'dependency',
  'clash',
] as const

export type SampleKind = (typeof SAMPLE_KINDS)[number]

/** Legend bars are 12 × 6 pt (times k), diamonds 6 pt and line stubs 10 pt. */
const SAMPLE_BAR = { w: 12, h: 6 }

/** The At risk sample's triangle and the gap before its bar, as barPrims sizes them for a 6 pt bar (times k). */
const RISK_LEAD = (2 * 5 * (SAMPLE_BAR.h / 8)) / Math.sqrt(3) + 2 * (SAMPLE_BAR.h / 8)

/** How wide a legend sample is at scale k. */
export function sampleWidth(kind: SampleKind, k: number): number {
  switch (kind) {
    case 'overdue':
      return 13 * k
    case 'atRisk':
      return (RISK_LEAD + 9) * k
    case 'keyDate':
    case 'keyDateDone':
      return 6 * k
    case 'asOf':
    case 'dependency':
    case 'clash':
      return 10 * k
    default:
      return SAMPLE_BAR.w * k
  }
}

/** A legend sample from x, centred on cy, drawn by the chart's own functions in neutral grey. */
export function samplePrims(kind: SampleKind, x: number, cy: number, k: number): Prim[] {
  const h = SAMPLE_BAR.h * k
  const bar = (fill: BarFill, extra: Partial<BarSpec> = {}) =>
    barPrims({
      x,
      y: cy - h / 2,
      w: SAMPLE_BAR.w * k,
      h,
      radius: 1.2 * k,
      cutLeft: false,
      cutRight: false,
      ink: SAMPLE_INK,
      fill,
      share: 0.5,
      blocked: false,
      overdue: false,
      trailTo: null,
      atRisk: false,
      minX: x - 1,
      ...extra,
    })
  const stub = (stroke: Stroke): Prim => ({ kind: 'line', x1: x, y1: cy, x2: x + 10 * k, y2: cy, stroke })
  switch (kind) {
    case 'notStarted':
      return bar('hollow')
    case 'inProgress':
      return bar('tint')
    case 'done':
      return bar('solid')
    case 'partDone':
      return bar('partial')
    case 'blocked':
      return bar('tint', { blocked: true })
    case 'overdue':
      return bar('tint', { w: 8 * k, overdue: true, trailTo: x + 13 * k })
    case 'atRisk':
      return bar('tint', { x: x + RISK_LEAD * k, w: 9 * k, atRisk: true })
    case 'keyDate':
      return diamondPrims(x + 3 * k, cy, 3 * k, 'upcoming', SAMPLE_INK)
    case 'keyDateDone':
      return diamondPrims(x + 3 * k, cy, 3 * k, 'done', SAMPLE_INK)
    case 'phase':
      return phasePrims(x, x + SAMPLE_BAR.w * k, cy - h / 2, h, SAMPLE_INK, false)
    case 'asOf':
      return [stub({ color: INK.brand, width: 0.75 })]
    case 'dependency':
      return [stub(LINK_STROKE), { kind: 'path', d: arrowHeadPath(x + 10 * k, cy, 3 * k), fill: LINK_STROKE.color }]
    case 'clash':
      return [stub(CLASH_STROKE), { kind: 'path', d: arrowHeadPath(x + 10 * k, cy, 3 * k), fill: CLASH_STROKE.color }]
  }
}
