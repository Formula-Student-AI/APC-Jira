// The plan the Timeline export draws, built from the sample board (exportPlan.fixtures.ts) as of 10 November
// 2026: what is in scope, the groups and rows, subtasks on and off, tasks without dates, the period and the
// counts, summary rows, key dates and phases, names, dependencies and the notices.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLAN_LABEL } from '../../../config'
import type { Item } from '../../../types'
import { buildPlan, GENERAL, NOT_SCHEDULED, SUMMARY_GAP_DAYS, WHOLE_TEAM, type PlanInput } from './exportPlan'
import {
  byId,
  SAMPLE_EXPORTED_AT,
  sampleInput,
  sampleItem,
  sampleItems,
  sampleMember,
  sampleMembers,
  sampleOption,
  sampleOptions,
  timelineItems,
} from './exportPlan.fixtures'
import { defaultSettings, type ColumnChoice, type ExportSettings } from './exportSettings'
import type { Plan, PlanGroup, PlanSummaryRow, PlanTaskRow } from './planTypes'

const settings = (patch: Partial<ExportSettings> = {}): ExportSettings => ({ ...defaultSettings(), ...patch })
const plan = (patch: Partial<PlanInput> = {}) => buildPlan(sampleInput(patch))

/** The sample board with some items changed (by number) and some added, on the board and on the Timeline. */
function board(changes: Record<number, Partial<Item>>, added: Item[] = []): Pick<PlanInput, 'items' | 'allItems'> {
  const items = [...sampleItems().map((item) => ({ ...item, ...changes[item.number] })), ...added]
  return { items: timelineItems(items), allItems: byId(items) }
}

/** A board of just these items, all on the Timeline. */
const only = (items: Item[]): Pick<PlanInput, 'items' | 'allItems'> => ({ items, allItems: byId(items) })

/** The Timeline's items that pass a test, as a filter or the subteam buttons would leave them. */
const shownWhere = (test: (item: Item) => boolean) => timelineItems(sampleItems()).filter(test)

const taskRows = (p: Plan) => p.groups.flatMap((g) => g.rows.filter((r): r is PlanTaskRow => r.kind === 'task'))
const summaryRows = (g: PlanGroup) => g.rows.filter((r): r is PlanSummaryRow => r.kind === 'summary')
const numbers = (g: PlanGroup) => g.rows.map((r) => (r.kind === 'task' ? r.number : r.name))
const row = (p: Plan, number: number) => taskRows(p).find((r) => r.number === number)
const group = (p: Plan, name: string) => p.groups.find((g) => g.name === name) as PlanGroup
const texts = (p: Plan) => p.notices.map((notice) => notice.text)
const span = (start: string, end: string) => ({ start, end })
const dated = (start: string | null, due: string | null) => ({ start_date: start, due_date: due })

const EVERY_COLUMN: ColumnChoice = { number: true, owner: true, dates: true, status: true }
const USERNAMES = ['js12345', 'ab12345', 'cd12345', 'ef12345', 'zz99999']
const NEXT_3 = settings({ period: { preset: 'next3' } })

afterEach(() => {
  vi.useRealTimers()
})

describe('the plan', () => {
  it('carries the format, the title block and the period', () => {
    expect(plan()).toMatchObject({
      format: 'pdf',
      mode: 'tasks',
      org: 'Bristol Formula Student AI',
      orgShort: 'Bristol FSAI',
      title: PLAN_LABEL,
      subtitle: 'Timeline · All subteams · Sep 2026 – Aug 2027',
      asOf: '2026-11-10',
      exportedAt: SAMPLE_EXPORTED_AT,
      preparedBy: 'Jane Smith',
      note: '',
      period: { first: '2026-09-01', last: '2027-08-31' },
      columns: EVERY_COLUMN,
      links: false,
    })
    // Slides use their own rows and columns.
    const slide = plan({ format: 'png' })
    expect(slide.mode).toBe('summary')
    expect(slide.columns).toEqual({ number: false, owner: false, dates: false, status: true })
    expect(slide.subtitle).toBe('Timeline · All subteams · summary by domain · Sep 2026 – Aug 2027')
  })

  it('never reads the clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2031, 5, 1, 9, 0))
    const later = plan({ settings: NEXT_3 })
    vi.setSystemTime(new Date(2019, 0, 1, 9, 0))
    const earlier = plan({ settings: NEXT_3 })
    expect(later).toEqual(earlier)
    expect(later.period).toEqual({ first: '2026-11-01', last: '2027-01-31' })
  })
})

