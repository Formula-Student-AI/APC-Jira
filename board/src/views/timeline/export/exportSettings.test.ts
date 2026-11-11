// Remembered export settings come back from localStorage, which anyone (or an older version of the app) may
// have filled with anything: whatever is missing, of the wrong type, unknown or too long falls back to the
// default, field by field, and the note is never remembered.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLAN_LABEL } from '../../../config'
import {
  defaultSettings,
  loadSettings,
  parseSettings,
  PREPARED_BY_MAX,
  saveSettings,
  SETTINGS_KEY,
  TITLE_MAX,
  type ExportSettings,
} from './exportSettings'

const custom: ExportSettings = {
  version: 1,
  format: 'png',
  paper: 'a3',
  pdf: { rows: 'summary', columns: { number: false, owner: true, dates: false, status: true } },
  png: { rows: 'tasks', columns: { number: true, owner: false, dates: true, status: false } },
  period: { preset: 'months', from: '2026-10', to: '2027-03' },
  subtasks: true,
  undated: true,
  links: true,
  title: 'Sponsor update, November',
  preparedBy: 'Chassis team',
}

/** Stored settings with some fields replaced (or removed, with undefined). */
const stored = (patch: Record<string, unknown>) => ({ ...custom, ...patch })

describe('defaultSettings', () => {
  it('gives a sponsor-ready A4 PDF and a one-slide summary image', () => {
    const d = defaultSettings()
    expect(d).toEqual({
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
    })
  })

  it('is a fresh object each time, so changing one never changes the next', () => {
    const first = defaultSettings()
    first.pdf.columns.owner = false
    expect(defaultSettings().pdf.columns.owner).toBe(true)
  })
})

describe('parseSettings', () => {
  it('reads back what was saved', () => {
    expect(parseSettings(JSON.parse(JSON.stringify(custom)))).toEqual(custom)
    expect(parseSettings(defaultSettings())).toEqual(defaultSettings())
  })

  it('falls back to the defaults for anything that is not a settings object', () => {
    for (const raw of [undefined, null, 'pdf', 42, true, [], [custom], () => custom]) {
      expect(parseSettings(raw)).toEqual(defaultSettings())
    }
  })

  it('falls back to the defaults for another version, or none', () => {
    expect(parseSettings(stored({ version: 2 }))).toEqual(defaultSettings())
    expect(parseSettings(stored({ version: '1' }))).toEqual(defaultSettings())
    expect(parseSettings(stored({ version: undefined }))).toEqual(defaultSettings())
    expect(parseSettings({})).toEqual(defaultSettings())
  })

  it('replaces unknown values field by field, keeping the rest', () => {
    const d = defaultSettings()
    const parsed = parseSettings(stored({ format: 'svg', paper: 'letter', subtasks: 'yes', undated: 1, links: null }))
    expect(parsed.format).toBe(d.format)
    expect(parsed.paper).toBe(d.paper)
    expect(parsed.subtasks).toBe(d.subtasks)
    expect(parsed.undated).toBe(d.undated)
    expect(parsed.links).toBe(d.links)
    // Untouched fields keep their stored values.
    expect(parsed.title).toBe(custom.title)
    expect(parsed.pdf).toEqual(custom.pdf)
    expect(parsed.period).toEqual(custom.period)
  })

  it('checks rows and columns for each format on their own', () => {
    const d = defaultSettings()
    expect(parseSettings(stored({ pdf: 'tasks', png: [] }))).toMatchObject({ pdf: d.pdf, png: d.png })
    expect(parseSettings(stored({ pdf: { rows: 'everything', columns: custom.pdf.columns } })).pdf).toEqual({
      rows: d.pdf.rows,
      columns: custom.pdf.columns,
    })
    // A column that isn't true or false takes that format's default; the others are kept.
    const columns = { number: 'yes', owner: 0, dates: true, status: null }
    expect(parseSettings(stored({ png: { rows: 'tasks', columns } })).png).toEqual({
      rows: 'tasks',
      columns: { number: d.png.columns.number, owner: d.png.columns.owner, dates: true, status: d.png.columns.status },
    })
    expect(parseSettings(stored({ pdf: { rows: 'summary', columns: null } })).pdf).toEqual({ rows: 'summary', columns: d.pdf.columns })
    // Extra keys are dropped.
    const parsed = parseSettings(stored({ pdf: { rows: 'tasks', columns: { ...custom.pdf.columns, priority: true }, zoom: 2 } }))
    expect(parsed.pdf).toEqual({ rows: 'tasks', columns: custom.pdf.columns })
  })

  it('keeps the presets and falls back to the whole plan for unknown ones', () => {
    for (const preset of ['plan', 'next3', 'next6'] as const) {
      expect(parseSettings(stored({ period: { preset } })).period).toEqual({ preset })
    }
    // Months on a preset that doesn't use them are dropped.
    expect(parseSettings(stored({ period: { preset: 'next3', from: '2026-01', to: '2026-02' } })).period).toEqual({ preset: 'next3' })
    for (const period of [{ preset: 'year' }, { preset: 'Next3' }, {}, 'plan', null, []]) {
      expect(parseSettings(stored({ period })).period).toEqual({ preset: 'plan' })
    }
  })

  it('keeps chosen months only when they are real months in order', () => {
    const months = (from: unknown, to: unknown) => parseSettings(stored({ period: { preset: 'months', from, to } })).period
    expect(months('2026-09', '2027-08')).toEqual({ preset: 'months', from: '2026-09', to: '2027-08' })
    expect(months('2026-11', '2026-11')).toEqual({ preset: 'months', from: '2026-11', to: '2026-11' })
    // The wrong way round.
    expect(months('2027-03', '2026-10')).toEqual({ preset: 'plan' })
    expect(months('2026-12', '2026-01')).toEqual({ preset: 'plan' })
    // Not 'YYYY-MM' months.
    for (const [from, to] of [
      ['2026-13', '2027-01'],
      ['2026-00', '2026-05'],
      ['2026-1', '2026-02'],
      ['26-01', '26-02'],
      ['2026-09-01', '2026-10'],
      [202609, 202610],
      [null, '2026-10'],
      ['2026-09', undefined],
    ]) {
      expect(months(from, to)).toEqual({ preset: 'plan' })
    }
  })

  it('cuts over-long text to its limit and trims the title', () => {
    const long = 'Chassis design review and sign-off, then manufacturing '.repeat(4)
    const parsed = parseSettings(stored({ title: long, preparedBy: long }))
    expect(parsed.title).toBe(long.slice(0, TITLE_MAX).trim())
    expect(parsed.title.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(parsed.preparedBy).toBe(long.slice(0, PREPARED_BY_MAX))
    expect(parseSettings(stored({ title: '  Sponsor pack  ' })).title).toBe('Sponsor pack')
  })

  it('gives the plan label for a blank or missing title', () => {
    for (const title of ['', '   ', ' '.repeat(TITLE_MAX + 10) + 'too late', undefined, null, 42, ['Plan']]) {
      expect(parseSettings(stored({ title })).title).toBe(PLAN_LABEL)
    }
  })

  it('keeps Prepared by as typed, empty (the line left out) or null (your own name)', () => {
    expect(parseSettings(stored({ preparedBy: '' })).preparedBy).toBe('')
    expect(parseSettings(stored({ preparedBy: null })).preparedBy).toBeNull()
    expect(parseSettings(stored({ preparedBy: 'Jane Smith' })).preparedBy).toBe('Jane Smith')
    // Not text: your own name again.
    for (const preparedBy of [undefined, 42, false, { name: 'Jane' }]) {
      expect(parseSettings(stored({ preparedBy })).preparedBy).toBeNull()
    }
  })

  it('never brings back a note, or anything else it does not know', () => {
    const parsed = parseSettings(stored({ note: 'Chassis dates moved two weeks.', zoom: 'fit', teams: ['Mechanical'] }))
    expect(parsed).toEqual(custom)
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(defaultSettings()).sort())
  })
})

