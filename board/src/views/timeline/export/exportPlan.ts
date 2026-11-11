// What the Timeline export shows, worked out from the board: the groups and rows, their status words and
// markings, the key dates and phases for the lanes, the counts, what was left out and the notices.

import { ORG_LONG_NAME, ORG_NAME, PLAN_LABEL } from '../../../config'
import { parseDay, toDay } from '../../../lib/format'
import { datesClash } from '../../../lib/links'
import { domainsOf, optionsFor, sortOptions, subteamLeads, subteamOption } from '../../../lib/options'
import { byPosition } from '../../../lib/position'
import { progressOf, subtaskIndex, withSubtasksUnderParents } from '../../../lib/subtasks'
import type { FieldOption, Item, Member, OptionColor } from '../../../types'
import { groupForTimeline, type TimelineGroup } from '../timelineMath'
import { mergeSpans } from './exportLanes'
import { needsYear, periodFor, periodLabel, type DatedRow } from './exportPeriod'
import type { ExportFormat, ExportSettings } from './exportSettings'
import {
  firstStatus,
  keyDateDay,
  keyDateState,
  phaseState,
  taskFlags,
  taskStage,
  wordFor,
  type StatusContext,
  type TaskStage,
} from './exportStatus'
import { cleanText, formatDayShort, listText, ownerText, subtitleText } from './exportText'
import type {
  DateSpan,
  Flags,
  GroupCounts,
  LeftOut,
  Notice,
  Period,
  Plan,
  PlanCounts,
  PlanGroup,
  PlanKeyDate,
  PlanPhase,
  PlanSummaryRow,
  PlanTaskRow,
  TaskWord,
} from './planTypes'

export interface PlanInput {
  /** The Timeline's items: the subteams picked and the filter applied (useViewItems), as the Timeline shows them */
  items: Item[]
  /** Every board item (store.items), for key dates, phases, subtask progress and blockers */
  allItems: Record<string, Item>
  options: FieldOption[]
  members: Record<string, Member>
  /** The signed-in member (the default "Prepared by") */
  me: Member | null
  /** The subteams picked in the subteam bar; empty means all */
  shownTeams: string[]
  /** What is typed in the filter box ('' when nothing) */
  query: string
  /** The as-of date, 'YYYY-MM-DD' (useToday) */
  today: string
  /** ISO time of the export (new Date().toISOString() at the click; the preview passes its render time) */
  exportedAt: string
  /** The board's live connection is up; otherwise a notice says others' latest changes may be missing */
  connected: boolean
  settings: ExportSettings
  /** The format whose rows and columns to use */
  format: ExportFormat
  /** The note for page 1 (not remembered); '' when empty */
  note: string
}

/** The group of tasks with no subteam (the Timeline calls it No subteam). */
export const WHOLE_TEAM = 'Whole team'
/** The last group, with Tasks without dates ticked. */
export const NOT_SCHEDULED = 'Not yet scheduled'
/** The summary row for a subteam's tasks that have no domain. */
export const GENERAL = 'General'
/** Gaps of less than a week between a summary row's bars are closed; longer ones stay, as real gaps in the work. */
export const SUMMARY_GAP_DAYS = 7
/** The notice about key dates that have passed names this many before '… and 2 more'. */
const NAMED_KEY_DATES = 3

/** A task in the export, with its days and status worked out once. */
interface TaskFacts {
  item: Item
  span: DateSpan | null
  stage: TaskStage
  flags: Flags
  word: TaskWord
}

/** What every part of the plan looks things up in, worked out once. */
interface Board {
  /** In board order (sortOptions) */
  options: FieldOption[]
  members: Record<string, Member>
  items: Record<string, Item>
  /** Every item's subtasks on the board (archived ones included), by the parent's id */
  subtasks: Map<string, Item[]>
  byNumber: Map<number, Item>
  firstStatus: string | null
  asOf: string
  /** Owner (Lead in summary mode) is ticked, so people are named */
  names: boolean
  /** Facts already worked out, by item id */
  facts: Map<string, TaskFacts>
}

/** A day as 'YYYY-MM-DD' written by toDay, or null when it isn't one. Days written alike compare as text in
 *  date order, as datesClash compares them. */
