import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { INK, NEUTRAL, OPTION_INK } from './exportPalette'
import { A4, SLIDE } from './exportSheets'
import {
  FONT_FAMILIES,
  type LinePrim,
  type Page,
  type PathPrim,
  type Prim,
  type RectPrim,
  type Stroke,
  type TextPrim,
} from './scene'
import { SvgPage, type SvgPageProps } from './SvgPage'

// The real logo isn't loaded in node, so a navy block of the same shape stands in for it.
const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 426 240">' +
    '<rect width="426" height="240" rx="24" fill="#160035"/></svg>',
)}`

function render(page: Page, props: Partial<Omit<SvgPageProps, 'page'>> = {}): string {
  return renderToStaticMarkup(createElement(SvgPage, { page, sheet: A4, size: 'print', logoHref: LOGO, ...props }))
}

/** One element per line, so the snapshot diffs readably (React writes the whole page as one line). */
const readable = (markup: string) => `${markup.replace(/>(?=<[^/])/g, '>\n')}\n`

/** The opening tags of one kind of element. */
const tags = (markup: string, name: string) => markup.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []

const stroke = (color: string, width: number, dash?: number[]): Stroke => ({ color, width, dash })
const rect = (x: number, y: number, w: number, h: number, paint: Partial<RectPrim> = {}): RectPrim => ({
  kind: 'rect', x, y, w, h, ...paint,
})
const line = (x1: number, y1: number, x2: number, y2: number, paint: Stroke, opacity?: number): LinePrim => ({
  kind: 'line', x1, y1, x2, y2, stroke: paint, opacity,
})
const path = (d: string, paint: Omit<PathPrim, 'kind' | 'd'>): PathPrim => ({ kind: 'path', d, ...paint })
/** A circle as a path, as the status icons are drawn */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`
const text = (x: number, y: number, value: string, extra: Partial<TextPrim> = {}): TextPrim => ({
  kind: 'text', x, y, anchor: 'start', family: 'sans', size: 8, weight: 400, text: value, color: INK.text, ...extra,
})
/** Column headings and lane names: small mono capitals */
const heading = (x: number, y: number, value: string, anchor: TextPrim['anchor'] = 'start') =>
  text(x, y, value, { anchor, family: 'mono', size: 6.5, weight: 600, color: INK.subtle })
/** '#124' in the # column, right-aligned so the digits line up */
const itemNumber = (y: number, value: string) =>
  text(46, y, value, { anchor: 'end', family: 'mono', size: 7, color: INK.subtle })
/** The Owner, Dates and Status cells of a row */
const cell = (x: number, y: number, value: string, extra: Partial<TextPrim> = {}) =>
  text(x, y, value, { size: 7.5, ...extra })
const warning = (color: string): Partial<TextPrim> => ({ weight: 600, color })

const BLUE = OPTION_INK.BLUE
const LEFT = 28
const RIGHT = 813.89
const CHART = 430
/** The plan year across the chart, 1 Sep 2026 to 31 Aug 2027 (long decimals on purpose: they come out rounded). */
const dayX = (day: number) => CHART + (day * (RIGHT - CHART)) / 365
const AS_OF = dayX(70)
const bar = (from: number, to: number, y: number, fill: string): RectPrim =>
  rect(dayX(from), y, dayX(to) - dayX(from), 8, { radius: 1.5, fill, stroke: stroke(BLUE.ink, 0.5) })

/** The timescale's month lines and names, with the year line at January. */
function months(): Prim[] {
  const names = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
  const lengths = [30, 31, 30, 31, 31, 28, 31, 30, 31, 30, 31, 31]
  const prims: Prim[] = []
  let day = 0
  names.forEach((name, index) => {
    const next = day + lengths[index]
    if (name === 'Jan') prims.push(line(dayX(day), 75, dayX(day), 101, stroke(NEUTRAL.year, 0.75)))
    else if (index > 0) prims.push(line(dayX(day), 88, dayX(day), 101, stroke(NEUTRAL.month, 0.5)))
    const centre = (dayX(day) + dayX(next)) / 2
    prims.push(text(centre, 97.5, name, { anchor: 'middle', size: 7, weight: 500, color: INK.muted }))
    day = next
  })
  return prims
}

