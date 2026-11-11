// Sample plans for the layout's tests, built by hand (buildPlan has tests of its own): a small board with
// every state a task, key date or phase can be in, long plans, a summary by domain, and odd data. Also the
// spec's fake measure, so text widths are the same on every machine.

import { addDays } from 'date-fns'
import { parseDay, toDay } from '../../../lib/format'
import type { OptionColor } from '../../../types'
import type {
  DateSpan,
  Flags,
  GroupCounts,
  Plan,
  PlanCounts,
  PlanGroup,
  PlanKeyDate,
  PlanPhase,
  PlanRow,
  PlanSummaryRow,
  PlanTaskRow,
  TaskStage,
  TaskWord,
} from './planTypes'
import type { Measure } from './scene'

/** The spec's fake measure: every code point is 0.55 of the font size wide (0.6 in mono). */
export const fakeMeasure: Measure = (text, font) => [...text].length * font.size * (font.family === 'mono' ? 0.6 : 0.55)

export const PLAN_YEAR = { first: '2026-09-01', last: '2027-08-31' }
export const AS_OF = '2026-11-10'

const flagsFor = (word: TaskWord): Flags => ({
  blocked: word === 'Blocked',
  overdue: word === 'Overdue',
  atRisk: word === 'At risk',
})

/** The stage behind a word, as buildPlan would have it for a task under way (pass `stage` to say otherwise). */
const stageFor = (word: TaskWord): TaskStage =>
  word === 'Done' || word === 'Blocked' || word === 'Not started' ? word : 'In progress'

export function task(number: number, title: string, start: string | null, due: string | null, extra: Partial<PlanTaskRow> = {}): PlanTaskRow {
  const word = extra.word ?? 'In progress'
  return {
    stage: stageFor(word),
    kind: 'task',
    id: `t${number}`,
    number,
    title,
    nested: false,
    partOf: null,
    progress: null,
    start,
    due,
    word,
    flags: flagsFor(word),
    owner: 'Jane Smith',
    color: null,
    ...extra,
  }
}

/** Counts over task rows that aren't nested subtasks, as buildPlan makes them. */
export function countsOf(rows: readonly PlanRow[]): GroupCounts & Pick<PlanCounts, 'inProgress' | 'notStarted'> {
  const tasks = rows.filter((row): row is PlanTaskRow => row.kind === 'task' && !row.nested)
  return {
    tasks: tasks.length,
    done: tasks.filter((row) => row.word === 'Done').length,
    blocked: tasks.filter((row) => row.word === 'Blocked').length,
    overdue: tasks.filter((row) => row.flags.overdue).length,
    atRisk: tasks.filter((row) => row.flags.atRisk).length,
    inProgress: tasks.filter((row) => row.word === 'In progress').length,
    notStarted: tasks.filter((row) => row.word === 'Not started').length,
  }
}

/** A group of rows in one colour, with its counts and summary span worked out from them. */
export function group(key: string, name: string, color: OptionColor | null, rows: PlanRow[], extra: Partial<PlanGroup> = {}): PlanGroup {
  const coloured = rows.map((row) => ({ ...row, color }))
  const days = coloured.flatMap((row) => (row.kind === 'task' ? [row.start, row.due] : [row.first, row.last])).filter((day): day is string => !!day)
  const { tasks, done, blocked, overdue, atRisk } = countsOf(coloured)
  return {
    key,
    name,
    color,
    lead: '',
    counts: { tasks, done, blocked, overdue, atRisk },
    span: days.length ? { start: days.reduce((a, b) => (a < b ? a : b)), end: days.reduce((a, b) => (a > b ? a : b)) } : null,
    rows: coloured,
    undated: false,
    ...extra,
  }
}

