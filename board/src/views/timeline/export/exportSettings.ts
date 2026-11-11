// The Timeline export's options, remembered on this device (like the Timeline's zoom) so a monthly export
// is two clicks. The note is never remembered, so last month's note can't go out again by mistake.

import { PLAN_LABEL } from '../../../config'

export type ExportFormat = 'pdf' | 'png'
export type Paper = 'a4' | 'a3' | 'a2'
/** Every task, or a summary: each subteam with one row per domain under it */
export type RowsMode = 'tasks' | 'summary'

/** 'YYYY-MM' */
export type MonthValue = string

export type PeriodChoice =
  | { preset: 'plan' }
  | { preset: 'next3' }
  | { preset: 'next6' }
  | { preset: 'months'; from: MonthValue; to: MonthValue }

export interface ColumnChoice {
  number: boolean
  owner: boolean
  dates: boolean
  status: boolean
}

/** Rows and columns are chosen separately for each format (a slide needs the width for its bars). */
export interface FormatSettings {
  rows: RowsMode
  columns: ColumnChoice
}

export interface ExportSettings {
  version: 1
  format: ExportFormat
  paper: Paper
  pdf: FormatSettings
  png: FormatSettings
  period: PeriodChoice
  /** Subtasks as rows under their task (every-task mode only) */
  subtasks: boolean
  /** Tasks without dates, listed last (PDF, every-task mode only) */
  undated: boolean
  /** Dependency lines between tasks (every-task mode only) */
  links: boolean
  /** Up to 80 characters */
  title: string
  /** Up to 60 characters; null means the signed-in member's full name, '' leaves the line out */
  preparedBy: string | null
}

export const SETTINGS_KEY = 'fsai-board:timeline-export'
export const TITLE_MAX = 80
export const NOTE_MAX = 140
export const PREPARED_BY_MAX = 60

export function defaultSettings(): ExportSettings {
  return {
    version: 1,
    format: 'pdf',
    paper: 'a4',
    pdf: { rows: 'tasks', columns: { number: true, owner: true, dates: true, status: true } },
    png: { rows: 'summary', columns: { number: false, owner: false, dates: false, status: true } },
    period: { preset: 'plan' },
    subtasks: false,
    undated: false,
    links: false,
    title: PLAN_LABEL,
    preparedBy: null,
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isMonth = (value: unknown): value is MonthValue => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

function parseColumns(raw: unknown, fallback: ColumnChoice): ColumnChoice {
  if (!isObject(raw)) return fallback
  const pick = (key: keyof ColumnChoice) => (typeof raw[key] === 'boolean' ? (raw[key] as boolean) : fallback[key])
  return { number: pick('number'), owner: pick('owner'), dates: pick('dates'), status: pick('status') }
}

function parseFormat(raw: unknown, fallback: FormatSettings): FormatSettings {
  if (!isObject(raw)) return fallback
  return {
    rows: raw.rows === 'tasks' || raw.rows === 'summary' ? raw.rows : fallback.rows,
    columns: parseColumns(raw.columns, fallback.columns),
  }
}

function parsePeriod(raw: unknown, fallback: PeriodChoice): PeriodChoice {
  if (!isObject(raw)) return fallback
  if (raw.preset === 'plan' || raw.preset === 'next3' || raw.preset === 'next6') return { preset: raw.preset }
  if (raw.preset === 'months' && isMonth(raw.from) && isMonth(raw.to) && raw.from <= raw.to) {
    return { preset: 'months', from: raw.from, to: raw.to }
  }
  return fallback
}

/** Text cut to `max` characters by code point, so an emoji at the limit is never split in half. */
const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' ? Array.from(value).slice(0, max).join('') : null

/** Settings read back from storage: anything missing, of the wrong type or unknown falls back to the default. */
export function parseSettings(raw: unknown): ExportSettings {
  const d = defaultSettings()
  if (!isObject(raw) || raw.version !== 1) return d
  return {
    version: 1,
    format: raw.format === 'pdf' || raw.format === 'png' ? raw.format : d.format,
    paper: raw.paper === 'a4' || raw.paper === 'a3' || raw.paper === 'a2' ? raw.paper : d.paper,
    pdf: parseFormat(raw.pdf, d.pdf),
    png: parseFormat(raw.png, d.png),
    period: parsePeriod(raw.period, d.period),
    subtasks: typeof raw.subtasks === 'boolean' ? raw.subtasks : d.subtasks,
    undated: typeof raw.undated === 'boolean' ? raw.undated : d.undated,
    links: typeof raw.links === 'boolean' ? raw.links : d.links,
    title: text(raw.title, TITLE_MAX)?.trim() || d.title,
    preparedBy: raw.preparedBy === null ? null : (text(raw.preparedBy, PREPARED_BY_MAX) ?? d.preparedBy),
  }
}

export function loadSettings(): ExportSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    return stored ? parseSettings(JSON.parse(stored)) : defaultSettings()
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(settings: ExportSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // not remembered in private mode
  }
}