describe('loadSettings and saveSettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** A localStorage holding `entries`, recording what is written. */
  function fakeStorage(entries: Record<string, string> = {}) {
    const data = new Map(Object.entries(entries))
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    }
    vi.stubGlobal('localStorage', storage as unknown as Storage)
    return data
  }

  it('saves under its own key and reads the same settings back', () => {
    const data = fakeStorage()
    saveSettings(custom)
    expect([...data.keys()]).toEqual([SETTINGS_KEY])
    expect(SETTINGS_KEY).toBe('fsai-board:timeline-export')
    expect(loadSettings()).toEqual(custom)
  })

  it('gives the defaults when nothing is stored, or what is stored is not JSON', () => {
    fakeStorage()
    expect(loadSettings()).toEqual(defaultSettings())
    for (const text of ['{"version":1,', 'undefined', '', 'pdf']) {
      fakeStorage({ [SETTINGS_KEY]: text })
      expect(loadSettings()).toEqual(defaultSettings())
    }
  })

  it('checks stored JSON as parseSettings does', () => {
    fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ ...custom, format: 'svg', period: { preset: 'months', from: '2027-05', to: '2027-01' } }) })
    expect(loadSettings()).toEqual({ ...custom, format: 'pdf', period: { preset: 'plan' } })
    fakeStorage({ [SETTINGS_KEY]: 'null' })
    expect(loadSettings()).toEqual(defaultSettings())
  })

  it('carries on when storage is blocked (private mode) or missing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    } as unknown as Storage)
    expect(loadSettings()).toEqual(defaultSettings())
    expect(() => saveSettings(custom)).not.toThrow()
    vi.stubGlobal('localStorage', undefined)
    expect(loadSettings()).toEqual(defaultSettings())
    expect(() => saveSettings(custom)).not.toThrow()
  })
})