/** A plan of `groups` with the counts, the legend's subteams and the rest filled in. */
export function makePlan(groups: PlanGroup[], extra: Partial<Plan> = {}): Plan {
  const { tasks, done, blocked, overdue, atRisk, inProgress, notStarted } = countsOf(groups.filter((g) => !g.undated).flatMap((g) => g.rows))
  const subteams = groups.flatMap((g) => (g.color && !g.undated ? [{ name: g.name, color: g.color }] : []))
  return {
    format: 'pdf',
    mode: 'tasks',
    org: 'Bristol Formula Student AI',
    orgShort: 'Bristol FSAI',
    title: '2026–27 Plan',
    subtitle: 'Timeline · All subteams · Sep 2026 – Aug 2027',
    asOf: AS_OF,
    // No time zone, so the footer reads 14:32 wherever the tests run.
    exportedAt: '2026-11-10T14:32:00',
    preparedBy: 'Jane Smith',
    note: '',
    period: PLAN_YEAR,
    columns: { number: true, owner: true, dates: true, status: true },
    links: false,
    groups,
    keyDates: [],
    nextKeyDate: null,
    afterPeriod: null,
    phases: [],
    subteams,
    counts: { tasks, done, inProgress, notStarted, blocked, overdue, atRisk },
    leftOut: { outsidePeriod: 0, undated: 0, rolledUp: 0, archived: 0, keyDatesOutside: 0, phasesOutside: 0 },
    notices: [],
    dependencies: [],
    scope: { subteams: [], filtered: false, query: '' },
    ...extra,
  }
}

const keyDate = (number: number, title: string, date: string, color: OptionColor | null, state: PlanKeyDate['state']): PlanKeyDate => ({
  id: `k${number}`,
  number,
  title,
  date,
  color,
  state,
})

const phase = (number: number, title: string, start: string, end: string, color: OptionColor | null, state: PlanPhase['state']): PlanPhase => ({
  id: `p${number}`,
  number,
  title,
  start,
  end,
  color,
  state,
})

const DESIGN_FREEZE = keyDate(901, 'Design freeze', '2026-12-15', null, 'upcoming')

/** A small board with every state: done, part done, a subtask, overdue, wrapping, blocked, at risk, cut off by
 *  the period, a subtask shown without its parent, whole-team tasks, key dates in every state and phases. */
export function samplePlan(extra: Partial<Plan> = {}): Plan {
  const mechanical = group(
    'mech',
    'Mechanical',
    'BLUE',
    [
      task(101, 'Chassis concept and frame layout', '2026-09-07', '2026-10-16', { word: 'Done' }),
      task(102, 'Suspension geometry review', '2026-10-05', '2026-11-27', { progress: { done: 3, total: 5 }, owner: 'Alexandra Smith +2' }),
      task(110, 'Upright FEA', '2026-10-05', '2026-10-30', { nested: true, word: 'Done', owner: 'Sam Lee' }),
      task(103, 'Brake pedal box', '2026-10-01', '2026-11-02', { word: 'Overdue', owner: 'Priya Patel' }),
      task(105, 'Wheel assembly drawings for the 2027 car, with uprights, hubs and bearing selection', '2026-11-02', '2026-12-18'),
      task(104, 'Steering rack mounting', '2026-11-16', '2027-01-22', { word: 'Not started' }),
      task(120, 'Damper selection', '2026-12-01', '2027-01-15', { word: 'Not started', partOf: 'Suspension package for the 2027 car' }),
    ],
    { lead: 'Jane Smith' },
  )
  const electrical = group(
    'elec',
    'Electrical',
    'YELLOW',
    [
      task(203, 'BMS firmware', '2026-10-15', '2026-12-10', { owner: '' }),
      task(201, 'Accumulator enclosure', '2027-01-12', '2027-03-03', { word: 'Blocked', flags: { blocked: true, overdue: false, atRisk: false } }),
      task(202, 'Wiring loom', '2027-07-20', '2027-09-30', { word: 'At risk' }),
    ],
    { lead: 'Tom Brown +1' },
  )
  const autonomy = group('auto', 'Autonomy', 'PURPLE', [
    task(301, 'Perception pipeline', '2026-08-10', '2026-10-30', { word: 'Done' }),
    task(302, 'Path planning', '2026-11-01', '2027-02-26', { word: 'Not started' }),
    task(303, 'Sensor calibration', null, '2027-03-15', { word: 'Not started' }),
  ])
  const wholeTeam = group('none', 'Whole team', null, [task(401, 'Sponsor report', '2026-12-01', '2026-12-05', { word: 'At risk', owner: 'Chris Wong' })])
  return makePlan([mechanical, electrical, autonomy, wholeTeam], {
    keyDates: [
      keyDate(902, 'Kick-off', '2026-09-07', null, 'done'),
      keyDate(903, 'Brake test', '2026-11-01', 'BLUE', 'overdue'),
      DESIGN_FREEZE,
      keyDate(904, 'Battery sign-off', '2027-03-20', 'YELLOW', 'atRisk'),
      keyDate(905, 'FS UK competition', '2027-07-15', null, 'upcoming'),
    ],
    nextKeyDate: DESIGN_FREEZE,
    afterPeriod: keyDate(906, 'FS UK 2028 entry', '2027-10-01', null, 'upcoming'),
    phases: [
      phase(801, 'Concept', '2026-09-01', '2026-10-31', null, 'finished'),
      phase(802, 'Detailed design', '2026-11-01', '2027-01-31', null, 'now'),
      phase(805, 'Electrical bring-up', '2027-01-15', '2027-03-31', 'YELLOW', 'upcoming'),
      phase(803, 'Manufacture', '2027-02-01', '2027-05-31', null, 'upcoming'),
      phase(804, 'Testing', '2027-06-01', '2027-08-31', null, 'upcoming'),
    ],
    dependencies: [
      { from: 103, to: 104, clash: false },
      { from: 105, to: 302, clash: true },
      { from: 201, to: 202, clash: false },
    ],
    ...extra,
  })
}