describe('scope', () => {
  it('groups the tasks as the Timeline does: subteams in board order, then Whole team, each by start date', () => {
    const p = plan()
    expect(p.groups.map((g) => g.name)).toEqual(['Mechanical', 'Powertrain', 'Electrical', WHOLE_TEAM])
    expect(p.groups.map((g) => g.key)).toEqual([
      'subteam-mechanical', 'subteam-powertrain', 'subteam-electrical', 'none',
    ])
    expect(p.groups.map((g) => g.color)).toEqual(['BLUE', 'PURPLE', 'GREEN', null])
    // Braking System and Admin have no tasks, so no group; key dates and phases are never rows.
    expect(p.groups.map(numbers)).toEqual([[101, 107, 102, 106, 108], [301, 302], [201, 202, 203], [401]])
    expect(p.groups.every((g) => !g.undated)).toBe(true)
  })

  it('takes the order of options from their sort order, not the order they come in', () => {
    const p = plan({ options: [...sampleOptions()].reverse() })
    expect(p.groups.map((g) => g.name)).toEqual(['Mechanical', 'Powertrain', 'Electrical', WHOLE_TEAM])
  })

  it('states the subteams picked and the filter in the subtitle, and for the dialog', () => {
    expect(plan().scope).toEqual({ subteams: [], filtered: false, query: '' })
    const inTeams = (item: Item) => item.subteam === 'Mechanical' || item.subteam === 'Electrical'
    const picked = plan({
      items: shownWhere((item) => inTeams(item) && /design/i.test(item.title)),
      shownTeams: ['Electrical', 'Mechanical'],
      query: ' design ',
    })
    expect(picked.subtitle).toBe('Timeline · Mechanical and Electrical · selected tasks · Sep 2026 – Aug 2027')
    expect(picked.scope).toEqual({ subteams: ['Mechanical', 'Electrical'], filtered: true, query: 'design' })
    expect(picked.groups.map(numbers)).toEqual([[101, 102]])
    // Progress counts the subtasks on the whole board, whatever the filter.
    expect(row(picked, 102)?.progress).toEqual({ done: 1, total: 2 })
  })

  it('leaves out archived items and items still being created, counting the archived ones', () => {
    const p = plan({ items: [...sampleItems()].sort((a, b) => a.position - b.position) })
    expect(p.leftOut.archived).toBe(3)
    expect(texts(p)).toContain('Archived items are never exported, so 3 items on the Timeline are left out.')
    const json = JSON.stringify(p)
    const never = ['id-105', 'Old frame idea', 'id-109', 'Old bracket', 'id-506', 'Retired review']
    for (const text of [...never, 'new-item', 'Brand new task']) expect(json).not.toContain(text)
    expect(p.counts.tasks).toBe(11)
    // An archived subtask isn't counted in its task's progress either.
    expect(row(p, 102)?.progress).toEqual({ done: 1, total: 2 })
    expect(plan().leftOut.archived).toBe(0)
  })

  it('cleans user text, so it is drawn exactly as typed and nothing else', () => {
    const p = plan(board({ 101: { title: 'Chassis‮  concept\tdesign\u0007' }, 501: { title: '  Design\nfreeze ' } }))
    expect(row(p, 101)?.title).toBe('Chassis concept design')
    expect(p.keyDates.find((keyDate) => keyDate.number === 501)?.title).toBe('Design freeze')
  })
})

