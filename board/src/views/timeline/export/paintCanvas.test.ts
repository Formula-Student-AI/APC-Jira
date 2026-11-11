import { describe, expect, it } from 'vitest'
import { alphaOf, canvasFont, hasArea, paintPage, radiusOf, strokeOf, type PaintContext } from './paintCanvas'
import { FONT_FAMILIES, type LinePrim, type Page, type Prim, type RectPrim, type Stroke, type TextPrim } from './scene'

type Call = [name: string, ...args: unknown[]]

const METHODS = [
  'save', 'restore', 'setTransform', 'setLineDash', 'beginPath', 'moveTo', 'lineTo',
  'rect', 'roundRect', 'fill', 'stroke', 'fillRect', 'fillText', 'drawImage',
]
const SETTINGS = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha', 'font', 'textAlign', 'textBaseline',
]

/** A context that writes down every call (['fillRect', 0, 0, 10, 10]) and every setting (['font=', …]) in order. */
function recorder({ roundRect = true } = {}): { ctx: PaintContext; calls: Call[] } {
  const calls: Call[] = []
  const ctx: Record<string, unknown> = {}
  for (const name of METHODS) {
    if (name !== 'roundRect' || roundRect) ctx[name] = (...args: unknown[]) => void calls.push([name, ...args])
  }
  for (const name of SETTINGS) {
    let value: unknown
    Object.defineProperty(ctx, name, {
      get: () => value,
      set: (next: unknown) => {
        value = next
        calls.push([`${name}=`, next])
      },
    })
  }
  return { ctx: ctx as unknown as PaintContext, calls }
}

/** Path2D doesn't exist in node, so the painter gets a stand-in that keeps the path's string. */
const makePath = (d: string) => ({ d }) as unknown as Path2D

const page = (prims: Prim[]): Page => ({ width: 100, height: 50, label: 'Page 1 of 1', prims })

/** What every page starts with: the transform, SVG's defaults and the white page. */
const start = (pxPerPt: number): Call[] => [
  ['save'],
  ['setTransform', pxPerPt, 0, 0, pxPerPt, 0, 0],
  ['lineCap=', 'butt'],
  ['lineJoin=', 'miter'],
  ['textBaseline=', 'alphabetic'],
  ['globalAlpha=', 1],
  ['fillStyle=', '#ffffff'],
  ['fillRect', 0, 0, 100, 50],
]

/** The calls for the prims alone, at 4 px per pt: after the white page, before the restore. */
function paintPrims(prims: Prim[], options: { roundRect?: boolean; logo?: CanvasImageSource } = {}): Call[] {
  const { ctx, calls } = recorder({ roundRect: options.roundRect })
  paintPage(ctx, page(prims), 4, { logo: options.logo ?? null }, makePath)
  expect(calls.slice(0, start(4).length)).toEqual(start(4))
  return calls.slice(start(4).length, -1)
}

const only = (calls: Call[], ...names: string[]) => calls.filter(([name]) => names.includes(name))

const stroke = (color: string, width: number, dash?: number[]): Stroke => ({ color, width, dash })
const rect = (x: number, y: number, w: number, h: number, paint: Partial<RectPrim> = {}): RectPrim => ({
  kind: 'rect', x, y, w, h, ...paint,
})
const line = (x1: number, y1: number, x2: number, y2: number, paint: Stroke, opacity?: number): LinePrim => ({
  kind: 'line', x1, y1, x2, y2, stroke: paint, opacity,
})
const text = (value: string, extra: Partial<TextPrim> = {}): TextPrim => ({
  kind: 'text', x: 10, y: 20, anchor: 'start', family: 'sans', size: 8, weight: 400, text: value, color: '#172b4d',
  ...extra,
})
const logoBox: Prim = { kind: 'image', x: 28, y: 26, w: 53, h: 30, asset: 'logo' }

