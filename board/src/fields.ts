// Field definitions: what each field is called, where it is stored and how it is edited.
// Dropdown options themselves live in the field_options table (managed by board admins; each subteam's
// domains also by that subteam's leads).

import type { Item } from './types'

export type FieldKind = 'single_select' | 'members' | 'labels' | 'date'

export interface FieldDef {
  key: FieldKey
  label: string
  kind: FieldKind
  /** 'column' = a real items column; 'extra' = stored in items.extra[key] */
  source: 'column' | 'extra'
}

export type ColumnFieldKey = 'status' | 'subteam' | 'domain' | 'assignees' | 'labels' | 'start_date' | 'due_date'
export type CustomFieldKey = 'priority'
export type FieldKey = ColumnFieldKey | CustomFieldKey

export const FIELDS: Record<FieldKey, FieldDef> = {
  status: { key: 'status', label: 'Status', kind: 'single_select', source: 'column' },
  subteam: { key: 'subteam', label: 'Subteam', kind: 'single_select', source: 'column' },
  // Each subteam has its own domains (field_options with field 'domain' and the subteam as parent).
  domain: { key: 'domain', label: 'Domain', kind: 'single_select', source: 'column' },
  assignees: { key: 'assignees', label: 'Assignees', kind: 'members', source: 'column' },
  labels: { key: 'labels', label: 'Labels', kind: 'labels', source: 'column' },
  start_date: { key: 'start_date', label: 'Start date', kind: 'date', source: 'column' },
  due_date: { key: 'due_date', label: 'Due date', kind: 'date', source: 'column' },
  priority: { key: 'priority', label: 'Priority', kind: 'single_select', source: 'extra' },
}

/** Fields whose options board admins manage in Board settings > Dropdown options (domains have their own tab). */
export const SELECT_FIELDS = ['status', 'subteam', 'priority'] as const
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

/** Human label for an activity change key (column names, custom fields, and fields removed since). */
export function labelForChangeKey(key: string): string {
  if (key in FIELDS) return FIELDS[key as FieldKey].label
  const special: Record<string, string> = {
    title: 'Title',
    description: 'Description',
    blocked_reason: 'Blocked reason',
    blocked_by: 'Blocked by',
    related_to: 'Relates to',
    is_milestone: 'Milestone',
    is_phase: 'Phase',
    archived: 'Archived',
    legacy_assignees: 'Legacy assignees',
    github_url: 'GitHub link',
    github_item_id: 'GitHub item',
    difficulty: 'Difficulty level',
    size: 'Size',
    task_force: 'Task force',
    safety_related: 'Safety related',
    work_package: 'Work package',
    reviewer: 'Reviewer',
    team_lead: 'Team lead',
  }
  return special[key] ?? key.replace(/_/g, ' ')
}
