// Measuring in the browser, with a fake canvas and font set: widths at 100 px scaled to size and cached,
// and the export's fonts loaded for its text without ever failing.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMeasure, cssFont, ensureFonts } from './measureText'
import type { FontSpec } from './scene'

// A canvas context that measures as the layout's own tests do (characters × size × 0.55, or 0.6 for mono)
// from the font it was last given, and records each call.
const measured: string[] = []
const context = {
  font: '',
  measureText(text: string) {
    measured.push(`${this.font}|${text}`)
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 0)
    return { width: [...text].length * px * (this.font.includes('Geist Mono') ? 0.6 : 0.55) }
  },
}

interface FakeFonts {
  load: (font: string, text: string) => Promise<unknown>
  ready: Promise<unknown>
}

/** A document with one canvas (the measuring one) and, if given, a font set. */
function stubDocument(fonts?: FakeFonts) {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }), fonts })
}

const sans = (size: number, weight = 400): FontSpec => ({ family: 'sans', size, weight })

afterEach(() => {
  vi.unstubAllGlobals()
  measured.length = 0
})

describe('createMeasure', () => {
  it('measures at 100 px in the export’s fonts and scales to the size asked for', () => {
    stubDocument()
    const measure = createMeasure()
    expect(measure('Brake', sans(8, 600))).toBeCloseTo(5 * 8 * 0.55)
    expect(measured).toEqual([`${cssFont('sans', 600, 100)}|Brake`])
    expect(cssFont('sans', 600, 100)).toMatch(/^600 100px 'Geist Variable', /)
    expect(measure('#124', { family: 'mono', size: 7, weight: 400 })).toBeCloseTo(4 * 7 * 0.6)
  })

  it('caches by family, weight and text, whatever the size', () => {
    stubDocument()
    const measure = createMeasure()
    measure('Chassis', sans(8))
    measure('Chassis', sans(16))
    expect(measured).toHaveLength(1)
    measure('Chassis', sans(8, 600))
    measure('Chassis', { family: 'mono', size: 8, weight: 400 })
    expect(measured).toHaveLength(3)
    // A new measure (after fonts load) starts a new cache.
    createMeasure()('Chassis', sans(8))
    expect(measured).toHaveLength(4)
  })

  it('gives 0 for no text without measuring', () => {
    stubDocument()
    expect(createMeasure()('', sans(8))).toBe(0)
    expect(measured).toEqual([])
  })
})

describe('ensureFonts', () => {
  it('loads each family for the export’s text, then waits for every font still loading', async () => {
    const loads: [string, string][] = []
    let waited = false
    const fonts: FakeFonts = {
      load: (font, text) => {
        loads.push([font, text])
        return Promise.resolve([])
      },
      get ready() {
        waited = true
        return Promise.resolve(fonts)
      },
    }
    stubDocument(fonts)
    await ensureFonts('Ячейка Thiết')
    expect(loads).toEqual([
      [cssFont('sans', 400, 16), 'Ячейка Thiết'],
      [cssFont('mono', 400, 16), 'Ячейка Thiết'],
    ])
    expect(waited).toBe(true)
  })

  it('never fails: fallback fonts stand in for faces that cannot load', async () => {
    stubDocument({
      load: () => Promise.reject(new Error('offline')),
      get ready() {
        return Promise.reject(new Error('offline'))
      },
    })
    await expect(ensureFonts('Brake')).resolves.toBeUndefined()
    stubDocument()
    await expect(ensureFonts('Brake')).resolves.toBeUndefined()
    vi.stubGlobal('document', undefined)
    await expect(ensureFonts('Brake')).resolves.toBeUndefined()
  })

  it('asks for a space when there is no text yet', async () => {
    const texts: string[] = []
    stubDocument({ load: (_font, text) => Promise.resolve(void texts.push(text)), ready: Promise.resolve() })
    await ensureFonts('')
    expect(texts).toEqual([' ', ' '])
  })
})