describe('paintPage', () => {
  it('paints a white page, then every prim in order, in points under one transform', () => {
    const logo = { width: 106, height: 60 } as unknown as CanvasImageSource
    const { ctx, calls } = recorder()
    const prims: Prim[] = [
      rect(1, 2, 30, 8, { radius: 1.5, fill: '#bbd7fe', stroke: stroke('#0055cc', 0.5) }),
      line(0, 20, 100, 20, stroke('#160035', 0.5, [2, 2]), 0.5),
      { kind: 'path', d: 'M10 30L14 34L10 38L6 34Z', fill: '#1d7afc', stroke: stroke('#0055cc', 0.75) },
      text('#124', { x: 50, y: 45, anchor: 'end', family: 'mono', size: 7, weight: 600, color: '#626f86' }),
      { kind: 'image', x: 2, y: 2, w: 53, h: 30, asset: 'logo' },
    ]
    paintPage(ctx, page(prims), 4, { logo }, makePath)

    expect(calls).toEqual([
      ...start(4),
      ['beginPath'],
      ['roundRect', 1, 2, 30, 8, 1.5],
      ['fillStyle=', '#bbd7fe'],
      ['fill'],
      ['strokeStyle=', '#0055cc'],
      ['lineWidth=', 0.5],
      ['setLineDash', []],
      ['stroke'],
      ['globalAlpha=', 0.5],
      ['beginPath'],
      ['moveTo', 0, 20],
      ['lineTo', 100, 20],
      ['strokeStyle=', '#160035'],
      ['lineWidth=', 0.5],
      ['setLineDash', [2, 2]],
      ['stroke'],
      ['globalAlpha=', 1],
      ['fillStyle=', '#1d7afc'],
      ['fill', { d: 'M10 30L14 34L10 38L6 34Z' }],
      ['strokeStyle=', '#0055cc'],
      ['lineWidth=', 0.75],
      ['setLineDash', []],
      ['stroke', { d: 'M10 30L14 34L10 38L6 34Z' }],
      ['font=', `600 7px ${FONT_FAMILIES.mono}`],
      ['textAlign=', 'right'],
      ['fillStyle=', '#626f86'],
      ['fillText', '#124', 50, 45],
      ['drawImage', logo, 2, 2, 53, 30],
      ['restore'],
    ])
  })

  it('sets text in FONT_FAMILIES at its size and weight, aligned by its anchor', () => {
    const calls = paintPrims([
      text('Mechanical', { anchor: 'start' }),
      text('Status as of 10 November 2026', { anchor: 'end', size: 8.5, weight: 600 }),
      text('As of 10 Nov', { anchor: 'middle', size: 8.5, weight: 600 }),
      text('KEY', { family: 'mono', size: 6.5, weight: 600 }),
    ])

    expect(only(calls, 'font=', 'textAlign=', 'fillText')).toEqual([
      ['font=', `400 8px ${FONT_FAMILIES.sans}`],
      ['textAlign=', 'left'],
      ['fillText', 'Mechanical', 10, 20],
      ['font=', `600 8.5px ${FONT_FAMILIES.sans}`],
      ['textAlign=', 'right'],
      ['fillText', 'Status as of 10 November 2026', 10, 20],
      // The same font isn't set again (setting a font means parsing it)
      ['textAlign=', 'center'],
      ['fillText', 'As of 10 Nov', 10, 20],
      ['font=', `600 6.5px ${FONT_FAMILIES.mono}`],
      ['textAlign=', 'left'],
      ['fillText', 'KEY', 10, 20],
    ])
  })

  it('scales dashes and line widths with the rest, and never lets a dash carry over', () => {
    const { ctx, calls } = recorder()
    const prims: Prim[] = [
      line(0, 1, 10, 1, stroke('#160035', 0.5, [2, 2])),
      line(0, 2, 10, 2, stroke('#ab1f2d', 0.75)),
      line(0, 3, 10, 3, stroke('#c9372c', 0.75, [1, 1.5])),
      { kind: 'path', d: 'M0 4C5 4 5 8 10 8', stroke: stroke('#c9372c', 0.9, [2.5, 1.5]) },
    ]
    paintPage(ctx, page(prims), 2, { logo: null }, makePath)

    // At 2 px per pt the transform doubles everything, so the painter passes points and never multiplies.
    expect(calls[1]).toEqual(['setTransform', 2, 0, 0, 2, 0, 0])
    expect(only(calls, 'lineWidth=', 'setLineDash')).toEqual([
      ['lineWidth=', 0.5],
      ['setLineDash', [2, 2]],
      ['lineWidth=', 0.75],
      ['setLineDash', []],
      ['lineWidth=', 0.75],
      ['setLineDash', [1, 1.5]],
      ['lineWidth=', 0.9],
      ['setLineDash', [2.5, 1.5]],
    ])
  })

  it('draws a dash list it can’t use as a solid line, as SVG does', () => {
    const dashed = (dash: number[]) => line(0, 0, 10, 0, stroke('#000000', 1, dash))
    const calls = paintPrims([dashed([-1, 2]), dashed([0, 0]), dashed([Number.NaN, 1]), dashed([Infinity]), dashed([])])
    expect(only(calls, 'setLineDash')).toEqual(Array(5).fill(['setLineDash', []]))
  })

  it('rounds corners with roundRect, no more than the bar allows, and draws them square without it', () => {
    const bars: Prim[] = [
      rect(1, 2, 30, 8, { radius: 1.5, fill: '#1d7afc' }),
      rect(1, 2, 30, 8, { radius: 10, fill: '#1d7afc' }),
      rect(1, 2, 3, 8, { radius: 2, fill: '#1d7afc' }),
      rect(1, 2, 30, 8, { fill: '#1d7afc' }),
    ]

    expect(only(paintPrims(bars), 'roundRect', 'rect')).toEqual([
      ['roundRect', 1, 2, 30, 8, 1.5],
      ['roundRect', 1, 2, 30, 8, 4],
      ['roundRect', 1, 2, 3, 8, 1.5],
      ['rect', 1, 2, 30, 8],
    ])
    expect(only(paintPrims(bars, { roundRect: false }), 'roundRect', 'rect')).toEqual([
      ['rect', 1, 2, 30, 8],
      ['rect', 1, 2, 30, 8],
      ['rect', 1, 2, 3, 8],
      ['rect', 1, 2, 30, 8],
    ])
  })

  it('fades each prim by its own opacity, changing globalAlpha only when it differs', () => {
    const square = (opacity?: number) => rect(0, 0, 5, 5, { fill: '#000000', opacity })
    const opacities = [0.5, 0.5, undefined, 2, -1, Number.NaN, 0.25]
    const calls = paintPrims(opacities.map((opacity) => square(opacity)))
    expect(only(calls, 'globalAlpha=')).toEqual([
      ['globalAlpha=', 0.5],
      ['globalAlpha=', 1],
      ['globalAlpha=', 0],
      ['globalAlpha=', 1],
      ['globalAlpha=', 0.25],
    ])
  })

  it('puts the logo in its box without stretching it, and leaves it out when there is none', () => {
    const logo = { width: 426, height: 240 } as unknown as CanvasImageSource

    const [call] = paintPrims([logoBox], { logo })
    expect(call[0]).toBe('drawImage')
    expect(call[1]).toBe(logo)
    const [x, y, w, h] = call.slice(2) as number[]
    // 426 × 240 is a little wider than 53 × 30, so it fills the width and sits centred in the height.
    expect(x).toBeCloseTo(28)
    expect(w).toBeCloseTo(53)
    expect(h).toBeCloseTo((240 * 53) / 426)
    expect(y).toBeCloseTo(26 + (30 - h) / 2)

    // An image whose size isn't known fills the box as given.
    const unknown = {} as CanvasImageSource
    expect(paintPrims([logoBox], { logo: unknown })).toEqual([['drawImage', unknown, 28, 26, 53, 30]])
    expect(paintPrims([logoBox])).toEqual([])
  })

  it('leaves out shapes that have nothing to draw', () => {
    const calls = paintPrims([
      rect(0, 0, 0, 5, { fill: '#000000' }),
      rect(0, 0, 5, -2, { fill: '#000000' }),
      rect(0, 0, 5, 5),
      rect(0, 0, 5, 5, { stroke: stroke('#000000', 0) }),
      line(0, 0, 5, 5, stroke('#000000', -1)),
      { kind: 'path', d: 'M0 0L5 5' },
      { ...logoBox, w: 0 },
    ], { logo: { width: 426, height: 240 } as unknown as CanvasImageSource })
    expect(calls).toEqual([])
  })

  it('draws an outline without filling, and a fill without an outline', () => {
    const calls = paintPrims([
      rect(1, 1, 10, 8, { radius: 1.5, stroke: stroke('#c9372c', 1) }),
      { kind: 'path', d: 'M2 2L4 4', fill: '#e56910', stroke: stroke('#000000', 0) },
    ])
    expect(calls).toEqual([
      ['beginPath'],
      ['roundRect', 1, 1, 10, 8, 1.5],
      ['strokeStyle=', '#c9372c'],
      ['lineWidth=', 1],
      ['setLineDash', []],
      ['stroke'],
      ['fillStyle=', '#e56910'],
      ['fill', { d: 'M2 2L4 4' }],
    ])
  })

  it('leaves the context as it found it, even when a shape fails', () => {
    const { ctx, calls } = recorder()
    const broken = () => {
      throw new Error('bad path')
    }
    const prims: Prim[] = [{ kind: 'path', d: 'nonsense', fill: '#000000' }]
    expect(() => paintPage(ctx, page(prims), 4, { logo: null }, broken)).toThrow('bad path')
    expect(calls[0]).toEqual(['save'])
    expect(calls.at(-1)).toEqual(['restore'])
  })
})