/** A small generator, so the long plans are the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const COLOURS: OptionColor[] = ['BLUE', 'YELLOW', 'PURPLE', 'GREEN', 'RED', 'ORANGE', 'PINK', 'GRAY']
const NAMES = ['Mechanical', 'Electrical', 'Autonomy', 'Powertrain', 'Braking System', 'Admin', 'Business', 'Software']
const WORDS: TaskWord[] = ['Not started', 'In progress', 'Done', 'Blocked', 'Overdue', 'At risk']
const TITLE_WORDS = ['Chassis', 'design', 'review', 'and', 'sign-off', 'for', 'the', 'brake', 'pedal', 'box', 'wiring', 'loom', 'battery', 'test', 'rig']

const later = (day: string, days: number) => toDay(addDays(parseDay(day) ?? new Date(2026, 8, 1), days))

/** `count` tasks spread over `groups` subteams through the plan year, in every state, some with long titles
 *  that wrap, every fifth with a dependency on the task before it. */
export function longPlan(count: number, options: { groups?: number; seed?: number; links?: boolean } = {}): Plan {
  const next = random(options.seed ?? 1)
  const groupCount = Math.max(1, Math.min(COLOURS.length, options.groups ?? 5))
  const rows: PlanTaskRow[][] = Array.from({ length: groupCount }, () => [])
  const dependencies: Plan['dependencies'] = []
  for (let i = 0; i < count; i++) {
    const g = Math.floor(next() * groupCount)
    const start = later(PLAN_YEAR.first, Math.floor(next() * 330))
    const due = later(start, 3 + Math.floor(next() * 60))
    const words = 2 + Math.floor(next() * (next() < 0.2 ? 14 : 5))
    const title = Array.from({ length: words }, () => TITLE_WORDS[Math.floor(next() * TITLE_WORDS.length)]).join(' ')
    const word = WORDS[Math.floor(next() * WORDS.length)]
    rows[g].push(task(1000 + i, `${title.charAt(0).toUpperCase()}${title.slice(1)}`, start, due, { word, owner: next() < 0.2 ? '' : 'Jane Smith +1' }))
    if (i % 5 === 4) dependencies.push({ from: 999 + i, to: 1000 + i, clash: next() < 0.3 })
  }
  const groups = rows.flatMap((list, g) => {
    // Within a group, rows go by start date, as on the Timeline.
    const sorted = [...list].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
    return sorted.length ? [group(`g${g}`, NAMES[g], COLOURS[g], sorted)] : []
  })
  return makePlan(groups, { links: options.links ?? false, dependencies, phases: [phase(801, 'Detailed design', '2026-11-01', '2027-01-31', null, 'now')] })
}

