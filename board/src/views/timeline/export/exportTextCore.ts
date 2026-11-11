// The smallest pieces of the Timeline export's text: making user text safe to draw, splitting it into
// graphemes, and the 3% slack every fit is measured with. They live apart from exportText.ts so that
// exportPeriod.ts, which exportText.ts needs for its dates, can use them too without the two importing each
// other. exportText.ts re-exports cleanText and splitGraphemes, so callers keep importing them from there.

import type { FontSpec, Measure } from './scene'

/**
 * Every fit counts a width as width × 1.03: text is measured on a canvas but drawn by SVG, the print engine
 * and fallback fonts, which can come out a little wider.
 */
export const SLACK = 1.03

/** True when `text` set in `font` fits `maxWidth` points, with the slack. */
export function fitsWidth(text: string, maxWidth: number, font: FontSpec, measure: Measure): boolean {
  // The tiny allowance stops rounding in the multiplication from refusing an exact fit.
  return measure(text, font) * SLACK <= maxWidth + 1e-9
}

/** A segmenter, or null in the few browsers without Intl.Segmenter (Firefox before 125). */
export function newSegmenter(granularity: 'grapheme' | 'word'): Intl.Segmenter | null {
  try {
    return typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('en', { granularity }) : null
  } catch {
    return null
  }
}

const graphemes = newSegmenter('grapheme')

/** A high or low surrogate on its own (with the u flag, a proper pair is one code point and never matches). */
const LONE_SURROGATE = /[\ud800-\udfff]/gu
/** Bidi embedding, override and isolate characters, which could reorder the rest of a line, and the
 *  byte-order mark, which is invisible (as a space it would show a gap the board doesn't). */
const INVISIBLE = /[\u202a-\u202e\u2066-\u2069\ufeff]/gu
/** Tabs, line breaks and every other kind of space, including NEL (U+0085), which \s leaves out. */
const ANY_SPACE = /[\s\u0085]/gu
const CONTROL = /\p{Cc}/gu

/**
 * User text exactly as typed, made safe to draw: runs of whitespace become one space, the ends are trimmed,
 * and control characters, bidi embedding/override/isolate characters (U+202A–202E, U+2066–2069) and
 * unpaired surrogates are removed. Never interpreted as HTML or Markdown.
 */
export function cleanText(text: string): string {
  // Spaces first, so a line break still parts two words; then the other control characters, so one
  // between two spaces can't leave a double space behind.
  return text
    .replace(LONE_SURROGATE, '')
    .replace(INVISIBLE, '')
    .replace(ANY_SPACE, ' ')
    .replace(CONTROL, '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** Grapheme clusters (Intl.Segmenter), falling back to code points, so emoji and accents stay whole. */
export function splitGraphemes(text: string): string[] {
  return graphemes ? Array.from(graphemes.segment(text), (part) => part.segment) : splitCodePoints(text)
}

/** Kept with the code point before them: combining marks (variation selectors are marks too), the
 *  zero-width joiner, skin tones and the tag characters of flags such as Scotland's. */
const EXTEND = /[\u200d\p{M}\p{Emoji_Modifier}\u{e0020}-\u{e007f}]/u
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u

/**
 * The fallback for splitGraphemes: code points, with the commonest clusters kept whole (a letter and its
 * accents, emoji joined by ZWJ, skin tones, keycaps and flags), so a cut never strands an accent or half an
 * emoji even without Intl.Segmenter.
 */
export function splitCodePoints(text: string): string[] {
  const parts: string[] = []
  let afterJoiner = false
  // The last part is a lone regional indicator, waiting for the second half of its flag.
  let halfFlag = false
  for (const char of text) {
    const regional = REGIONAL_INDICATOR.test(char)
    if (parts.length > 0 && (afterJoiner || EXTEND.test(char) || (regional && halfFlag))) {
      parts[parts.length - 1] += char
      halfFlag = false
    } else {
      parts.push(char)
      halfFlag = regional
    }
    afterJoiner = char === '\u200d'
  }
  return parts
}