describe('key dates and phases', () => {
  it('come from the whole board for the whole team and every subteam, whatever the filter', () => {
    const p = plan()
    expect(p.keyDates.map((k) => k.number)).toEqual([503, 502, 501, 505, 507, 504])
    expect(p.keyDates.map((k) => k.date)).toEqual([
      '2026-09-05', '2026-11-02', '2026-12-15', '2027-01-20', '2027-03-10', '2027-07-15',
    ])
    expect(p.keyDates.map((k) => k.color)).toEqual([null, 'BLUE', null, 'GREEN', 'RED', null])
    expect(p.keyDates.map((k) => k.state)).toEqual(['done', 'overdue', 'atRisk', 'upcoming', 'upcoming', 'upcoming'])
    const phase = (number: number, title: string, start: string, end: string) =>
      ({ id: `id-${number}`, number, title, start, end })
    expect(p.phases).toEqual([
      { ...phase(601, 'Concept', '2026-09-01', '2026-10-16'), color: null, state: 'finished' },
      { ...phase(602, 'Detailed design', '2026-10-19', '2026-12-20'), color: null, state: 'now' },
      { ...phase(603, 'Manufacture', '2027-01-04', '2027-04-30'), color: null, state: 'upcoming' },
      { ...phase(604, 'Electrical test', '2027-03-01', '2027-05-28'), color: 'GREEN', state: 'upcoming' },
    ])
    // A filter that hides every task leaves the lanes as they are.
    const filtered = plan({ items: [], query: 'zzz' })
    expect(filtered.keyDates).toEqual(p.keyDates)
    expect(filtered.phases).toEqual(p.phases)
  })

  it('carry only the whole team’s and the subteams shown, never another subteam’s', () => {
    const p = plan({ items: shownWhere((item) => item.subteam === 'Electrical'), shownTeams: ['Electrical'] })
    expect(p.keyDates.map((k) => k.number)).toEqual([503, 501, 505, 504])
    expect(p.phases.map((phase) => phase.number)).toEqual([601, 602, 603, 604])
    expect(p.subtitle).toBe('Timeline · Electrical · Sep 2026 – Aug 2027')
  })

  it('give the legend every subteam whose colour is on the page, in board order', () => {
    // Braking System has no tasks, but its key date is in the lane.
    expect(plan().subteams).toEqual([
      { name: 'Mechanical', color: 'BLUE' },
      { name: 'Powertrain', color: 'PURPLE' },
      { name: 'Electrical', color: 'GREEN' },
      { name: 'Braking System', color: 'RED' },
    ])
    const electrical = plan({ items: shownWhere((item) => item.subteam === 'Electrical'), shownTeams: ['Electrical'] })
    expect(electrical.subteams).toEqual([{ name: 'Electrical', color: 'GREEN' }])
  })

  it('find the next key date that isn’t done, even outside the period, and the first one after it', () => {
    const p = plan()
    expect(p.nextKeyDate).toMatchObject({ number: 501, title: 'Design freeze', date: '2026-12-15', state: 'atRisk' })
    expect(p.afterPeriod).toBeNull()

    const spring = plan({ settings: settings({ period: { preset: 'months', from: '2027-02', to: '2027-03' } }) })
    expect(spring.period).toEqual({ first: '2027-02-01', last: '2027-03-31' })
    expect(spring.keyDates.map((k) => k.number)).toEqual([507])
    expect(spring.nextKeyDate?.number).toBe(501)
    expect(spring.afterPeriod).toMatchObject({ number: 504, title: 'FS UK competition', date: '2027-07-15' })
    expect(spring.leftOut.keyDatesOutside).toBe(5)

    expect(plan(board({ 501: { status: 'Done' } })).nextKeyDate?.number).toBe(505)
  })

  it('never widen the whole plan', () => {
    const late = sampleItem(510, { subteam: null, title: 'Season launch', is_milestone: true, due_date: '2028-05-01' })
    const p = plan(board({}, [late]))
    expect(p.period).toEqual({ first: '2026-09-01', last: '2027-08-31' })
    expect(p.leftOut.keyDatesOutside).toBe(1)
    expect(p.afterPeriod?.number).toBe(510)
    expect(texts(p)).toContain("1 key date falls outside Sep 2026 – Aug 2027, so it isn't in the export.")
  })
})

describe('subtasks', () => {
  it('are rolled into their task by default, which shows their progress', () => {
    const p = plan()
    expect(taskRows(p).some((r) => [103, 104, 204].includes(r.number))).toBe(false)
    expect(row(p, 102)).toMatchObject({ title: 'Chassis detailed design', progress: { done: 1, total: 2 } })
    expect(row(p, 202)?.progress).toEqual({ done: 0, total: 1 })
    expect(row(p, 101)?.progress).toBeNull()
    expect(p.leftOut.rolledUp).toBe(3)
    expect(taskRows(p).some((r) => r.nested)).toBe(false)
  })

  it('get their own row, saying whose they are, when their task is filtered out', () => {
    const p = plan({ items: shownWhere((item) => item.number === 103 || item.number === 104), query: 'jig OR frame' })
    expect(p.groups.map(numbers)).toEqual([[103, 104]])
    expect(taskRows(p).map((r) => [r.partOf, r.nested, r.word])).toEqual([
      ['Chassis detailed design', false, 'Done'],
      ['Chassis detailed design', false, 'Overdue'],
    ])
    expect(p.leftOut.rolledUp).toBe(0)
  })

  it('get their own row when their task has no dates', () => {
    const p = plan(board({ 102: dated(null, null) }))
    expect(p.groups[0].name).toBe('Mechanical')
    expect(numbers(p.groups[0])).toEqual([101, 107, 103, 104, 106, 108])
    expect(row(p, 103)?.partOf).toBe('Chassis detailed design')
    expect(p.leftOut.undated).toBe(2)
  })

  it('get their own row when their task is outside the period, and never name an archived task', () => {
    // Finished, so it stays outside the period (an unfinished one would be a row, its slip running in).
    const old = sampleItem(110, { title: 'Old design', status: 'Done', ...dated('2026-09-01', '2026-09-30') })
    const fix = sampleItem(111, { title: 'Late fix', parent_id: 'id-110', ...dated('2026-11-02', '2026-11-20') })
    // #109 is archived.
    const spares = sampleItem(112, { title: 'Spares list', parent_id: 'id-109', ...dated('2026-11-03', '2026-11-25') })
    const p = plan({ ...board({}, [old, fix, spares]), settings: NEXT_3 })
    expect(numbers(p.groups[0])).toEqual([107, 102, 111, 112, 106])
    expect(row(p, 111)?.partOf).toBe('Old design')
    expect(row(p, 112)?.partOf).toBeNull()
    expect(p.leftOut.outsidePeriod).toBe(4)
  })

  it('sit just under their task when Subtasks is ticked, and stay out of the counts', () => {
    const p = plan({ settings: settings({ subtasks: true }) })
    expect(numbers(p.groups[0])).toEqual([101, 107, 102, 103, 104, 106, 108])
    const nested = p.groups[0].rows.map((r) => r.kind === 'task' && r.nested)
    expect(nested).toEqual([false, false, false, true, true, false, false])
    expect(row(p, 103)?.partOf).toBeNull()
    expect(row(p, 104)?.word).toBe('Overdue')
    expect(p.counts.tasks).toBe(11)
    expect(p.groups[0].counts.tasks).toBe(5)
    expect(p.leftOut).toMatchObject({ rolledUp: 0, undated: 2 })
    expect(texts(p).some((text) => text.includes('subtask'))).toBe(false)
  })

  it('in another subteam stand alone and say whose they are, or roll up when Subtasks is off', () => {
    const harness = sampleItem(205, {
      title: 'Harness bracket', subteam: 'Electrical', parent_id: 'id-102', ...dated('2026-11-09', '2026-11-27'),
    })
    const ticked = plan({ ...board({}, [harness]), settings: settings({ subtasks: true }) })
    expect(numbers(group(ticked, 'Electrical'))).toEqual([201, 202, 205, 203])
    expect(row(ticked, 205)).toMatchObject({ nested: false, partOf: 'Chassis detailed design' })
    expect(row(ticked, 102)?.progress).toEqual({ done: 1, total: 3 })
    const off = plan(board({}, [harness]))
    expect(row(off, 205)).toBeUndefined()
    expect(off.leftOut.rolledUp).toBe(4)
  })
})