describe('the rules both painters share', () => {
  it('draws a stroke only when its width shows, with a dash list that is valid or empty', () => {
    expect(strokeOf(undefined)).toBeNull()
    expect(strokeOf(stroke('#000000', 0))).toBeNull()
    expect(strokeOf(stroke('#000000', Number.NaN))).toBeNull()
    expect(strokeOf(stroke('#000000', Infinity))).toBeNull()
    expect(strokeOf(stroke('#000000', 0.5))).toEqual({ color: '#000000', width: 0.5, dash: [] })
    expect(strokeOf(stroke('#000000', 0.5, [2, 2]))).toEqual({ color: '#000000', width: 0.5, dash: [2, 2] })
    expect(strokeOf(stroke('#000000', 0.5, [0, 2]))?.dash).toEqual([0, 2])
    expect(strokeOf(stroke('#000000', 0.5, [2, -2]))?.dash).toEqual([])
    expect(strokeOf(stroke('#000000', 0.5, [0]))?.dash).toEqual([])
  })

  it('keeps opacity between 0 and 1, and 1 when it is missing', () => {
    expect(alphaOf(undefined)).toBe(1)
    expect(alphaOf(Number.NaN)).toBe(1)
    expect(alphaOf(0.5)).toBe(0.5)
    expect(alphaOf(1.5)).toBe(1)
    expect(alphaOf(-0.5)).toBe(0)
  })

  it('keeps corners within half the width and height', () => {
    expect(radiusOf({ w: 30, h: 8 })).toBe(0)
    expect(radiusOf({ w: 30, h: 8, radius: 1.5 })).toBe(1.5)
    expect(radiusOf({ w: 30, h: 8, radius: 6 })).toBe(4)
    expect(radiusOf({ w: 2, h: 8, radius: 1.5 })).toBe(1)
    expect(radiusOf({ w: 30, h: 8, radius: -1 })).toBe(0)
  })

  it('draws only boxes with a size', () => {
    expect(hasArea(12, 6)).toBe(true)
    expect(hasArea(0, 6)).toBe(false)
    expect(hasArea(12, -6)).toBe(false)
    expect(hasArea(Number.NaN, 6)).toBe(false)
    expect(hasArea(Infinity, 6)).toBe(false)
  })

  it('names the font as canvas wants it, in px that the transform makes points', () => {
    expect(canvasFont({ family: 'sans', size: 15, weight: 600 })).toBe(`600 15px ${FONT_FAMILIES.sans}`)
    expect(canvasFont({ family: 'mono', size: 6.5, weight: 600 })).toBe(
      "600 6.5px 'Geist Mono Variable', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    )
  })
})