/** `rows` short one-line tasks in `groups` subteams, as a slide of every task shows them (Status only), for
 *  finding the row step at which they fit. */
export function stepPlan(rows: number, groups = 3): Plan {
  const lists: PlanTaskRow[][] = Array.from({ length: groups }, () => [])
  for (let i = 0; i < rows; i++) {
    const start = later(PLAN_YEAR.first, (i * 9) % 300)
    lists[i % groups].push(task(500 + i, `Task ${i + 1}`, start, later(start, 20), { word: WORDS[i % 3] }))
  }
  return makePlan(
    lists.map((list, g) => group(`s${g}`, NAMES[g], COLOURS[g], list)),
    { format: 'png', columns: { number: false, owner: false, dates: false, status: true } },
  )
}

/** One of everything the layout must survive: titles of hundreds of characters, emoji, Chinese and Arabic,
 *  bars wholly or partly outside the period, dates the wrong way round or not dates at all, a colour the
 *  palette doesn't know, an empty group, key dates bunched into a few days, more phases than tiers, and
 *  dependencies on rows that aren't there. */
export function oddPlan(extra: Partial<Plan> = {}): Plan {
  const long = 'Chassis design review and sign-off with the faculty adviser, the sponsor and the whole team '.repeat(4).trim()
  const rows = [
    task(1, long, '2026-10-01', '2026-10-20', { owner: `${long} +3` }),
    task(2, 'Wholly before the period', '2025-01-01', '2025-02-01'),
    task(3, 'Across the whole period and beyond', '2026-01-01', '2028-01-01', {
      word: 'Blocked',
      flags: { blocked: true, overdue: true, atRisk: false },
    }),
    task(4, 'Dates the wrong way round', '2027-03-10', '2027-02-01', { word: 'Overdue' }),
    task(5, 'Dates that are not dates', 'nonsense', '2027-13-45'),
    task(6, 'One day', '2027-05-05', '2027-05-05', { word: 'Done' }),
    task(7, '', null, '2026-12-01', { word: 'At risk', owner: '' }),
    task(0, 'Still being created', '2026-11-01', '2026-11-02'),
    task(8, 'Emoji 👩‍🔧 and Chinese 设计评审 and Arabic مراجعة التصميم', '2026-11-03', '2026-11-30', { owner: 'Zoë Ångström-Øberg' }),
    task(9, 'A parent whose subtasks count oddly', '2026-09-01', '2026-09-30', { progress: { done: 7, total: 3 } }),
    task(10, 'On the first day of the period', '2026-09-01', '2026-09-01', { word: 'At risk' }),
    task(11, 'On the last day of the period', '2027-08-31', '2027-08-31', { word: 'Overdue' }),
  ]
  const bunched = Array.from({ length: 12 }, (_, i) =>
    keyDate(950 + i, `${long.slice(0, 20 + i * 7)}`, later('2026-12-01', Math.floor(i / 2)), i % 2 ? 'RED' : null, (['upcoming', 'done', 'overdue', 'atRisk'] as const)[i % 4]),
  )
  return makePlan([group('odd', long, 'TEAL' as OptionColor, rows), group('empty', 'An empty group', 'GREEN', [])], {
    title: long,
    subtitle: long,
    preparedBy: long,
    note: long,
    orgShort: long,
    org: long,
    keyDates: [keyDate(940, 'On the first day', '2026-09-01', null, 'done'), ...bunched, keyDate(941, 'Not a date', 'soon', null, 'upcoming')],
    nextKeyDate: keyDate(942, long, '2026-12-15', null, 'atRisk'),
    afterPeriod: keyDate(943, long, '2027-10-01', 'BLUE', 'upcoming'),
    phases: Array.from({ length: 7 }, (_, i) =>
      phase(960 + i, `${long.slice(0, 30 + i * 10)}`, later('2026-10-01', i * 9), later('2026-12-20', i * 9), i % 2 ? 'PURPLE' : null, i === 2 ? 'now' : 'upcoming'),
    ),
    dependencies: [
      { from: 1, to: 999, clash: false },
      { from: 6, to: 6, clash: true },
      { from: 3, to: 6, clash: true },
      { from: 9, to: 8, clash: false },
    ],
    links: true,
    ...extra,
  })
}

