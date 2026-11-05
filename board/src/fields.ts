// Field definitions: what each field is called, where it is stored and how it is edited.
// Dropdown options themselves live in the field_options table (managed by board admins).

import type { Item } from './types'

export type FieldKind = 'single_select' | 'text' | 'member' | 'members' | 'labels' | 'date'

export interface FieldDef {
  key: FieldKey
  label: string
  kind: FieldKind
  /** 'column' = a real items column; 'extra' = stored in items.extra[key] */
  source: 'column' | 'extra'
}

export type ColumnFieldKey = 'status' | 'subteam' | 'assignees' | 'labels' | 'start_date' | 'due_date'
export type CustomFieldKey =
  | 'priority'
  | 'domain'
  | 'difficulty'
  | 'size'
  | 'task_force'
  | 'safety_related'
  | 'work_package'
  | 'reviewer'
  | 'team_lead'
export type FieldKey = ColumnFieldKey | CustomFieldKey

export const FIELDS: Record<FieldKey, FieldDef> = {
  status: { key: 'status', label: 'Status', kind: 'single_select', source: 'column' },
  subteam: { key: 'subteam', label: 'Subteam', kind: 'single_select', source: 'column' },
  assignees: { key: 'assignees', label: 'Assignees', kind: 'members', source: 'column' },
  labels: { key: 'labels', label: 'Labels', kind: 'labels', source: 'column' },
  start_date: { key: 'start_date', label: 'Start date', kind: 'date', source: 'column' },
  due_date: { key: 'due_date', label: 'Due date', kind: 'date', source: 'column' },
  priority: { key: 'priority', label: 'Priority', kind: 'single_select', source: 'extra' },
  domain: { key: 'domain', label: 'Domain', kind: 'single_select', source: 'extra' },
  difficulty: { key: 'difficulty', label: 'Difficulty level', kind: 'single_select', source: 'extra' },
  size: { key: 'size', label: 'Size', kind: 'single_select', source: 'extra' },
  task_force: { key: 'task_force', label: 'Task force', kind: 'single_select', source: 'extra' },
  safety_related: { key: 'safety_related', label: 'Safety related', kind: 'single_select', source: 'extra' },
  work_package: { key: 'work_package', label: 'Work package', kind: 'text', source: 'extra' },
  reviewer: { key: 'reviewer', label: 'Reviewer', kind: 'member', source: 'extra' },
  team_lead: { key: 'team_lead', label: 'Team lead', kind: 'member', source: 'extra' },
}

/** Custom fields in the order the item panel shows them. */
export const CUSTOM_FIELDS: CustomFieldKey[] = [
  'priority',
  'size',
  'difficulty',
  'domain',
  'task_force',
  'safety_related',
  'work_package',
  'reviewer',
  'team_lead',
]

/** Field keys whose options come from field_options. */
export const SELECT_FIELDS = ['status', 'subteam', 'priority', 'domain', 'difficulty', 'size', 'task_force', 'safety_related'] as const
export type SelectFieldKey = (typeof SELECT_FIELDS)[number]

export const BLOCKED_STATUS = 'Blocked'

/** Read any field's value from an item (custom fields come from item.extra). */
export function fieldValue(item: Item, key: FieldKey): string | string[] | null {
  const def = FIELDS[key]
  if (def.source === 'extra') return item.extra[key] ?? null
  const value = item[key as ColumnFieldKey]
  return value ?? null
}

export function isBlocked(item: Item): boolean {
  return item.status === BLOCKED_STATUS
}

/** Human label for an activity change key (column names and custom field keys). */
export function labelForChangeKey(key: string): string {
  if (key in FIELDS) return FIELDS[key as FieldKey].label
  const special: Record<string, string> = {
    title: 'Title',
    description: 'Description',
    blocked_reason: 'Blocked reason',
    blocked_by: 'Blocked by',
    archived: 'Archived',
    legacy_assignees: 'Legacy assignees',
    github_url: 'GitHub link',
    github_item_id: 'GitHub item',
  }
  return special[key] ?? key.replace(/_/g, ' ')
}
