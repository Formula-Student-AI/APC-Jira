// The export's fixed print colours. Pages are always white, whatever the app's theme, so they never use
// the theme's CSS tokens. Colour means subteam and nothing else; status is shown by fill, pattern, shape
// and words. Each subteam colour has a solid, a 30% tint on white and a dark ink for outlines and text.
// The solid and ink values are global.css's light .opt-* values (exportPalette.test.ts keeps them in step).

import type { OptionColor } from '../../../types'
import type { Hex } from './scene'

export const INK = {
  /** Body text, muted text and subtle text (subtle only at 7 pt and up) */
  text: '#172b4d',
  muted: '#44546f',
  subtle: '#626f86',
  /** Sampled from the logo: the title, group names, whole-team key dates and phases */
  navy: '#160035',
  /** Bristol FSAI red: only the rule under the title and the as-of line */
  brand: '#ab1f2d',
  /** Problems only (Blocked, Overdue, clashes): marks and text */
  problem: '#c9372c',
  problemText: '#ae2e24',
  /** At risk only: marks and text */
  amber: '#e56910',
  amberText: '#a54800',
  white: '#ffffff',
} as const

export const NEUTRAL = {
  /** Alternate task rows, group header bands, time before the as-of date in the timescale */
  zebra: '#f7f8f9',
  groupBand: '#f1f2f4',
  elapsed: '#eef0f3',
  /** Month lines (0.5 pt), week lines (0.25 pt), year lines and the grid/chart divider (0.75 pt) */
  month: '#dcdfe4',
  week: '#ebecf0',
  year: '#b3b9c4',
  /** Rules above the legend and footer (0.5 pt) */
  rule: '#dcdfe4',
  /** Whole-team phases */
  wholeTeamTint: '#e3e0e7',
  /** Muted grey used for legend samples of states, so they don't suggest a subteam */
  sample: '#8590a2',
  sampleTint: '#dadee3',
  sampleInk: '#44546f',
} as const

export interface SubteamInk {
  /** Done bars, summary bars, diamonds, swatches */
  solid: Hex
  /** In-progress bars, phase segments (30% of the solid on white) */
  tint: Hex
  /** Outlines and coloured text */
  ink: Hex
}

export const OPTION_INK: Record<OptionColor, SubteamInk> = {
  BLUE: { solid: '#1d7afc', tint: '#bbd7fe', ink: '#0055cc' },
  PURPLE: { solid: '#8270db', tint: '#d9d4f4', ink: '#5e4db2' },
  GREEN: { solid: '#22a06b', tint: '#bde2d2', ink: '#216e4e' },
  RED: { solid: '#e2483d', tint: '#f6c8c5', ink: '#ae2e24' },
  ORANGE: { solid: '#f38a3f', tint: '#fbdcc5', ink: '#a54800' },
  YELLOW: { solid: '#e2b203', tint: '#f6e8b3', ink: '#7f5f01' },
  PINK: { solid: '#cd519d', tint: '#f0cbe2', ink: '#943d73' },
  GRAY: { solid: '#8590a2', tint: '#dadee3', ink: '#44546f' },
}

/** Whole-team items (no subteam) are navy. */
export const WHOLE_TEAM_INK: SubteamInk = { solid: INK.navy, tint: NEUTRAL.wholeTeamTint, ink: INK.navy }

/** The colours for a subteam's colour, or the whole team's for null. A colour the palette doesn't know (from an
 *  older or newer database) is drawn grey rather than breaking the export. */
export function inkFor(color: OptionColor | null): SubteamInk {
  if (!color) return WHOLE_TEAM_INK
  return Object.prototype.hasOwnProperty.call(OPTION_INK, color) ? OPTION_INK[color] : OPTION_INK.GRAY
}
