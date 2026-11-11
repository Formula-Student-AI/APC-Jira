// Draws one export page as an <svg> with React elements, which escape user text by construction. Used by
// the preview (size 'fit') and the print portal (size 'print', the sheet's true size in mm). It draws each
// shape as paintCanvas paints it, with the same rules for odd values, so the PDF and the slide images can't
// drift apart.

import { memo, type ReactElement, type SVGAttributes } from 'react'
import { INK } from './exportPalette'
import type { SheetSpec } from './exportSheets'
import { alphaOf, hasArea, radiusOf, strokeOf, type PaintStroke } from './paintCanvas'
import { FONT_FAMILIES, type Page, type Prim } from './scene'

export interface SvgPageProps {
  page: Page
  sheet: SheetSpec
  /** 'fit': 100% wide, scaled by the viewBox; 'print': width/height = sheet.cssWidth/cssHeight */
  size: 'fit' | 'print'
  /** The logo as a data URL (so hidden print sheets never wait for an image); null leaves it out */
  logoHref: string | null
}

type StrokeAttributes = Pick<SVGAttributes<SVGElement>, 'stroke' | 'strokeWidth' | 'strokeDasharray'>
type OpacityAttributes = Pick<SVGAttributes<SVGElement>, 'opacity' | 'fillOpacity' | 'strokeOpacity'>

/** Points to 0.01 pt (about 0.004 mm), which keeps the markup small and free of noise like 0.30000000000000004. */
function num(value: number): number {
  return Math.round(value * 100) / 100
}

function strokeAttributes(stroke: PaintStroke): StrokeAttributes {
  return {
    stroke: stroke.color,
    strokeWidth: num(stroke.width),
    strokeDasharray: stroke.dash.length > 0 ? stroke.dash.map((length) => num(length)).join(' ') : undefined,
  }
}

/**
 * Opacity as canvas applies it. Canvas fades a shape's fill and its outline one at a time, so a shape with
 * both gets fill-opacity and stroke-opacity: SVG's opacity would fade them together, which differs where the
 * outline covers the fill.
 */
function opacityAttributes(opacity: number | undefined, fillAndStroke: boolean): OpacityAttributes {
  const alpha = alphaOf(opacity)
  if (alpha === 1) return {}
  return fillAndStroke ? { fillOpacity: num(alpha), strokeOpacity: num(alpha) } : { opacity: num(alpha) }
}

function drawPrim(prim: Prim, key: number, logoHref: string | null): ReactElement | null {
  switch (prim.kind) {
    case 'rect': {
      const stroke = strokeOf(prim.stroke)
      if (!hasArea(prim.w, prim.h) || (!prim.fill && !stroke)) return null
      const radius = radiusOf(prim)
      return (
        <rect
          key={key}
          x={num(prim.x)}
          y={num(prim.y)}
          width={num(prim.w)}
          height={num(prim.h)}
          rx={radius > 0 ? num(radius) : undefined}
          fill={prim.fill ?? 'none'}
          {...(stroke && strokeAttributes(stroke))}
          {...opacityAttributes(prim.opacity, Boolean(prim.fill && stroke))}
        />
      )
    }
    case 'line': {
      const stroke = strokeOf(prim.stroke)
      if (!stroke) return null
      return (
        <line
          key={key}
          x1={num(prim.x1)}
          y1={num(prim.y1)}
          x2={num(prim.x2)}
          y2={num(prim.y2)}
          {...strokeAttributes(stroke)}
          {...opacityAttributes(prim.opacity, false)}
        />
      )
    }
    case 'path': {
      const stroke = strokeOf(prim.stroke)
      if (!prim.fill && !stroke) return null
      return (
        <path
          key={key}
          d={prim.d}
          fill={prim.fill ?? 'none'}
          {...(stroke && strokeAttributes(stroke))}
          {...opacityAttributes(prim.opacity, Boolean(prim.fill && stroke))}
        />
      )
    }
    case 'text':
      // Sans is the root's font, so only mono text names its family; the weight is always given, so nothing
      // around the page can make it bold.
      return (
        <text
          key={key}
          x={num(prim.x)}
          y={num(prim.y)}
          fill={prim.color}
          fontFamily={prim.family === 'mono' ? FONT_FAMILIES.mono : undefined}
          fontSize={num(prim.size)}
          fontWeight={prim.weight}
          textAnchor={prim.anchor === 'start' ? undefined : prim.anchor}
          {...opacityAttributes(prim.opacity, false)}
        >
          {prim.text}
        </text>
      )
    case 'image':
      // The default preserveAspectRatio centres the logo in its box without stretching it, as paintCanvas does.
      if (!logoHref || !hasArea(prim.w, prim.h)) return null
      return (
        <image
          key={key}
          href={logoHref}
          x={num(prim.x)}
          y={num(prim.y)}
          width={num(prim.w)}
          height={num(prim.h)}
          {...opacityAttributes(prim.opacity, false)}
        />
      )
  }
}

/** role="img" with aria-label = page.label; viewBox in points; a white page first; no ids anywhere. */
export const SvgPage = memo(function SvgPage({ page, sheet, size, logoHref }: SvgPageProps) {
  const width = num(page.width)
  const height = num(page.height)
  // The mitre limit is canvas's 10 (SVG's own is 4), so sharp corners join the same way on slides.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={size === 'print' ? sheet.cssWidth : '100%'}
      height={size === 'print' ? sheet.cssHeight : undefined}
      role="img"
      aria-label={page.label}
      fontFamily={FONT_FAMILIES.sans}
      textRendering="geometricPrecision"
      strokeMiterlimit={10}
    >
      <rect width={width} height={height} fill={INK.white} />
      {page.prims.map((prim, index) => drawPrim(prim, index, logoHref))}
    </svg>
  )
})