describe('tasks without dates', () => {
  it('are left out by default, with a count and a fix', () => {
    const p = plan()
    expect(p.groups.some((g) => g.undated)).toBe(false)
    expect(p.leftOut.undated).toBe(1)
    expect(p.notices).toContainEqual({
      kind: 'info',
      text: "1 task has no dates, so it isn't in the export.",
      fix: { label: 'List tasks without dates', action: 'undated' },
    })
  })

  it('are listed last as Not yet scheduled when ticked, without joining the headline', () => {
    const p = plan({ settings: settings({ undated: true }) })
    const last = p.groups[p.groups.length - 1]
    expect(last).toMatchObject({ key: 'undated', name: NOT_SCHEDULED, color: null, lead: '', span: null })
    expect(last.undated).toBe(true)
    expect(numbers(last)).toEqual([402])
    expect(last.counts).toEqual({ tasks: 1, done: 0, blocked: 0, overdue: 0, atRisk: 0 })
    expect(row(p, 402)).toMatchObject({ start: null, due: null, word: 'Not started' })
    expect(p.leftOut.undated).toBe(0)
    expect(p.counts.tasks).toBe(11)

    const withSubtasks = plan({ settings: settings({ undated: true, subtasks: true }) })
    const listed = withSubtasks.groups[withSubtasks.groups.length - 1]
    expect(numbers(listed)).toEqual([204, 402])
    expect(row(withSubtasks, 204)).toMatchObject({ nested: false, partOf: 'LV wiring loom' })
  })

  it('are never listed on slides or in a summary, and then have no fix', () => {
    const everyTask = settings({ undated: true, png: { rows: 'tasks', columns: EVERY_COLUMN } })
    const slide = plan({ format: 'png', settings: everyTask })
    expect(slide.groups.some((g) => g.undated)).toBe(false)
    expect(slide.leftOut.undated).toBe(1)
    expect(slide.notices).toContainEqual({ kind: 'info', text: "1 task has no dates, so it isn't in the export." })
    const summary = plan({ settings: settings({ undated: true, pdf: { rows: 'summary', columns: EVERY_COLUMN } }) })
    expect(summary.groups.some((g) => g.undated)).toBe(false)
  })
})

