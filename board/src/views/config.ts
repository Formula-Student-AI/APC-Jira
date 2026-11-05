// The five views, in tab order. Each follows its exported GitHub Project view
// (filter, grouping, sort and visible fields), adapted to Bristol FSAI's fields.

import type { FieldKey } from '../fields'

export type ViewId = 'self-kanban' | 'kanban' | 'timeline' | 'subteam-board' | 'blocked'

interface ViewBase {
  id: ViewId
  name: string
  /** Base filter, same syntax as the filter box (combined with what the user types). */
  filter: string
  /** A bar of subteam buttons above the view: show 'one' subteam at a time, or 'many' (see subteams.ts). */
  subteamPicker?: 'one' | 'many'
}

export interface BoardViewConfig extends ViewBase {
  layout: 'board'
  /** Field whose options are the columns. Dragging between columns changes it. */
  columnField: 'status' | 'subteam'
  /** Optional horizontal groups (GitHub "Group by"). Dragging between swimlanes changes it. */
  swimlaneField: 'status' | 'subteam' | null
}

export interface TimelineViewConfig extends ViewBase {
  layout: 'roadmap'
  /** Rows are grouped and ordered by this field (GitHub sorts this view by Subsystems). */
  groupField: 'subteam'
  /** Bars run from start_date to due_date and are coloured by subteam. */
  fields: FieldKey[]
}

export interface TableViewConfig extends ViewBase {
  layout: 'table'
  /** Columns after # and Title. subteam_lead = the leads of the item's subteam (Board settings). */
  columns: (FieldKey | 'subteam_lead' | 'blocked_reason')[]
}

export type ViewConfig = BoardViewConfig | TimelineViewConfig | TableViewConfig

export const VIEWS: ViewConfig[] = [
  {
    // GitHub "Self Kanban": board, filter assignee:@me, columns = Status
    id: 'self-kanban',
    name: 'Self Kanban',
    layout: 'board',
    filter: 'assignee:@me',
    columnField: 'status',
    swimlaneField: null,
  },
  {
    // GitHub "Kanban": board, columns = Status, swimlanes = Subsystems (now Subteam)
    id: 'kanban',
    name: 'Kanban',
    layout: 'board',
    filter: '',
    columnField: 'status',
    swimlaneField: 'subteam',
  },
  {
    // GitHub "Timeline": roadmap sorted by Subsystems (now Subteam). Show any number of subteams.
    id: 'timeline',
    name: 'Timeline',
    layout: 'roadmap',
    filter: '',
    groupField: 'subteam',
    fields: ['assignees', 'status'],
    subteamPicker: 'many',
  },
  {
    // GitHub "Subteam Board": board, columns = Subsystems (now Subteam), swimlanes = Status.
    // With one subteam picked it becomes that subteam's board: its items in Status columns.
    id: 'subteam-board',
    name: 'Subteam Board',
    layout: 'board',
    filter: '',
    columnField: 'subteam',
    swimlaneField: 'status',
    subteamPicker: 'one',
  },
  {
    // GitHub "Blocked": table, filter status:Blocked
    id: 'blocked',
    name: 'Blocked',
    layout: 'table',
    filter: 'status:Blocked',
    columns: ['assignees', 'status', 'subteam', 'subteam_lead', 'priority', 'blocked_reason'],
  },
]

export const DEFAULT_VIEW: ViewId = 'self-kanban'

export function viewById(id: string | null | undefined): ViewConfig | undefined {
  return VIEWS.find((v) => v.id === id)
}
