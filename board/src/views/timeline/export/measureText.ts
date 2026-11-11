// Measuring the Timeline export's text in the browser, for the pure layout's measure(text, font). The export
// is drawn by SVG (preview and PDF) and by canvas (slide images) in the page's own Geist faces, so text is
// measured with canvas measureText in those same faces, once they have loaded. Fonts come in unicode-range
// subsets that load only when needed, so the export's own text is loaded first: otherwise a Cyrillic or
// Vietnamese title would be measured in a fallback font and drawn in Geist, and run past its cell.

import { FONT_FAMILIES, type FontFamily, type FontSpec, type Measure } from './scene'

/** Text is measured at this size and scaled, so one cached width serves every size of the same text. */
const PROBE_PX = 100

/** The CSS font for canvas and document.fonts, e.g. "600 100px 'Geist Variable', system-ui, …". */
export function cssFont(family: FontFamily, weight: number, px: number): string {
  return `${weight} ${px}px ${FONT_FAMILIES[family]}`
}

/**
 * Loads the faces the export's text needs (each family's unicode-range subsets that cover it), then waits
 * for every font still loading. Never rejects: if a face can't load, the browser's fallback fonts stand in,
 * and they are what gets measured too.
 */
export async function ensureFonts(text: string): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts
  if (!fonts) return
  // Variable faces cover every weight, so one load per family is enough.
  const families = Object.keys(FONT_FAMILIES) as FontFamily[]
  await Promise.all(families.map((family) => fonts.load(cssFont(family, 400, 16), text || ' ').catch(() => [])))
  await fonts.ready.catch(() => undefined)
}

// One canvas for all measuring, made on first use. null: the browser gave no 2D context.
let probe: CanvasRenderingContext2D | null | undefined
let probeFont = ''

function context(): CanvasRenderingContext2D | null {
  if (probe === undefined) probe = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  return probe
}

/**
 * A measure for the layout: canvas measureText at 100 px in the export's fonts, scaled to the size asked
 * for, and cached by family, weight and text. Make a new one when fonts finish loading, so nothing measured
 * in a fallback font is reused. Without a 2D context it estimates from the number of characters.
 */
export function createMeasure(): Measure {
  const cache = new Map<string, number>()
  return (text: string, font: FontSpec): number => {
    if (!text) return 0
    const key = `${font.family}\u0000${font.weight}\u0000${text}`
    let width = cache.get(key)
    if (width === undefined) {
      const ctx = context()
      if (ctx) {
        const css = cssFont(font.family, font.weight, PROBE_PX)
        // Setting the font means parsing it, so only when it changes.
        if (probeFont !== css) {
          ctx.font = css
          probeFont = css
        }
        width = ctx.measureText(text).width
      } else {
        width = [...text].length * PROBE_PX * (font.family === 'mono' ? 0.6 : 0.55)
      }
      cache.set(key, width)
    }
    return (width * font.size) / PROBE_PX
  }
}