describe('period and counts', () => {
  it('keeps tasks whose bars overlap the period, with their real dates, and counts what falls outside', () => {
    const p = plan({ settings: NEXT_3 })
    expect(p.period).toEqual({ first: '2026-11-01', last: '2027-01-31' })
    expect(p.subtitle).toBe('Timeline · All subteams · Nov 2026 – Jan 2027')
    expect(p.groups.map(numbers)).toEqual([[107, 102, 106], [302], [201, 202, 203], [401]])
    expect(row(p, 102)).toMatchObject({ start: '2026-10-12', due: '2026-12-18' })
    expect(p.leftOut).toEqual({
      outsidePeriod: 3, undated: 1, rolledUp: 3, archived: 0, keyDatesOutside: 3, phasesOutside: 2,
    })
    expect(p.keyDates.map((k) => k.number)).toEqual([502, 501, 505])
    expect(p.phases.map((phase) => phase.number)).toEqual([602, 603])
    expect(p.afterPeriod?.number).toBe(507)
    expect(p.counts).toEqual({ tasks: 8, done: 0, inProgress: 5, notStarted: 2, blocked: 1, overdue: 2, atRisk: 2 })
    expect(p.notices).toContainEqual({
      kind: 'info',
      text: "3 tasks, 3 key dates and 2 phases fall outside Nov 2026 – Jan 2027, so they aren't in the export.",
      fix: { label: 'Use the whole plan', action: 'plan' },
    })
    expect(p.subteams.map((subteam) => subteam.name)).toEqual(['Mechanical', 'Powertrain', 'Electrical'])
  })

  it('offers the whole plan only when it brings tasks back', () => {
    const task = sampleItem(1, { status: 'In Progress', ...dated('2026-11-02', '2026-12-11') })
    const kickOff = sampleItem(2, { subteam: null, title: 'Kick-off', status: 'Done', is_milestone: true, due_date: '2026-09-05' })
    expect(plan({ ...only([task, kickOff]), settings: NEXT_3 }).notices).toEqual([
      { kind: 'info', text: "1 key date falls outside Nov 2026 – Jan 2027, so it isn't in the export." },
    ])
  })

  it('keeps unfinished work from before the period as rows, and warns about key dates missed before it', () => {
    // As of 10 Nov, Next 3 months starts on 1 Nov: the caliper order was due on 28 Oct and is still open.
    const late = sampleItem(1, { title: 'Brake caliper order', status: 'In Progress', ...dated('2026-10-01', '2026-10-28') })
    const finished = sampleItem(2, { title: 'Brake spec', status: 'Done', ...dated('2026-09-07', '2026-10-02') })
    const next = sampleItem(3, { title: 'Pedal box', status: 'In Progress', ...dated('2026-11-02', '2026-12-11') })
    const review = sampleItem(4, { subteam: null, title: 'Design review', is_milestone: true, due_date: '2026-10-20' })
    const p = plan({ ...only([late, finished, next, review]), settings: NEXT_3 })
    // The slipped task is a row and counted overdue; the finished one stays out of the period.
    expect(taskRows(p).map((r) => r.number)).toEqual([1, 3])
    expect(row(p, 1)).toMatchObject({ word: 'Overdue', start: '2026-10-01', due: '2026-10-28' })
    expect(p.counts).toMatchObject({ tasks: 2, overdue: 1 })
    expect(p.leftOut).toMatchObject({ outsidePeriod: 1, keyDatesOutside: 1 })
    expect(texts(p)).toEqual([
      "“Design review” (20 Oct 2026) has passed but isn't marked Done. Mark it Done on the board if it happened.",
      '1 task is overdue. Check it on the board before sending.',
      "1 task and 1 key date fall outside Nov 2026 – Jan 2027, so they aren't in the export.",
    ])
    // With the whole plan the key date is drawn, so the warning says it shows as overdue.
    const whole = plan({ ...only([late, finished, next, review]) })
    expect(texts(whole)[0]).toBe(
      "“Design review” (20 Oct) has passed but isn't marked Done, so it shows as overdue. Mark it Done on the board if it happened.",
    )
  })

  it('leaves slipped work out of a period that starts after the as-of date', () => {
    // Months chosen ahead of the as-of date: a slip trail ends at the as-of date, so it can't reach them.
    const months = settings({ period: { preset: 'months', from: '2027-01', to: '2027-03' } })
    const late = sampleItem(1, { status: 'In Progress', ...dated('2026-10-01', '2026-10-28') })
    const p = plan({ ...only([late]), settings: months })
    expect(taskRows(p)).toEqual([])
    expect(p.leftOut.outsidePeriod).toBe(1)
  })

  it('widens the whole plan to cover every task, and warns when one stretches it past 24 months', () => {
    const renewal = sampleItem(113, { subteam: null, title: 'Sponsor renewal', due_date: '2029-03-01' })
    const p = plan(board({}, [renewal]))
    expect(p.period).toEqual({ first: '2026-09-01', last: '2029-03-31' })
    expect(p.notices[0]).toEqual({
      kind: 'warning',
      text: '“Sponsor renewal” (due Mar 2029) stretches the whole plan to 31 months.',
    })
    expect(numbers(group(p, WHOLE_TEAM))).toEqual([401, 113])
    expect(p.leftOut.outsidePeriod).toBe(0)
  })

  it('counts the headline over the task rows, with each word and marking', () => {
    const p = plan()
    expect(p.counts).toEqual({ tasks: 11, done: 2, inProgress: 5, notStarted: 3, blocked: 1, overdue: 2, atRisk: 2 })
    const { tasks, done, inProgress, notStarted, blocked } = p.counts
    expect(done + inProgress + notStarted + blocked).toBe(tasks)
    expect(Object.fromEntries(taskRows(p).map((r) => [r.number, r.word]))).toEqual({
      101: 'Done', 107: 'Blocked', 102: 'In progress', 106: 'At risk', 108: 'Not started', 301: 'Done',
      302: 'In progress', 201: 'In progress', 202: 'In progress', 203: 'At risk', 401: 'Overdue',
    })
    expect(row(p, 107)?.flags).toEqual({ blocked: true, overdue: true, atRisk: false })
    expect(row(p, 106)?.flags).toEqual({ blocked: false, overdue: false, atRisk: true })
    expect(p.groups.map((g) => g.counts)).toEqual([
      { tasks: 5, done: 1, blocked: 1, overdue: 1, atRisk: 1 },
      { tasks: 2, done: 1, blocked: 0, overdue: 0, atRisk: 0 },
      { tasks: 3, done: 0, blocked: 0, overdue: 0, atRisk: 1 },
      { tasks: 1, done: 0, blocked: 0, overdue: 1, atRisk: 0 },
    ])
    expect(p.groups.map((g) => g.span)).toEqual([
      span('2026-09-07', '2027-02-26'),
      span('2026-09-14', '2027-02-12'),
      span('2026-10-01', '2027-03-31'),
      span('2026-10-01', '2026-11-06'),
    ])
  })

  it('gives each row its facts for the cells', () => {
    expect(row(plan(), 108)).toEqual({
      kind: 'task', id: 'id-108', number: 108, title: 'Wheel hub machining', nested: false, partOf: null,
      progress: null, start: null, due: '2027-02-26', word: 'Not started', stage: 'Not started',
      flags: { blocked: false, overdue: false, atRisk: false }, owner: '', color: 'BLUE',
    })
    expect(row(plan(), 401)?.color).toBeNull()
  })
})

