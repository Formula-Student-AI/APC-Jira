// Paints one export page onto a canvas, shape for shape (the slide images). The context and the Path2D
// factory are passed in, so a fake context that records the calls tests it in node. SvgPage draws the same
// shapes as SVG and takes its rules for odd values from here, so the slides and the PDF can't disagree.

import { INK } from './exportPalette'
import { FONT_FAMILIES, type FontSpec, type Hex, type Page, type RectPrim, type Stroke, type TextPrim } from './scene'

/** The parts of CanvasRenderingContext2D the painter uses. */
export type PaintContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'setTransform'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'globalAlpha'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'setLineDash'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'rect'
  | 'roundRect'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'fillText'
  | 'drawImage'
>

export interface PaintAssets {
  /** The logo, or null to leave it out (e.g. it failed to load) */
  logo: CanvasImageSource | null
}

/** A stroke as both painters draw it, with a dash list that is [] for a solid line. */
export interface PaintStroke {
  color: Hex
  width: number
  dash: number[]
}

/**
 * The stroke to draw, or null when there is nothing to draw. Canvas ignores a line width or dash list it
 * can't use and quietly keeps the last shape's, while SVG drops it, so both painters agree on this instead:
 * a width that isn't a positive number draws no stroke, and a dash list with a negative or non-finite length,
 * or nothing but zeros, draws a solid line.
 */
export function strokeOf(stroke: Stroke | undefined): PaintStroke | null {
  if (!stroke || !(stroke.width > 0 && stroke.width < Infinity)) return null
  const dash = stroke.dash ?? []
  const usable = dash.every((length) => length >= 0 && length < Infinity) && dash.some((length) => length > 0)
  return { color: stroke.color, width: stroke.width, dash: usable ? dash : [] }
}

/** Opacity from 0 to 1; 1 when it is missing or not a number (canvas would otherwise keep the last shape's). */
export function alphaOf(opacity: number | undefined): number {
  return opacity === undefined || Number.isNaN(opacity) ? 1 : Math.min(1, Math.max(0, opacity))
}

/**
 * A rect's corner radius, at most half its width and its height. Past that, SVG makes the corners oval and
 * canvas shrinks them, so both are given a radius that fits.
 */
export function radiusOf(rect: Pick<RectPrim, 'w' | 'h' | 'radius'>): number {
  const radius = rect.radius ?? 0
  return radius > 0 ? Math.min(radius, rect.w / 2, rect.h / 2) : 0
}

/** Whether a rect or image has a size to draw: SVG refuses a negative size, and canvas would draw it backwards. */
export function hasArea(w: number, h: number): boolean {
  return w > 0 && h > 0 && w < Infinity && h < Infinity
}

/** The canvas font for text, e.g. "600 7.5px 'Geist Mono Variable', …". Its px are points once the page is scaled. */
export function canvasFont(font: FontSpec): string {
  return `${font.weight} ${font.size}px ${FONT_FAMILIES[font.family]}`
}

// Pages always run left to right, so anchors are fixed sides rather than following the canvas's direction.
const ALIGN: Record<TextPrim['anchor'], CanvasTextAlign> = { start: 'left', middle: 'center', end: 'right' }

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** An image's own size in pixels, where the source has one (an ImageBitmap, a canvas or an <img>). */
function naturalSize(image: CanvasImageSource): { width: number; height: number } | null {
  let width: unknown
  let height: unknown
  if ('naturalWidth' in image) [width, height] = [image.naturalWidth, image.naturalHeight]
  else if ('width' in image) [width, height] = [image.width, image.height]
  return typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0 ? { width, height } : null
}

/** The image's box shrunk to the image's shape and centred, as SVG's <image> does by default: never stretched. */
function fitImage(box: Box, image: CanvasImageSource): Box {
  const size = naturalSize(image)
  if (!size) return box
  const scale = Math.min(box.w / size.width, box.h / size.height)
  const w = size.width * scale
  const h = size.height * scale
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

function applyStroke(ctx: PaintContext, stroke: PaintStroke): void {
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.width
  // Set for every stroke, so a dashed line can never leave its dashes on the next one.
  ctx.setLineDash(stroke.dash)
}

/**
 * Paints `page` at `pxPerPt` pixels per point: a white background first, then every prim in order. Text uses
 * FONT_FAMILIES (scene.ts) with the prim's size and weight, alphabetic baseline and its anchor; paths use
 * `makePath(d)` (new Path2D(d) in the browser); dashes are scaled with the rest.
 */
export function paintPage(
  ctx: PaintContext,
  page: Page,
  pxPerPt: number,
  assets: PaintAssets,
  makePath: (d: string) => Path2D,
): void {
  ctx.save()
  try {
    // Prims are in points. Canvas measures line widths and dash lengths in the same units as the shapes, so
    // this one transform scales those too.
    ctx.setTransform(pxPerPt, 0, 0, pxPerPt, 0, 0)
    // SVG's defaults, whatever the context held before. (The two mitre limits differ, so SvgPage sets canvas's.)
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    ctx.textBaseline = 'alphabetic'
    ctx.globalAlpha = 1
    ctx.fillStyle = INK.white
    ctx.fillRect(0, 0, page.width, page.height)

    // Only these two are kept from shape to shape: most shapes are opaque, and setting a font means parsing it.
    let alpha = 1
    let font = ''
    for (const prim of page.prims) {
      const nextAlpha = alphaOf(prim.opacity)
      if (nextAlpha !== alpha) {
        alpha = nextAlpha
        ctx.globalAlpha = alpha
      }
      switch (prim.kind) {
        case 'rect': {
          const stroke = strokeOf(prim.stroke)
          if (!hasArea(prim.w, prim.h) || (!prim.fill && !stroke)) break
          const radius = radiusOf(prim)
          ctx.beginPath()
          // roundRect is missing before Safari 16 and Firefox 112, where the corners are drawn square instead.
          if (radius > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(prim.x, prim.y, prim.w, prim.h, radius)
          else ctx.rect(prim.x, prim.y, prim.w, prim.h)
          if (prim.fill) {
            ctx.fillStyle = prim.fill
            ctx.fill()
          }
          if (stroke) {
            applyStroke(ctx, stroke)
            ctx.stroke()
          }
          break
        }
        case 'line': {
          const stroke = strokeOf(prim.stroke)
          if (!stroke) break
          ctx.beginPath()
          ctx.moveTo(prim.x1, prim.y1)
          ctx.lineTo(prim.x2, prim.y2)
          applyStroke(ctx, stroke)
          ctx.stroke()
          break
        }
        case 'path': {
          const stroke = strokeOf(prim.stroke)
          if (!prim.fill && !stroke) break
          const path = makePath(prim.d)
          if (prim.fill) {
            ctx.fillStyle = prim.fill
            ctx.fill(path)
          }
          if (stroke) {
            applyStroke(ctx, stroke)
            ctx.stroke(path)
          }
          break
        }
        case 'text': {
          const nextFont = canvasFont(prim)
          if (nextFont !== font) {
            font = nextFont
            ctx.font = font
          }
          ctx.textAlign = ALIGN[prim.anchor]
          ctx.fillStyle = prim.color
          ctx.fillText(prim.text, prim.x, prim.y)
          break
        }
        case 'image': {
          if (!assets.logo || !hasArea(prim.w, prim.h)) break
          const box = fitImage(prim, assets.logo)
          ctx.drawImage(assets.logo, box.x, box.y, box.w, box.h)
          break
        }
      }
    }
  } finally {
    ctx.restore()
  }
}