/** The Blocked hatch: 45° lines every 2.5 pt, cut to the bar. */
function hatch(x: number, y: number, w: number, h: number): Prim[] {
  const lines: Prim[] = []
  for (let left = x; left + h <= x + w; left += 2.5) {
    lines.push(line(left, y + h, left + h, y, stroke(INK.problem, 0.5)))
  }
  return lines
}

/** A hand-made A4 page in the export's style, with every kind of shape and every option of each. */
function samplePage(): Page {
  const prims: Prim[] = [
    // Title block
    { kind: 'image', x: LEFT, y: 26, w: 53, h: 30, asset: 'logo' },
    heading(89, 33, 'BRISTOL FORMULA STUDENT AI'),
    text(89, 48, '2026–27 Plan', { size: 15, weight: 600, color: INK.navy }),
    text(89, 59, 'Timeline · Mechanical · selected tasks · Sep 2026 – Aug 2027', { color: INK.muted }),
    text(RIGHT, 35, 'Status as of 10 November 2026', { anchor: 'end', size: 8.5, weight: 600 }),
    text(RIGHT, 45, '5 tasks · 1 done · 1 blocked · 1 overdue · 1 at risk', { anchor: 'end', size: 7.5 }),
    text(RIGHT, 54, 'Next key date: Design freeze, 15 Dec 2026', { anchor: 'end', size: 7.5 }),
    text(RIGHT, 63, 'Prepared by Jane Smith', { anchor: 'end', size: 7.5 }),
    line(LEFT, 66.75, RIGHT, 66.75, stroke(INK.brand, 1.5)),
    // Column headings and the timescale, shaded before the as-of date, with the as-of pill
    rect(CHART, 75, AS_OF - CHART, 26, { fill: NEUTRAL.elapsed }),
    heading(46, 97, '#', 'end'),
    heading(54, 97, 'TASK'),
    heading(248, 97, 'OWNER'),
    heading(318, 97, 'DATES'),
    heading(372, 97, 'STATUS'),
    text(CHART + 4, 85, '2026', { size: 7.5, weight: 600 }),
    text(dayX(122) + 4, 85, '2027', { size: 7.5, weight: 600 }),
    ...months(),
    rect(AS_OF - 20, 77, 40, 9, { radius: 4.5, fill: INK.brand }),
    text(AS_OF, 83.6, 'As of 10 Nov', { anchor: 'middle', size: 6.5, weight: 600, color: INK.white }),
    line(LEFT, 101, RIGHT, 101, stroke(NEUTRAL.year, 0.75)),
    // Phases lane: a finished phase, then the current one outlined
    heading(32, 110.5, 'PHASES'),
    path('M430 103H483.62V113H430Z', { fill: NEUTRAL.wholeTeamTint }),
    line(CHART, 103.5, 483.62, 103.5, stroke(INK.navy, 1)),
    text(434, 110.5, 'Concept', { size: 7, weight: 600, color: INK.navy }),
    rect(483.62, 103, 90, 10, { fill: NEUTRAL.wholeTeamTint, stroke: stroke(INK.navy, 0.75) }),
    text(487.62, 110.5, 'Detailed design', { size: 7, weight: 600, color: INK.navy }),
    // Key dates lane: an upcoming whole-team key date, hollow
    heading(32, 124.5, 'KEY DATES'),
    path('M540.43 118.5L543.93 122L540.43 125.5L536.93 122Z', { fill: INK.white, stroke: stroke(INK.navy, 0.75) }),
    text(547, 124.5, 'Design freeze', { size: 7, weight: 600 }),
    text(594, 124.5, '15 Dec', { size: 7, color: INK.muted }),
    // Group header with its summary bar and end ticks
    rect(LEFT, 133, RIGHT - LEFT, 18, { fill: NEUTRAL.groupBand }),
    rect(LEFT, 133, 3, 18, { fill: BLUE.solid }),
    text(35, 145, 'Mechanical', { size: 9, weight: 600, color: INK.navy }),
    text(92, 145, 'Lead: Jane Smith · 5 tasks · 1 done · 1 overdue', { size: 7, color: INK.muted }),
    rect(CHART, 140.5, RIGHT - CHART, 3, { fill: BLUE.solid }),
    path('M430.5 139.5V145.5M813.39 139.5V145.5', { stroke: stroke(BLUE.solid, 1) }),
    // In progress: tinted, with a half-filled circle
    itemNumber(161.5, '#124'),
    text(54, 161.5, 'Chassis design review & sign-off <draft>'),
    cell(248, 161.5, 'Jane Smith +2'),
    cell(318, 161.5, '4 Nov – 20 Dec'),
    path(circle(375, 158.5, 3), { stroke: stroke(INK.text, 0.75) }),
    path('M375 155.5A3 3 0 0 0 375 161.5Z', { fill: INK.text }),
    cell(381, 161.5, 'In progress'),
    bar(64, 110, 154.5, BLUE.tint),
    // Overdue: a red cap and a dotted slip trail to the as-of line
    rect(LEFT, 166, RIGHT - LEFT, 15, { fill: NEUTRAL.zebra }),
    itemNumber(176.5, '#125'),
    text(54, 176.5, 'Brake pedal box'),
    cell(248, 176.5, 'Alexandra Smith'),
    cell(318, 176.5, '1 Oct – 2 Nov', warning(INK.problemText)),
    path(circle(375, 173.5, 3), { fill: INK.problem }),
    line(375, 171.6, 375, 174.1, stroke(INK.white, 0.9)),
    rect(374.55, 174.7, 0.9, 0.9, { fill: INK.white }),
    cell(381, 176.5, 'Overdue', warning(INK.problemText)),
    bar(30, 63, 169.5, BLUE.tint),
    line(dayX(63), 169.5, dayX(63), 177.5, stroke(INK.problem, 1)),
    line(dayX(63), 173.5, AS_OF, 173.5, stroke(INK.problem, 0.75, [1, 1.5])),
    // Blocked: the hatch over the fill, then a red outline with no fill
    itemNumber(191.5, '#126'),
    text(54, 191.5, 'Accumulator enclosure'),
    cell(248, 191.5, 'Sam Lee'),
    cell(318, 191.5, '12 Jan – 3 Mar 2027'),
    rect(372, 185.5, 6, 6, { radius: 1, fill: INK.problem }),
    cell(381, 191.5, 'Blocked', warning(INK.problemText)),
    rect(571, 184.5, 51, 8, { radius: 1.5, fill: BLUE.tint }),
    ...hatch(571, 184.5, 51, 8),
    rect(571, 184.5, 51, 8, { radius: 1.5, stroke: stroke(INK.problem, 1) }),
    // Done: solid, with a white tick
    rect(LEFT, 196, RIGHT - LEFT, 15, { fill: NEUTRAL.zebra }),
    itemNumber(206.5, '#127'),
    text(54, 206.5, 'Frame jig'),
    cell(248, 206.5, '—'),
    cell(318, 206.5, '1 Sep – 30 Sep'),
    path(circle(375, 203.5, 3), { fill: INK.text }),
    cell(381, 206.5, 'Done'),
    bar(0, 30, 199.5, BLUE.solid),
    path('M433 203.5L434.5 205L437.5 202', { stroke: stroke(INK.white, 1) }),
    // At risk, and cut off by the end of the period: a square end and an outward chevron
    itemNumber(221.5, '#128'),
    text(54, 221.5, 'Wiring loom'),
    cell(248, 221.5, 'Priya Patel'),
    cell(318, 221.5, '20 Jul – 30 Sep 2027'),
    path('M375 215.5L378 220.7H372Z', { fill: INK.amber }),
    cell(381, 221.5, 'At risk', warning(INK.amberText)),
    path('M755.5 215.8L758 220.2H753Z', { fill: INK.amber }),
    path('M761.5 214.5H813.89V222.5H761.5A1.5 1.5 0 0 1 760 221V216A1.5 1.5 0 0 1 761.5 214.5Z', {
      fill: BLUE.tint,
      stroke: stroke(BLUE.ink, 0.5),
    }),
    path('M808.39 216L810.89 218.5L808.39 221', { stroke: stroke(BLUE.ink, 0.75) }),
    // In front of the rows: the divider, the key date's dashed line and the as-of line
    line(CHART, 75, CHART, 226, stroke(NEUTRAL.year, 0.75)),
    line(540.43, 125.5, 540.43, 226, stroke(INK.navy, 0.5, [2, 2]), 0.5),
    line(AS_OF, 86, AS_OF, 226, stroke(INK.brand, 0.75)),
    // Legend
    line(LEFT, 540, RIGHT, 540, stroke(NEUTRAL.rule, 0.5)),
    heading(LEFT, 549, 'KEY'),
    rect(48, 544, 12, 6, { fill: BLUE.solid }),
    text(63, 549, 'Mechanical', { size: 6.5 }),
    rect(110, 544, 12, 6, { radius: 1.5, fill: INK.white, stroke: stroke(NEUTRAL.sampleInk, 0.75) }),
    text(125, 549, 'Not started', { size: 6.5 }),
    rect(170, 544, 12, 6, { radius: 1.5, fill: NEUTRAL.sampleTint, stroke: stroke(NEUTRAL.sampleInk, 0.5) }),
    text(185, 549, 'In progress', { size: 6.5 }),
    path('M236 543.5L239 546.5L236 549.5L233 546.5Z', {
      fill: NEUTRAL.sample,
      stroke: stroke(NEUTRAL.sampleInk, 0.75),
      opacity: 0.6,
    }),
    text(243, 549, 'Key date done', { size: 6.5, opacity: 0.8 }),
    line(300, 546.5, 310, 546.5, stroke(INK.brand, 0.75)),
    text(313, 549, 'As of 10 Nov 2026', { size: 6.5 }),
    text(
      LEFT,
      558,
      'Overdue: due before 10 Nov 2026 and not done. ' +
        'At risk: waits on work that is blocked, overdue, or due after it starts.',
      { size: 6.5, color: INK.muted },
    ),
    // Footer
    text(LEFT, 569, 'Bristol FSAI · 2026–27 Plan · Exported 10 Nov 2026, 14:32', { size: 6.5, color: INK.muted }),
    text(RIGHT, 569, 'Page 1 of 1', { anchor: 'end', size: 7, weight: 600 }),
  ]
  return { width: A4.width, height: A4.height, label: 'Page 1 of 1: Mechanical, 5 tasks', prims }
}