describe('summary rows', () => {
  it('give each subteam a row, then a row for each domain it uses in its own order, then General', () => {
    const p = plan({ format: 'png' })
    expect(taskRows(p)).toEqual([])
    expect(p.groups.map(numbers)).toEqual([
      ['Mechanical', 'Chassis', 'Suspension', 'Steering', GENERAL],
      ['Powertrain'],
      ['Electrical', 'Accumulator', 'LV systems'],
      [WHOLE_TEAM],
    ])
    const [mechanical, chassis, suspension, steering, general] = summaryRows(p.groups[0])
    expect(mechanical).toEqual({
      kind: 'summary', level: 'subteam', key: 'subteam-mechanical', name: 'Mechanical', color: 'BLUE', lead: '',
      spans: [span('2026-09-07', '2027-01-22'), span('2027-02-26', '2027-02-26')],
      first: '2026-09-07', last: '2027-02-26', done: 1, total: 5, overdue: 1, blocked: 1, atRisk: 1,
    })
    expect(chassis).toMatchObject({
      level: 'domain', key: 'subteam-mechanical:domain-chassis', color: 'BLUE', lead: '',
      spans: [span('2026-09-07', '2026-12-18')], first: '2026-09-07', last: '2026-12-18', done: 1, total: 2,
    })
    expect(suspension).toMatchObject({ total: 1, atRisk: 1, spans: [span('2026-11-16', '2027-01-22')] })
    expect(steering).toMatchObject({ total: 1, blocked: 1, overdue: 1, spans: [span('2026-10-05', '2026-11-06')] })
    expect(general).toMatchObject({ key: 'subteam-mechanical:general', total: 1, first: '2027-02-26' })
    // Summary rows are made of the same tasks as the task rows.
    expect(p.counts).toEqual(plan().counts)
    expect(p.groups.map((g) => g.counts)).toEqual(plan().groups.map((g) => g.counts))
  })

  it('merge each row’s bars, closing gaps under a week and keeping longer ones', () => {
    expect(SUMMARY_GAP_DAYS).toBe(7)
    const p = plan({ format: 'png' })
    // Powertrain uses no domains, so it is one row; its 9-day gap stays.
    expect(summaryRows(p.groups[1])).toMatchObject([
      { name: 'Powertrain', spans: [span('2026-09-14', '2026-10-09'), span('2026-10-19', '2027-02-12')] },
    ])
    const electrical = summaryRows(p.groups[2])
    expect(electrical[0].spans).toEqual([span('2026-10-01', '2027-03-31')])
    expect(electrical[1].spans).toEqual([span('2026-10-01', '2026-11-20'), span('2026-12-01', '2027-03-31')])

    const bench = (number: number, start: string, due: string) =>
      sampleItem(number, { subteam: 'Powertrain', ...dated(start, due) })
    const benches = [
      bench(1, '2026-11-02', '2026-11-06'),
      bench(2, '2026-11-10', '2026-11-13'),
      bench(3, '2026-11-21', '2026-11-25'),
    ]
    const short = plan({ format: 'png', ...only(benches) })
    // Three days between the first two close up; seven before the third don't.
    expect(summaryRows(short.groups[0])[0].spans).toEqual([
      span('2026-11-02', '2026-11-13'),
      span('2026-11-21', '2026-11-25'),
    ])
  })

  it('follow the subteam’s own domain order, and put unknown domains under General', () => {
    const order: Record<string, number> = { Steering: 0, Chassis: 1, Suspension: 2 }
    const reordered = sampleOptions().map((option) =>
      option.field === 'domain' && option.name in order ? { ...option, sort_order: order[option.name] } : option,
    )
    const options = reordered.reverse()
    const p = plan({ format: 'png', options, ...board({ 101: { domain: 'Aero' } }) })
    expect(numbers(p.groups[0])).toEqual(['Mechanical', 'Steering', 'Chassis', 'Suspension', GENERAL])
    expect(summaryRows(p.groups[0])[4]).toMatchObject({ name: GENERAL, total: 2 })
  })

  it('leave out Subtasks, tasks without dates and dependency lines', () => {
    const p = plan({ format: 'png', settings: settings({ subtasks: true, undated: true, links: true }) })
    expect(taskRows(p)).toEqual([])
    expect(p.groups.some((g) => g.undated)).toBe(false)
    expect(p.links).toBe(false)
    expect(p.dependencies).toEqual([])
    expect(p.leftOut.rolledUp).toBe(3)
    // A step with a problem is still pointed out, with no Show subtasks fix: this mode counts tasks only.
    const subtasks = p.notices.filter((notice) => notice.text.includes('subtask'))
    expect(subtasks).toEqual([
      { kind: 'warning', text: "1 subtask is overdue, but one row per domain counts only tasks, so the export doesn't show it." },
    ])
  })

  it('call the row of tasks with no domain Other when the subteam has a domain called General', () => {
    const general = sampleOption('domain', 'general', 'GRAY', 3, { parent_id: 'subteam-mechanical' })
    const p = plan({ format: 'png', options: [...sampleOptions(), general], ...board({ 106: { domain: 'general' } }) })
    const names = summaryRows(p.groups[0]).map((r) => r.name)
    // #106 (Suspension's only task) moved to 'general'; #108 has no domain. Names are compared whatever their case.
    expect(names).toEqual(['Mechanical', 'Chassis', 'Steering', 'general', 'Other'])
    expect(new Set(names).size).toBe(names.length)
  })

  it('name the leads on subteam rows only, and only with Lead ticked', () => {
    const leads = (p: Plan) => p.groups.map((g) => summaryRows(g).map((r) => r.lead))
    expect(leads(plan({ format: 'png' })).flat()).toEqual(Array(10).fill(''))
    const png = { rows: 'summary' as const, columns: { number: false, owner: true, dates: false, status: true } }
    const p = plan({ format: 'png', settings: settings({ png }) })
    expect(leads(p)).toEqual([['Jane Smith', '', '', '', ''], [''], ['Alexandra Brown +1', '', ''], ['']])
    expect(p.groups.map((g) => g.lead)).toEqual(['Jane Smith', '', 'Alexandra Brown +1', ''])
  })
})

