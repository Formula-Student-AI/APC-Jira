// The drawing contract of the Timeline export: what the layout hands to its two painters, SvgPage (the
// preview and the PDF) and paintCanvas (slide images). Everything is in points (1/72 inch) from the top left
// of the page. A page is a flat list of five kinds of shape in reading order, with text already fitted.
// There are no ids, defs, patterns, clip paths, masks or markers: each page is in the document twice
// (preview and print), and the shapes map one for one onto Canvas 2D calls, so the two outputs can't drift.

/** '#rrggbb' */
export type Hex = string

export interface Stroke {
  color: Hex
  width: number
  /** Dash pattern in points, e.g. [2, 2] */
  dash?: number[]
}

interface PrimBase {
  /** 0 to 1 (default 1) */
  opacity?: number
}

/** A rectangle, optionally with equal rounded corners (other corner shapes are paths). */
export interface RectPrim extends PrimBase {
  kind: 'rect'
  x: number
  y: number
  w: number
  h: number
  fill?: Hex
  stroke?: Stroke
  radius?: number
}

export interface LinePrim extends PrimBase {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: Stroke
}

/** Any other shape, as an SVG path string (also used by canvas through Path2D). */
export interface PathPrim extends PrimBase {
  kind: 'path'
  d: string
  fill?: Hex
  stroke?: Stroke
}

export type FontFamily = 'sans' | 'mono'

export interface FontSpec {
  family: FontFamily
  /** Points */
  size: number
  /** 400, 500 or 600 */
  weight: number
}

/** One line of text, already fitted to its space by the layout: painters never wrap or cut it. */
export interface TextPrim extends PrimBase, FontSpec {
  kind: 'text'
  /** x of the anchor point and y of the baseline */
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
  text: string
  color: Hex
}

/** The only image is the Bristol FSAI logo (public/logo-login-light.png, 426 × 240 px). */
export interface ImagePrim extends PrimBase {
  kind: 'image'
  x: number
  y: number
  w: number
  h: number
  asset: 'logo'
}

export type Prim = RectPrim | LinePrim | PathPrim | TextPrim | ImagePrim

export interface Page {
  /** Points */
  width: number
  height: number
  /** For screen readers, e.g. "Page 2 of 3: Powertrain (continued) and Electrical, 23 tasks" */
  label: string
  prims: Prim[]
}

/** Width in points of `text` set in `font` (injected, so the layout runs in node tests with a fake). */
export type Measure = (text: string, font: FontSpec) => number

/** CSS font-family for each family, the same in SVG and canvas. */
export const FONT_FAMILIES: Record<FontFamily, string> = {
  sans: "'Geist Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'Geist Mono Variable', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
}
