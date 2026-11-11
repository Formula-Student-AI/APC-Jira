import { describe, expect, it } from 'vitest'
import rawCss from '../../../styles/global.css?raw'
import { INK, inkFor, NEUTRAL, OPTION_INK, WHOLE_TEAM_INK } from './exportPalette'

// Vitest empties every .css import, ?raw ones too, unless its css option takes the file in (checked with
// Vitest 5.1), so when the import comes back empty the stylesheet is read through Node's own fs instead.
// That is fetched with process.getBuiltinModule rather than imported, because the tests are type-checked
// with only the vite/client types.
function stylesheet(): string {
  if (rawCss) return rawCss
  const node = (globalThis as unknown as { process?: { getBuiltinModule?: (id: string) => unknown } }).process
  const fs = node?.getBuiltinModule?.('fs') as { readFileSync: (path: URL, encoding: 'utf8') => string } | undefined
  if (!fs) throw new Error('styles/global.css could not be read')
  return fs.readFileSync(new URL('../../../styles/global.css', import.meta.url), 'utf8')
}

/** Each light .opt-* rule's --opt-solid and --opt-fg, by option colour (the dark rules start [data-theme='dark']). */
function lightOptionRules(css: string): Map<string, { solid: string; fg: string }> {
  const rules = new Map<string, { solid: string; fg: string }>()
  for (const [, name, body] of css.matchAll(/^\.opt-([a-z]+)\s*\{([^}]*)\}/gm)) {
    const solid = /--opt-solid:\s*(#[0-9a-f]{6})\b/i.exec(body)?.[1]
    const fg = /--opt-fg:\s*(#[0-9a-f]{6})\b/i.exec(body)?.[1]
    if (solid && fg) rules.set(name.toUpperCase(), { solid: solid.toLowerCase(), fg: fg.toLowerCase() })
  }
  return rules
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** WCAG 2 contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = channels(hex).map((c) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('exportPalette', () => {
  const rules = lightOptionRules(stylesheet())

  it('has a colour for every option colour in global.css, and no others', () => {
    expect([...rules.keys()].sort()).toEqual(Object.keys(OPTION_INK).sort())
  })

  it("takes each subteam colour's solid and ink from global.css's light .opt-* rules", () => {
    for (const [color, ink] of Object.entries(OPTION_INK)) {
      expect({ solid: ink.solid, ink: ink.ink }, color).toEqual({ solid: rules.get(color)?.solid, ink: rules.get(color)?.fg })
    }
  })

  it('makes each tint its solid at 30% on white, within 1 per channel', () => {
    for (const [color, ink] of Object.entries(OPTION_INK)) {
      const tint = channels(ink.tint)
      channels(ink.solid).forEach((value, i) => {
        expect(Math.abs(tint[i] - (255 - 0.3 * (255 - value))), `${color} ${ink.tint} channel ${i}`).toBeLessThanOrEqual(1)
      })
    }
  })

  it('keeps text at least 4.5:1 on white, the stripes and the group bands', () => {
    const texts = [INK.text, INK.muted, INK.subtle, INK.navy, INK.brand, INK.problemText, INK.amberText]
    // Inks are coloured text as well as outlines, so they are held to the text rule too.
    const inks = Object.values(OPTION_INK).map((ink) => ink.ink)
    for (const colour of [...texts, ...inks]) {
      for (const ground of [INK.white, NEUTRAL.zebra, NEUTRAL.groupBand]) {
        expect(contrast(colour, ground), `${colour} on ${ground}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('writes every colour as lower-case #rrggbb, the same in SVG and canvas', () => {
    const colours = [...Object.values(INK), ...Object.values(NEUTRAL), ...[...Object.values(OPTION_INK), WHOLE_TEAM_INK].flatMap(Object.values)]
    for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('draws whole-team items in navy and subteams in their own colour', () => {
    expect(inkFor(null)).toEqual({ solid: INK.navy, tint: NEUTRAL.wholeTeamTint, ink: INK.navy })
    expect(inkFor('BLUE')).toBe(OPTION_INK.BLUE)
  })
})