describe('names', () => {
  it('give owners and leads by full name, leaving out anyone who isn’t a member', () => {
    const p = plan()
    expect(row(p, 101)?.owner).toBe('Jane Smith')
    // zz99999 is assigned but isn't a member; a retired member keeps her name.
    expect(row(p, 102)?.owner).toBe('Jane Smith +1')
    expect(row(p, 201)?.owner).toBe('Chris Davies')
    expect(row(p, 202)?.owner).toBe('Alexandra Brown +1')
    expect(row(p, 106)?.owner).toBe('')
    expect(p.groups.map((g) => g.lead)).toEqual(['Jane Smith', '', 'Alexandra Brown +1', ''])
  })

  it('never show a username', () => {
    const members = { ...sampleMembers(), xy11111: sampleMember('xy11111', '') }
    const items = board({ 106: { assignees: ['xy11111'] } })
    const summary = settings({ png: { rows: 'summary', columns: EVERY_COLUMN } })
    for (const p of [
      plan({ members, ...items }),
      plan({ members, ...items, format: 'png', settings: summary }),
      plan({ members, ...items, settings: settings({ subtasks: true, undated: true, links: true }) }),
    ]) {
      const json = JSON.stringify(p)
      for (const username of [...USERNAMES, 'xy11111']) expect(json).not.toContain(username)
    }
  })

  it('name no one without the Owner column', () => {
    const p = plan({ settings: settings({ pdf: { rows: 'tasks', columns: { ...EVERY_COLUMN, owner: false } } }) })
    expect(taskRows(p).every((r) => r.owner === '')).toBe(true)
    expect(p.groups.every((g) => g.lead === '')).toBe(true)
  })

  it('say who prepared the export: your full name by default, what was typed, or nothing', () => {
    expect(plan().preparedBy).toBe('Jane Smith')
    expect(plan({ settings: settings({ preparedBy: ' Chassis  team ' }) }).preparedBy).toBe('Chassis team')
    expect(plan({ settings: settings({ preparedBy: '' }) }).preparedBy).toBe('')
    expect(plan({ me: null }).preparedBy).toBe('')
  })

  it('keep the title and note as typed, cleaned, with the plan’s name for a blank title', () => {
    const note = ' Updated after the\nOctober review '
    const p = plan({ settings: settings({ title: '  Sponsor update,\tNovember ' }), note })
    expect(p.title).toBe('Sponsor update, November')
    expect(p.note).toBe('Updated after the October review')
    expect(plan({ settings: settings({ title: ' ‮ ' }) }).title).toBe(PLAN_LABEL)
  })
})