const summary = (key: string, level: PlanSummaryRow['level'], name: string, spans: DateSpan[], counts: Partial<PlanSummaryRow> = {}): PlanSummaryRow => ({
  kind: 'summary',
  level,
  key,
  name,
  color: null,
  lead: '',
  spans,
  first: spans.length ? spans[0].start : null,
  last: spans.length ? spans[spans.length - 1].end : null,
  done: 0,
  total: 4,
  overdue: 0,
  blocked: 0,
  atRisk: 0,
  ...counts,
})

/** One row per domain: each subteam's row, then its domains, as the slide shows by default. */
export function summaryPlan(extra: Partial<Plan> = {}): Plan {
  const span = (start: string, end: string): DateSpan => ({ start, end })
  const subteam = (key: string, name: string, color: OptionColor, domains: PlanSummaryRow[], lead = ''): PlanGroup => {
    const spans = domains.flatMap((row) => row.spans).sort((a, b) => a.start.localeCompare(b.start))
    const total = domains.reduce((sum, row) => sum + row.total, 0)
    const done = domains.reduce((sum, row) => sum + row.done, 0)
    const sum = (field: 'overdue' | 'blocked' | 'atRisk') => domains.reduce((total, row) => total + row[field], 0)
    const head = summary(`${key}:all`, 'subteam', name, spans, { lead, total, done, overdue: sum('overdue'), blocked: sum('blocked'), atRisk: sum('atRisk') })
    return group(key, name, color, [head, ...domains], { counts: { tasks: total, done, blocked: sum('blocked'), overdue: sum('overdue'), atRisk: sum('atRisk') } })
  }
  const groups = [
    subteam(
      'mech',
      'Mechanical',
      'BLUE',
      [
        summary('m1', 'domain', 'Chassis', [span('2026-09-07', '2026-12-18'), span('2027-02-01', '2027-04-30')], { done: 3, total: 9 }),
        summary('m2', 'domain', 'Suspension', [span('2026-10-05', '2027-01-22')], { done: 2, total: 6, overdue: 2, blocked: 1 }),
        summary('m3', 'domain', 'General', [span('2026-11-02', '2026-11-20')], { done: 1, total: 1 }),
      ],
      'Jane Smith +1',
    ),
    subteam('elec', 'Electrical', 'YELLOW', [
      summary('e1', 'domain', 'Accumulator', [span('2027-01-12', '2027-05-03')], { done: 0, total: 5, atRisk: 1 }),
      summary('e2', 'domain', 'Low voltage', [span('2026-10-15', '2026-12-10'), span('2026-12-14', '2027-01-30')], { done: 4, total: 7 }),
    ]),
    subteam('auto', 'Autonomy', 'PURPLE', [
      summary('a1', 'domain', 'Perception', [span('2026-08-10', '2026-10-30'), span('2027-03-01', '2027-06-30')], { done: 2, total: 4 }),
    ]),
  ]
  const total = (field: keyof GroupCounts) => groups.reduce((sum, g) => sum + g.counts[field], 0)
  return samplePlan({
    format: 'png',
    mode: 'summary',
    columns: { number: false, owner: false, dates: false, status: true },
    subtitle: 'Timeline · All subteams · summary by domain · Sep 2026 – Aug 2027',
    groups,
    subteams: groups.flatMap((g) => (g.color ? [{ name: g.name, color: g.color }] : [])),
    counts: {
      tasks: total('tasks'),
      done: total('done'),
      inProgress: total('tasks') - total('done') - total('blocked'),
      notStarted: 0,
      blocked: total('blocked'),
      overdue: total('overdue'),
      atRisk: total('atRisk'),
    },
    dependencies: [],
    ...extra,
  })
}