const tiny = (prims: Prim[]): Page => ({ width: 100, height: 50, label: 'Page 1 of 1', prims })

describe('SvgPage', () => {
  it('draws the sample page (open the snapshot in a browser to look at it)', async () => {
    await expect(readable(render(samplePage()))).toMatchFileSnapshot('__snapshots__/sample-page.svg')
  })

  it('is the sheet’s true size for print, and 100% wide in the preview, with the viewBox in points', () => {
    const [print] = tags(render(samplePage()), 'svg')
    expect(print).toContain('viewBox="0 0 841.89 593.86"')
    expect(print).toContain('width="297mm"')
    expect(print).toContain('height="209.5mm"')

    const [fit] = tags(render(samplePage(), { size: 'fit' }), 'svg')
    expect(fit).toContain('viewBox="0 0 841.89 593.86"')
    expect(fit).toContain('width="100%"')
    expect(fit).not.toContain('height=')

    const [slide] = tags(render({ ...tiny([]), width: 960, height: 540 }, { sheet: SLIDE }), 'svg')
    expect(slide).toContain('viewBox="0 0 960 540"')
    // A slide printed with Ctrl/Cmd+P is 1.5 pt short of its 540 pt page, as paper sheets are, so no
    // blank page follows.
    expect(slide).toContain('width="960pt"')
    expect(slide).toContain('height="538.5pt"')
  })

  it('is one image for screen readers, labelled by the page', () => {
    const [svg] = tags(render(samplePage()), 'svg')
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Page 1 of 1: Mechanical, 5 tasks"')
  })

  it('starts with a white page, and sets the fonts and text rendering once on the root', () => {
    const markup = render(samplePage())
    expect(markup).toMatch(/^<svg [^>]*><rect width="841.89" height="593.86" fill="#ffffff"><\/rect>/)
    const [svg] = tags(markup, 'svg')
    const attribute = (value: string) => value.replaceAll("'", '&#x27;')
    expect(svg).toContain(`font-family="${attribute(FONT_FAMILIES.sans)}"`)
    expect(svg).toContain('text-rendering="geometricPrecision"')
    expect(svg).toContain('stroke-miterlimit="10"')

    // Only mono text names its family; every text gives its size and weight.
    const texts = tags(markup, 'text')
    const mono = texts.filter((tag) => tag.includes('font-family='))
    expect(mono.length).toBeGreaterThan(0)
    for (const tag of mono) expect(tag).toContain(`font-family="${attribute(FONT_FAMILIES.mono)}"`)
    for (const tag of texts) expect(tag).toMatch(/font-size="[\d.]+" font-weight="[456]00"/)
  })

  it('anchors text by text-anchor, leaving out the default start', () => {
    const markup = render(tiny([
      text(5, 10, 'a'),
      text(50, 10, 'b', { anchor: 'middle' }),
      text(95, 10, 'c', { anchor: 'end' }),
    ]))
    const [a, b, c] = tags(markup, 'text')
    expect(a).not.toContain('text-anchor')
    expect(b).toContain('text-anchor="middle"')
    expect(c).toContain('text-anchor="end"')
  })

  it('escapes user text, so it is drawn exactly as typed and never runs', () => {
    const typed =
      `</text><script>alert("hi")</script> & Tom's <b onmouseover="steal()">plan</b> ]]> {{x}} javascript:alert(1)`
    const markup = render({ ...tiny([text(5, 20, typed)]), label: `Page 1 of 1: ${typed}` })
    const escaped =
      '&lt;/text&gt;&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; Tom&#x27;s ' +
      '&lt;b onmouseover=&quot;steal()&quot;&gt;plan&lt;/b&gt; ]]&gt; {{x}} javascript:alert(1)'
    expect(markup).toContain(`>${escaped}</text>`)
    expect(markup).toContain(`aria-label="Page 1 of 1: ${escaped}"`)
    expect(markup).not.toMatch(/<script|<b[ >]/)
    expect(tags(markup, 'text')).toHaveLength(1)
  })

  it('never uses ids, defs, patterns, clip paths, masks or markers', () => {
    const markup = render(samplePage())
    expect(markup).not.toMatch(/\sid=/)
    expect(markup).not.toMatch(/<(defs|pattern|clipPath|mask|marker|use|symbol|style|script|foreignObject)\b/i)
    expect(markup).not.toContain('url(')
  })

  it('draws the logo from its data URL, and leaves it out when there is none', () => {
    const [image] = tags(render(samplePage()), 'image')
    expect(image).toContain(`href="${LOGO}"`)
    expect(image).toContain('x="28" y="26" width="53" height="30"')
    expect(render(samplePage(), { logoHref: null })).not.toContain('<image')
  })

  it('draws rect corners with rx, dashes with stroke-dasharray, and nothing it isn’t given', () => {
    const markup = render(tiny([
      rect(1, 2, 30, 8, { radius: 1.5, fill: '#bbd7fe', stroke: stroke('#0055cc', 0.5) }),
      rect(1, 2, 30, 8, { stroke: stroke('#c9372c', 1) }),
      line(0, 20, 100, 20, stroke('#160035', 0.5, [2, 2])),
      path('M10 30L14 34L10 38L6 34Z', { fill: '#1d7afc' }),
    ]))
    const [, filled, outline] = tags(markup, 'rect')
    expect(filled).toBe(
      '<rect x="1" y="2" width="30" height="8" rx="1.5" fill="#bbd7fe" stroke="#0055cc" stroke-width="0.5">',
    )
    expect(outline).toBe('<rect x="1" y="2" width="30" height="8" fill="none" stroke="#c9372c" stroke-width="1">')
    expect(tags(markup, 'line')).toEqual([
      '<line x1="0" y1="20" x2="100" y2="20" stroke="#160035" stroke-width="0.5" stroke-dasharray="2 2">',
    ])
    expect(tags(markup, 'path')).toEqual(['<path d="M10 30L14 34L10 38L6 34Z" fill="#1d7afc">'])
  })

  it('fades shapes as canvas does: a shape with a fill and an outline fades each', () => {
    const square = (opacity: number, paint: Partial<RectPrim> = {}) =>
      rect(0, 0, 5, 5, { fill: '#000000', opacity, ...paint })
    const markup = render(tiny([
      square(0.5, { stroke: stroke('#ffffff', 1) }),
      square(0.5),
      line(0, 0, 5, 5, stroke('#000000', 1), 0.25),
      { kind: 'image', x: 0, y: 0, w: 5, h: 5, asset: 'logo', opacity: 0.333 },
      text(5, 10, 'faded', { opacity: 0.8 }),
      square(1),
      square(2),
      square(Number.NaN),
      square(-1),
    ]))
    const [, both, fill, opaque, high, missing, low] = tags(markup, 'rect')
    expect(both).toContain('fill-opacity="0.5" stroke-opacity="0.5"')
    expect(both).not.toContain(' opacity=')
    expect(fill).toContain(' opacity="0.5"')
    expect(tags(markup, 'line')[0]).toContain(' opacity="0.25"')
    expect(tags(markup, 'image')[0]).toContain(' opacity="0.33"')
    expect(tags(markup, 'text')[0]).toContain(' opacity="0.8"')
    for (const tag of [opaque, high, missing]) expect(tag).not.toContain('opacity')
    expect(low).toContain(' opacity="0"')
  })

  it('writes numbers to 0.01 pt', () => {
    const page = { ...tiny([rect(0.1 + 0.2, 12.345678, 1 / 3, 8, { fill: '#000000' })]), width: 841.889764 }
    const markup = render(page)
    expect(tags(markup, 'svg')[0]).toContain('viewBox="0 0 841.89 50"')
    expect(tags(markup, 'rect')[1]).toBe('<rect x="0.3" y="12.35" width="0.33" height="8" fill="#000000">')
  })

  it('treats odd values as paintCanvas does', () => {
    const markup = render(tiny([
      rect(0, 0, 0, 5, { fill: '#000001' }),
      rect(0, 0, 5, -2, { fill: '#000002' }),
      rect(0, 0, 5, 5),
      rect(0, 0, 30, 8, { radius: 10, fill: '#000003' }),
      rect(0, 0, 5, 5, { fill: '#000004', stroke: stroke('#ffffff', 0) }),
      line(0, 0, 5, 5, stroke('#000005', Number.NaN)),
      line(0, 0, 5, 5, stroke('#000006', 1, [2, -2])),
      path('M0 0L5 5', {}),
      { kind: 'image', x: 0, y: 0, w: 53, h: 0, asset: 'logo' },
    ]))
    // The white page, the radius cut to half the bar's height, and the fill without its zero-width outline
    expect(tags(markup, 'rect')).toEqual([
      '<rect width="100" height="50" fill="#ffffff">',
      '<rect x="0" y="0" width="30" height="8" rx="4" fill="#000003">',
      '<rect x="0" y="0" width="5" height="5" fill="#000004">',
    ])
    // A dash list that can't be drawn is a solid line
    expect(tags(markup, 'line')).toEqual(['<line x1="0" y1="0" x2="5" y2="5" stroke="#000006" stroke-width="1">'])
    expect(markup).not.toContain('<path')
    expect(markup).not.toContain('<image')
  })
})
