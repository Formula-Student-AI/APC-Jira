// The plan the Timeline export draws: everything that decides what is on the pages, worked out from the
// board by buildPlan (exportPlan.ts) before any layout. Plain data: no measuring, no drawing, no clock.
// layoutDocument (exportLayout.ts) turns it into pages; the dialog shows its counts and notices.

import type { OptionColor } from '../../../types'
import type { ColumnChoice, ExportFormat, RowsMode } from './exportSettings'

/** Whole days, inclusive, as 'YYYY-MM-DD'. */
export interface Period {
  first: string
  last: string
}

/** A run of days, inclusive, as 'YYYY-MM-DD'. */
export interface DateSpan {
  start: string
  end: string
}

/** The six plain words stakeholders see instead of the board's workflow statuses. */
export type TaskWord = 'Not started' | 'In progress' | 'Done' | 'Blocked' | 'Overdue' | 'At risk'

/** How far the work has got, without the two warnings (Overdue, At risk) that the word puts first. The four
 *  never overlap, so counts of them add up; a bar's fill (hollow, tinted, solid) follows the stage. */
export type TaskStage = 'Not started' | 'In progress' | 'Done' | 'Blocked'

/** What a bar is marked with. Blocked and Overdue can both be set (the word then says Blocked). */
export interface Flags {
  blocked: boolean
  overdue: boolean
  atRisk: boolean
}

export interface Progress {
  done: number
  total: number
}

export interface PlanTaskRow {
  kind: 'task'
  id: string
  number: number
  /** As cleaned by cleanText */
  title: string
  /** A subtask shown just under its parent (Subtasks ticked) */
  nested: boolean
  /** A subtask shown without its parent: the parent's title, for "· part of …"; otherwise null */
  partOf: string | null
  /** A task with unarchived subtasks (on the whole board): drawn in weight 500, ending "3/5" */
  progress: Progress | null
  start: string | null
  due: string | null
  word: TaskWord
  /** The stage behind the word: an overdue task that never started is drawn hollow, one under way tinted */
  stage: TaskStage
  flags: Flags
  /** First assignee's full name plus "+N" ('' when nobody: the layout shows "—") */
  owner: string
  /** The subteam's colour; null for whole-team tasks (drawn navy) */
  color: OptionColor | null
}

/** Summary mode ("One row per domain"): a subteam row, then one row per domain it uses. */
export interface PlanSummaryRow {
  kind: 'summary'
  level: 'subteam' | 'domain'
  key: string
  /** The subteam's name, the domain's name, or 'General' for tasks with no domain */
  name: string
  color: OptionColor | null
  /** Subteam rows with Owner ticked: the leads' full names ("Jane Smith +1"); otherwise '' */
  lead: string
  /** The row's task bars merged (gaps under a week closed); the layout clips them to the period */
  spans: DateSpan[]
  /** First start and last due date of the row's tasks */
  first: string | null
  last: string | null
  done: number
  total: number
  overdue: number
  blocked: number
  atRisk: number
}

export type PlanRow = PlanTaskRow | PlanSummaryRow

export interface GroupCounts {
  tasks: number
  done: number
  blocked: number
  overdue: number
  atRisk: number
}

export interface PlanGroup {
  key: string
  /** A subteam's name, 'Whole team' (tasks with no subteam) or 'Not yet scheduled' (tasks without dates) */
  name: string
  color: OptionColor | null
  /** With Owner ticked, the subteam's leads ("Jane Smith +1"); otherwise '' */
  lead: string
  counts: GroupCounts
  /** First start to last due of its task rows, for the summary bar; null for the undated group */
  span: DateSpan | null
  rows: PlanRow[]
  /** The 'Not yet scheduled' group: rows without bars, "No dates yet" in the chart */
  undated: boolean
}

export type KeyDateState = 'upcoming' | 'done' | 'overdue' | 'atRisk'

/** A milestone, shown in the Key dates lane (never as a row). */
export interface PlanKeyDate {
  id: string
  number: number
  title: string
  /** Its due date, else its start date */
  date: string
  /** null: a whole-team key date (navy) */
  color: OptionColor | null
  state: KeyDateState
}

export type PhaseState = 'finished' | 'now' | 'upcoming'

/** A phase, shown in the Phases lane (never as a row). */
export interface PlanPhase {
  id: string
  number: number
  title: string
  start: string
  end: string
  color: OptionColor | null
  state: PhaseState
}

/** Over the export's task rows that aren't nested subtasks. Done, In progress, Not started and Blocked don't
 *  overlap (Blocked counts tasks whose word is Blocked); Overdue and At risk are counted as flags. */
export interface PlanCounts {
  tasks: number
  done: number
  inProgress: number
  notStarted: number
  blocked: number
  overdue: number
  atRisk: number
}

/** What the export leaves out, so the dialog can say so (nothing is dropped silently). */
export interface LeftOut {
  /** Dated tasks wholly outside the period */
  outsidePeriod: number
  /** Tasks without dates, when Tasks without dates isn't ticked */
  undated: number
  /** Subtasks rolled into their parent's row, when Subtasks isn't ticked */
  rolledUp: number
  /** Archived items among the Timeline's items (e.g. with is:archived) */
  archived: number
  keyDatesOutside: number
  phasesOutside: number
}

export type NoticeFix = 'summary' | 'a3' | 'plan' | 'subtasks' | 'undated'

export interface Notice {
  kind: 'info' | 'warning'
  /** A plain sentence */
  text: string
  /** A one-click fix the dialog can offer, e.g. { label: 'Use one row per domain', action: 'summary' } */
  fix?: { label: string; action: NoticeFix }
}

export interface Plan {
  format: ExportFormat
  mode: RowsMode
  /** ORG_LONG_NAME, for the eyebrow */
  org: string
  /** ORG_NAME, for the footer and file name */
  orgShort: string
  title: string
  /** e.g. 'Timeline · Mechanical and Electrical · selected tasks · Sep 2026 – Aug 2027' */
  subtitle: string
  /** The as-of date, 'YYYY-MM-DD' (today) */
  asOf: string
  /** ISO time of the export, for the footer */
  exportedAt: string
  /** '' leaves the line out */
  preparedBy: string
  /** '' when empty (page 1 only) */
  note: string
  period: Period
  columns: ColumnChoice
  /** Dependency lines are drawn */
  links: boolean
  groups: PlanGroup[]
  /** In the period, by date */
  keyDates: PlanKeyDate[]
  /** The next key date on or after the as-of date that isn't done (for the title block), even outside the period */
  nextKeyDate: PlanKeyDate | null
  /** The first key date after the period ends, noted at the right edge of the lane */
  afterPeriod: PlanKeyDate | null
  /** In the period, by start date */
  phases: PlanPhase[]
  /** The subteams shown, in board order, for the legend's swatches */
  subteams: { name: string; color: OptionColor }[]
  counts: PlanCounts
  leftOut: LeftOut
  notices: Notice[]
  /** Dependencies between task rows (only when links is on); the layout draws those whose rows share a page */
  dependencies: { from: number; to: number; clash: boolean }[]
  /** What the Timeline was showing, for the dialog's scope line (never printed as filter syntax) */
  scope: { subteams: string[]; filtered: boolean; query: string }
}