function dayOf(value: string | null | undefined): string | null {
  const date = parseDay(value)
  return date ? toDay(date) : null
}

/** The days an item's bar covers, as barFor draws it (one day when it has one date); null without dates. */
function spanOf(item: Pick<Item, 'start_date' | 'due_date'>): DateSpan | null {
  const start = dayOf(item.start_date)
  const due = dayOf(item.due_date)
  const first = start ?? due
  const last = due ?? start
  if (!first || !last) return null
  return first <= last ? { start: first, end: last } : { start: last, end: first }
}

const overlaps = (span: DateSpan, period: Period) => span.start <= period.last && span.end >= period.first

/** The other names tried, in turn, for the summary row of a subteam's tasks with no domain, when the subteam
 *  has a real domain called General (or Other): two rows must never share a name. */
const NO_DOMAIN_NAMES = ['Other', 'No domain', 'Tasks with no domain']

/** First start to last end of the spans; null when there are none. */
function extentOf(spans: (DateSpan | null)[]): DateSpan | null {
  let extent: DateSpan | null = null
  for (const span of spans) {
    if (!span) continue
    if (!extent) extent = { ...span }
    else {
      if (span.start < extent.start) extent.start = span.start
      if (span.end > extent.end) extent.end = span.end
    }
  }
  return extent
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** 'blocked', 'blocked or overdue', 'blocked, overdue or at risk' */
function orList(words: string[]): string {
  return words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

function statusContext(board: Board, item: Item): StatusContext {
  const subtasks = (board.subtasks.get(item.id) ?? []).filter((subtask) => !subtask.archived)
  return { firstStatus: board.firstStatus, asOf: board.asOf, byNumber: board.byNumber, subtasks }
}

function factsOf(board: Board, item: Item): TaskFacts {
  const known = board.facts.get(item.id)
  if (known) return known
  const ctx = statusContext(board, item)
  const stage = taskStage(item, ctx)
  const flags = taskFlags(item, ctx)
  const facts = { item, span: spanOf(item), stage, flags, word: wordFor(stage, flags) }
  board.facts.set(item.id, facts)
  return facts
}

/**
 * The days a task takes up on the chart: its bar and, for an unfinished task past its due date, the slip
 * trail on to the as-of date. So work still open from before the period (a Next 3 months export starts on
 * the 1st) is a row, its trail running in from the left: slipped work is never left out of a status update.
 */
function reachOf(board: Board, item: Item): DateSpan | null {
  const { span, flags } = factsOf(board, item)
  if (!span) return null
  return flags.overdue && board.asOf > span.end ? { start: span.start, end: board.asOf } : span
}

/** A subteam's colour; null for the whole team, and for a subteam that no longer exists (both drawn navy). */
const colorOf = (board: Board, subteam: string | null): OptionColor | null =>
  subteamOption(board.options, subteam)?.color ?? null

/** The subteam's leads by full name ('Jane Smith +1'), only with Owner ticked. */
function leadsOf(board: Board, subteam: string | null): string {
  return board.names && subteam ? ownerText(subteamLeads(board.options, subteam), board.members) : ''
}

function groupCounts(facts: TaskFacts[]): GroupCounts {
  return {
    tasks: facts.length,
    done: facts.filter((f) => f.stage === 'Done').length,
    blocked: facts.filter((f) => f.stage === 'Blocked').length,
    overdue: facts.filter((f) => f.flags.overdue).length,
    atRisk: facts.filter((f) => f.flags.atRisk).length,
  }
}

function headlineCounts(facts: TaskFacts[]): PlanCounts {
  const { tasks, done, blocked, overdue, atRisk } = groupCounts(facts)
  const inProgress = facts.filter((f) => f.stage === 'In progress').length
  const notStarted = facts.filter((f) => f.stage === 'Not started').length
  return { tasks, done, inProgress, notStarted, blocked, overdue, atRisk }
}

function taskRow(board: Board, item: Item, nested: boolean): PlanTaskRow {
  const { word, stage, flags } = factsOf(board, item)
  const parent = item.parent_id ? board.items[item.parent_id] : undefined
  // A step shown away from its task says whose it is. Archived tasks never appear, not even by name.
  const named = !nested && parent && !parent.archived && parent.number > 0
  const progress = progressOf(board.subtasks.get(item.id) ?? [])
  return {
    kind: 'task',
    id: item.id,
    number: item.number,
    title: cleanText(item.title),
    nested,
    partOf: named ? cleanText(parent.title) || null : null,
    progress: progress.total > 0 ? progress : null,
    start: dayOf(item.start_date),
    due: dayOf(item.due_date),
    word,
    stage,
    flags,
    // Without the Owner column no one is named at all.
    owner: board.names ? ownerText(item.assignees, board.members) : '',
    color: colorOf(board, item.subteam),
  }
}

/** Rows in order, each subtask nested when it sits just under its task (Subtasks ticked, same group). */
function taskRows(board: Board, items: Item[], showSubtasks: boolean): { rows: PlanTaskRow[]; top: TaskFacts[] } {
  const ids = new Set(items.map((item) => item.id))
  const rows = items.map((item) => {
    const nested = showSubtasks && item.parent_id !== null && ids.has(item.parent_id)
    return taskRow(board, item, nested)
  })
  const top = items.filter((_, index) => !rows[index].nested).map((item) => factsOf(board, item))
  return { rows, top }
}

function groupName(group: TimelineGroup): string {
  return group.value === null ? WHOLE_TEAM : cleanText(group.name)
}

function taskGroup(board: Board, group: TimelineGroup, showSubtasks: boolean): PlanGroup {
  const { rows, top } = taskRows(board, group.items, showSubtasks)
  return {
    key: group.key,
    name: groupName(group),
    color: colorOf(board, group.value),
    lead: leadsOf(board, group.value),
    counts: groupCounts(top),
    span: extentOf(group.items.map((item) => factsOf(board, item).span)),
    rows,
    undated: false,
  }
}

function undatedGroup(board: Board, items: Item[], showSubtasks: boolean): PlanGroup {
  // In board order, as the Timeline lists them, with each step just under its task.
  const { rows, top } = taskRows(board, withSubtasksUnderParents(items), showSubtasks)
  // Its counts are for its own header: the headline never counts tasks without dates.
  const counts = groupCounts(top)
  return { key: 'undated', name: NOT_SCHEDULED, color: null, lead: '', counts, span: null, rows, undated: true }
}

function summaryRow(
  level: PlanSummaryRow['level'],
  key: string,
  name: string,
  color: OptionColor | null,
  lead: string,
  facts: TaskFacts[],
): PlanSummaryRow {
  const counts = groupCounts(facts)
  const spans = facts.flatMap((f) => (f.span ? [f.span] : []))
  const extent = extentOf(spans)
  return {
    kind: 'summary',
    level,
    key,
    name,
    color,
    lead,
    spans: mergeSpans(spans, SUMMARY_GAP_DAYS),
    first: extent?.start ?? null,
    last: extent?.end ?? null,
    done: counts.done,
    total: counts.tasks,
    overdue: counts.overdue,
    blocked: counts.blocked,
    atRisk: counts.atRisk,
  }
}

/**
 * One row per domain: the subteam's row, then a row for each of its domains its tasks use, in the subteam's
 * own order (domainsOf), then General for its tasks with no domain (Other, or the next free name, when the
 * subteam has a domain called General). A subteam that uses no domains is the one row, which already says
 * everything a General row would.
 */
function summaryGroup(board: Board, group: TimelineGroup): PlanGroup {
  const name = groupName(group)
  const color = colorOf(board, group.value)
  const lead = leadsOf(board, group.value)
  const facts = group.items.map((item) => factsOf(board, item))
  const rows = [summaryRow('subteam', group.key, name, color, lead, facts)]
  const domains = domainsOf(board.options, group.value).filter(
    (domain, index, all) => all.findIndex((other) => other.name === domain.name) === index,
  )
  const inDomain = (domain: FieldOption) => facts.filter((f) => f.item.domain === domain.name)
  const used = domains.filter((domain) => inDomain(domain).length > 0)
  if (used.length > 0) {
    for (const domain of used) {
      rows.push(summaryRow('domain', `${group.key}:${domain.id}`, cleanText(domain.name), color, '', inDomain(domain)))
    }
    const known = new Set(domains.map((domain) => domain.name))
    const general = facts.filter((f) => !f.item.domain || !known.has(f.item.domain))
    // Domain names are unique within a subteam whatever their case, so the names are compared that way.
    const taken = new Set(domains.map((domain) => cleanText(domain.name).toLowerCase()))
    const otherName = [GENERAL, ...NO_DOMAIN_NAMES].find((name) => !taken.has(name.toLowerCase())) ?? `${GENERAL} (no domain)`
    if (general.length > 0) rows.push(summaryRow('domain', `${group.key}:general`, otherName, color, '', general))
  }
  return {
    key: group.key,
    name,
    color,
    lead,
    counts: groupCounts(facts),
    span: extentOf(facts.map((f) => f.span)),
    rows,
    undated: false,
  }
}

/** Lines from each blocker to the task waiting on it, when both are rows with bars, in the order of the rows. */
function dependenciesOf(rows: Item[]): Plan['dependencies'] {
  const byNumber = new Map(rows.map((item) => [item.number, item]))
  const lines: Plan['dependencies'] = []
  for (const item of rows) {
    for (const number of [...new Set(item.blocked_by)].sort((a, b) => a - b)) {
      const blocker = byNumber.get(number)
      if (blocker && blocker !== item) lines.push({ from: number, to: item.number, clash: datesClash(blocker, item) })
    }
  }
  return lines
}

interface NoticeFacts {
  input: PlanInput
  period: Period
  /** Whole plan stretched by one far-off date (periodFor) */
  warning: string | null
  /** The PDF in every-task mode, which can list tasks without dates */
  canListUndated: boolean
  /** One row per domain, which counts tasks only (Subtasks can't show steps there) */
  summary: boolean
  /** The key dates in the period, as drawn */
  keyDates: PlanKeyDate[]
  /** Every key date in scope that has passed without being marked Done, in the period or not */
  passed: PlanKeyDate[]
  counts: PlanCounts
  leftOut: LeftOut
  /** Subtasks rolled into their tasks that are blocked, overdue or at risk */
  hidden: TaskFacts[]
}

/**
 * The plan's notices, most pressing first: a board that isn't connected, one far-off date stretching Whole
 * plan, key dates that have passed but aren't Done, overdue and at-risk tasks to check before sending,
 * problems hidden in subtasks, the filter, and what is left out (no dates, outside the period, archived).
 * The dialog adds its own (an empty export, long PDFs, several slides) and the layout's (shortened names).
 */
function noticesFor(facts: NoticeFacts): Notice[] {
  const { input, period, counts, leftOut } = facts
  const notices: Notice[] = []
  const isNot = (count: number) => (count === 1 ? "it isn't" : "they aren't")

  if (!input.connected) {
    notices.push({ kind: 'warning', text: "The board isn't connected, so others' latest changes may be missing." })
  }
  if (facts.warning) notices.push({ kind: 'warning', text: facts.warning })

  // Key dates from before the period count too: a Next 3 months export starts on the 1st, and a key date
  // missed earlier is still a slip to put right (or mark Done) before sending.
  const { passed } = facts
  if (passed.length > 0) {
    const drawn = new Set(facts.keyDates.map((keyDate) => keyDate.id))
    const shown = passed.every((keyDate) => drawn.has(keyDate.id))
    const named = (keyDate: PlanKeyDate) =>
      `“${keyDate.title}” (${formatDayShort(keyDate.date, needsYear(keyDate.date, period))})`
    const names = passed.slice(0, NAMED_KEY_DATES).map(named)
    if (passed.length > NAMED_KEY_DATES) names.push(`${passed.length - NAMED_KEY_DATES} more`)
    const text =
      passed.length === 1
        ? `${names[0]} has passed but isn't marked Done${shown ? ', so it shows as overdue' : ''}. ` +
          'Mark it Done on the board if it happened.'
        : `${passed.length} key dates have passed but aren't marked Done${shown ? ', so they show as overdue' : ''}: ` +
          `${listText(names)}. Mark them Done on the board if they happened.`
    notices.push({ kind: 'warning', text })
  }

  if (counts.overdue > 0 || counts.atRisk > 0) {
    const parts: string[] = []
    if (counts.overdue > 0) parts.push(`${plural(counts.overdue, 'task is', 'tasks are')} overdue`)
    if (counts.atRisk > 0) {
      // '2 tasks are overdue and 1 is at risk', or '1 task is at risk'.
      const who = counts.overdue > 0 ? `${counts.atRisk}` : plural(counts.atRisk, 'task', 'tasks')
      parts.push(`${who} ${counts.atRisk === 1 ? 'is' : 'are'} at risk`)
    }
    const them = counts.overdue + counts.atRisk === 1 ? 'it' : 'them'
    notices.push({ kind: 'warning', text: `${parts.join(' and ')}. Check ${them} on the board before sending.` })
  }

  if (facts.hidden.length > 0) {
    const count = facts.hidden.length
    const words = orList(
      [
        facts.hidden.some((f) => f.flags.blocked) ? 'blocked' : '',
        facts.hidden.some((f) => f.flags.overdue) ? 'overdue' : '',
        facts.hidden.some((f) => f.flags.atRisk) ? 'at risk' : '',
      ].filter(Boolean),
    )
    if (facts.summary) {
      // One row per domain counts tasks only, so there is no box to tick here: Every task can show them.
      const text =
        count === 1
          ? `1 subtask is ${words}, but one row per domain counts only tasks, so the export doesn't show it.`
          : `${count} subtasks are ${words}, but one row per domain counts only tasks, so the export doesn't show them.`
      notices.push({ kind: 'warning', text })
    } else {
      const text =
        count === 1
          ? `1 subtask is ${words}, but it is rolled into its task, so the export doesn't show it.`
          : `${count} subtasks are ${words}, but they are rolled into their tasks, so the export doesn't show them.`
      notices.push({ kind: 'warning', text, fix: { label: 'Show subtasks', action: 'subtasks' } })
    }
  }

  if (input.query.trim() !== '') {
    notices.push({
      kind: 'info',
      text:
        "Only the tasks that match the Timeline's filter are included, so the subtitle says “selected tasks”. " +
        'Key dates and phases are shown whatever the filter.',
    })
  }

  if (leftOut.undated > 0) {
    const tasks = plural(leftOut.undated, 'task has', 'tasks have')
    const text = `${tasks} no dates, so ${isNot(leftOut.undated)} in the export.`
    const fix = { label: 'List tasks without dates', action: 'undated' } as const
    notices.push(facts.canListUndated ? { kind: 'info', text, fix } : { kind: 'info', text })
  }

  const outside = [
    leftOut.outsidePeriod > 0 ? plural(leftOut.outsidePeriod, 'task', 'tasks') : '',
    leftOut.keyDatesOutside > 0 ? plural(leftOut.keyDatesOutside, 'key date', 'key dates') : '',
    leftOut.phasesOutside > 0 ? plural(leftOut.phasesOutside, 'phase', 'phases') : '',
  ].filter(Boolean)
  if (outside.length > 0) {
    const total = leftOut.outsidePeriod + leftOut.keyDatesOutside + leftOut.phasesOutside
    const text =
      `${listText(outside)} ${total === 1 ? 'falls' : 'fall'} outside ${periodLabel(period)}, ` +
      `so ${isNot(total)} in the export.`
    // Whole plan brings back every task, but not key dates or phases outside the plan year, which never widen it.
    const fix = { label: 'Use the whole plan', action: 'plan' } as const
    const helps = leftOut.outsidePeriod > 0 && input.settings.period.preset !== 'plan'
    notices.push(helps ? { kind: 'info', text, fix } : { kind: 'info', text })
  }

  if (leftOut.archived > 0) {
    const items = leftOut.archived === 1 ? '1 item on the Timeline is' : `${leftOut.archived} items on the Timeline are`
    notices.push({ kind: 'info', text: `Archived items are never exported, so ${items} left out.` })
  }
  return notices
}

/**
 * The plan for one format (see the spec's data rules): rows are dated tasks (not milestones or phases)
 * whose bars overlap the period, or whose slip trails do (reachOf), grouped like the Timeline (groupForTimeline: subteams in board order, then
 * 'Whole team'), subtasks under parents or rolled up, optional 'Not yet scheduled' group, or summary rows in
 * summary mode. Key dates and phases come from all board items: unarchived, dated, in the period, and of the
 * whole team or a subteam shown. Archived items and items still being created (#0) never appear, nor do
 * usernames. Never reads the clock or the DOM.
 */
export function buildPlan(input: PlanInput): Plan {
  const { settings, format } = input
  const mode = settings[format].rows
  const summary = mode === 'summary'
  const columns = { ...settings[format].columns }
  // Subtasks, tasks without dates and dependency lines are for every-task mode only (and the list of tasks
  // without dates for the PDF only), whatever is remembered.
  const showSubtasks = settings.subtasks && !summary
  const canListUndated = format === 'pdf' && !summary
  const listUndated = settings.undated && canListUndated
  const links = settings.links && !summary
  const asOf = dayOf(input.today) ?? input.today

  const options = sortOptions(input.options)
  const everything = Object.values(input.allItems)
  const board: Board = {
    options,
    members: input.members,
    items: input.allItems,
    subtasks: subtaskIndex(everything),
    byNumber: new Map(everything.filter((item) => item.number > 0).map((item) => [item.number, item])),
    firstStatus: firstStatus(options),
    asOf,
    names: columns.owner,
    facts: new Map(),
  }

  // The subteams the Timeline shows, in board order (all of them when none is picked).
  const subteams = optionsFor(options, 'subteam')
  const picked = new Set(input.shownTeams)
  const shown = picked.size > 0 ? subteams.filter((option) => picked.has(option.name)) : subteams
  const boardOrder = (name: string) => {
    const index = subteams.findIndex((option) => option.name === name)
    return index < 0 ? subteams.length : index
  }
  const scopeNames = [...picked].sort((a, b) => boardOrder(a) - boardOrder(b))
  const inScope = (subteam: string | null) => !subteam || picked.size === 0 || picked.has(subteam)

  // The Timeline's tasks. Items still being created (#0) are left out without a word; archived ones are
  // counted, so the dialog can say why they are missing.
  let archived = 0
  const tasks: Item[] = []
  for (const item of [...input.items].sort(byPosition)) {
    if (item.number <= 0) continue
    if (item.archived) archived++
    else if (!item.is_milestone && !item.is_phase) tasks.push(item)
  }

  const datedRows: DatedRow[] = tasks
    .filter((task) => spanOf(task) !== null)
    .map((task) => ({ title: task.title, start: task.start_date, due: task.due_date }))
  const { period, warning } = periodFor(settings.period, asOf, datedRows)

  const dated: Item[] = []
  const undated: Item[] = []
  const outside: Item[] = []
  for (const task of tasks) {
    const reach = reachOf(board, task)
    if (!reach) undated.push(task)
    else if (overlaps(reach, period)) dated.push(task)
    else outside.push(task)
  }
  // Subtasks off: a step whose task is a row with a bar is counted in that task's 3/5 rather than shown.
  const rowIds = new Set(dated.map((task) => task.id))
  const rolledUp = (task: Item) => !showSubtasks && task.parent_id !== null && rowIds.has(task.parent_id)
  const rowTasks = dated.filter((task) => !rolledUp(task))
  const undatedTasks = undated.filter((task) => !rolledUp(task))

  // Groups as the Timeline has them, without the empty ones.
  const timeline = groupForTimeline(rowTasks, shown).groups.filter((group) => group.items.length > 0)
  const groups = timeline.map((group) => (summary ? summaryGroup(board, group) : taskGroup(board, group, showSubtasks)))
  if (listUndated && undatedTasks.length > 0) groups.push(undatedGroup(board, undatedTasks, showSubtasks))

  // The headline counts the dated rows that aren't nested subtasks (summary rows are made of the same tasks).
  const nested = new Set<string>()
  for (const group of groups) {
    if (group.undated) continue
    for (const row of group.rows) if (row.kind === 'task' && row.nested) nested.add(row.id)
  }
  const counts = headlineCounts(rowTasks.filter((task) => !nested.has(task.id)).map((task) => factsOf(board, task)))

  // The lanes: every key date and phase on the board, whatever the filter, of the whole team or a subteam
  // shown, so an export for one subteam carries no other subteam's dates.
  const lanes = everything.filter((item) => !item.archived && item.number > 0 && inScope(item.subteam))
  const allKeyDates: PlanKeyDate[] = []
  for (const item of lanes) {
    const date = item.is_milestone ? dayOf(keyDateDay(item)) : null
    if (!date) continue
    allKeyDates.push({
      id: item.id,
      number: item.number,
      title: cleanText(item.title),
      date,
      color: colorOf(board, item.subteam),
      state: keyDateState(item, statusContext(board, item)),
    })
  }
  allKeyDates.sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
  const keyDates = allKeyDates.filter((keyDate) => keyDate.date >= period.first && keyDate.date <= period.last)

  const allPhases: { item: Item; span: DateSpan }[] = []
  for (const item of lanes) {
    const span = item.is_phase && !item.is_milestone ? spanOf(item) : null
    if (span) allPhases.push({ item, span })
  }
  const phases: PlanPhase[] = allPhases
    .filter(({ span }) => overlaps(span, period))
    .sort((a, b) => a.span.start.localeCompare(b.span.start) || a.item.number - b.item.number)
    .map(({ item, span }) => ({
      id: item.id,
      number: item.number,
      title: cleanText(item.title),
      start: span.start,
      end: span.end,
      color: colorOf(board, item.subteam),
      state: phaseState(item, asOf),
    }))

  // The legend names every subteam whose colour is on the page: a group's, a key date's or a phase's.
  const laneSubteam = new Map(lanes.map((item) => [item.id, item.subteam]))
  const coloured = new Set<string | null>([
    ...timeline.map((group) => group.value),
    ...keyDates.map((keyDate) => laneSubteam.get(keyDate.id) ?? null),
    ...phases.map((phase) => laneSubteam.get(phase.id) ?? null),
  ])

  const leftOut: LeftOut = {
    outsidePeriod: outside.filter((task) => !rolledUp(task)).length,
    undated: listUndated ? 0 : undatedTasks.length,
    rolledUp: tasks.filter(rolledUp).length,
    archived,
    keyDatesOutside: allKeyDates.length - keyDates.length,
    phasesOutside: allPhases.length - phases.length,
  }

  // A step rolled into its task can hide a problem the task's own word doesn't show, in every-task mode
  // (until Subtasks is ticked) and in one row per domain alike, so only those steps are counted.
  const trouble = (f: TaskFacts) => f.flags.blocked || f.flags.overdue || f.flags.atRisk
  const hidden = dated.filter(rolledUp).map((task) => factsOf(board, task)).filter(trouble)
  const passed = allKeyDates.filter((keyDate) => keyDate.state === 'overdue')

  const filtered = input.query.trim() !== ''
  return {
    format,
    mode,
    org: ORG_LONG_NAME,
    orgShort: ORG_NAME,
    title: cleanText(settings.title) || PLAN_LABEL,
    subtitle: subtitleText({ subteams: scopeNames, summary, filtered, period }),
    asOf,
    exportedAt: input.exportedAt,
    preparedBy: cleanText(settings.preparedBy ?? input.me?.full_name ?? ''),
    note: cleanText(input.note),
    period,
    columns,
    links,
    groups,
    keyDates,
    nextKeyDate: allKeyDates.find((keyDate) => keyDate.state !== 'done' && keyDate.date >= asOf) ?? null,
    afterPeriod: allKeyDates.find((keyDate) => keyDate.date > period.last) ?? null,
    phases,
    subteams: subteams
      .filter((option) => coloured.has(option.name))
      .map((option) => ({ name: cleanText(option.name), color: option.color })),
    counts,
    leftOut,
    notices: noticesFor({ input, period, warning, canListUndated, summary, keyDates, passed, counts, leftOut, hidden }),
    // The dated groups' rows are their Timeline groups' items, in the same order.
    dependencies: links ? dependenciesOf(timeline.flatMap((group) => group.items)) : [],
    scope: { subteams: scopeNames.map(cleanText), filtered, query: cleanText(input.query) },
  }
}