describe('dependencies', () => {
  it('join task rows only, and only with Dependency lines ticked', () => {
    expect(plan().dependencies).toEqual([])
    const p = plan({ settings: settings({ links: true }) })
    expect(p.links).toBe(true)
    // Design freeze also waits on #102, but key dates are never rows.
    expect(p.dependencies).toEqual([
      { from: 102, to: 106, clash: true },
      { from: 107, to: 203, clash: false },
    ])
  })

  it('leave out blockers that aren’t rows', () => {
    const p = plan({ items: shownWhere((item) => item.number !== 102), settings: settings({ links: true }) })
    expect(p.dependencies).toEqual([{ from: 107, to: 203, clash: false }])
  })
})

describe('notices', () => {
  it('say what to check before sending, with their one-click fixes', () => {
    expect(plan().notices).toEqual([
      {
        kind: 'warning',
        text:
          "“Chassis sign-off” (2 Nov) has passed but isn't marked Done, so it shows as overdue. " +
          'Mark it Done on the board if it happened.',
      },
      { kind: 'warning', text: '2 tasks are overdue and 2 are at risk. Check them on the board before sending.' },
      {
        kind: 'warning',
        text: "1 subtask is overdue, but it is rolled into its task, so the export doesn't show it.",
        fix: { label: 'Show subtasks', action: 'subtasks' },
      },
      {
        kind: 'info',
        text: "1 task has no dates, so it isn't in the export.",
        fix: { label: 'List tasks without dates', action: 'undated' },
      },
    ])
  })

  it('say when the board isn’t connected, first, and when the filter is on', () => {
    const p = plan({ connected: false, query: 'design', items: shownWhere((item) => /design/i.test(item.title)) })
    expect(p.notices[0]).toEqual({
      kind: 'warning',
      text: "The board isn't connected, so others' latest changes may be missing.",
    })
    expect(p.notices).toContainEqual({
      kind: 'info',
      text:
        "Only the tasks that match the Timeline's filter are included, so the subtitle says “selected tasks”. " +
        'Key dates and phases are shown whatever the filter.',
    })
    expect(texts(plan()).some((text) => text.includes('filter'))).toBe(false)
  })

  it('name up to three key dates that have passed, then say how many more', () => {
    const passed = { 501: { due_date: '2026-11-03' }, 505: { due_date: '2026-11-04' }, 504: { due_date: '2026-11-05' } }
    expect(plan(board(passed)).notices[0].text).toBe(
      "4 key dates have passed but aren't marked Done, so they show as overdue: “Chassis sign-off” (2 Nov), " +
        '“Design freeze” (3 Nov), “Battery review” (4 Nov) and 1 more. ' +
        'Mark them Done on the board if they happened.',
    )
  })

  it('word the check before sending for overdue or at-risk tasks alone', () => {
    const late = sampleItem(1, { status: 'In Progress', ...dated('2026-10-01', '2026-11-02') })
    expect(texts(plan(only([late])))).toEqual(['1 task is overdue. Check it on the board before sending.'])
    const later = dated('2026-11-16', '2026-12-11')
    const stuck = sampleItem(2, { status: 'Blocked', ...later })
    const waiting = [3, 4].map((number) => sampleItem(number, { blocked_by: [2], ...later }))
    expect(texts(plan(only([stuck, ...waiting])))).toEqual([
      '2 tasks are at risk. Check them on the board before sending.',
    ])
    expect(texts(plan(only([late, stuck, waiting[0]])))).toEqual([
      '1 task is overdue and 1 is at risk. Check them on the board before sending.',
    ])
  })

  it('warn of a blocked subtask hidden in its task', () => {
    expect(plan(board({ 103: { status: 'Blocked' } })).notices).toContainEqual({
      kind: 'warning',
      text: "2 subtasks are blocked or overdue, but they are rolled into their tasks, so the export doesn't show them.",
      fix: { label: 'Show subtasks', action: 'subtasks' },
    })
  })

  it('offer nothing for an export with nothing left out or to check', () => {
    const fine = sampleItem(1, { status: 'In Progress', ...dated('2026-11-02', '2026-12-11') })
    expect(plan(only([fine])).notices).toEqual([])
  })
})
