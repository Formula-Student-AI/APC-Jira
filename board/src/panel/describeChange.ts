// Turns an activity entry into short sentences for the History list.

import { labelForChangeKey } from '../fields'
import { formatDay } from '../lib/format'
import type { Activity, Item, Member } from '../types'

const MAX = 60

/** Change keys whose values are usernames (Reviewer and Team lead were item fields until November 2026). */
const MEMBER_KEYS = new Set(['assignees', 'reviewer', 'team_lead'])

/** How list changes read in the history: "added assignee Sam", "removed related tasks #3 and #5". */
const LIST_WORDS: Record<string, [one: string, many: string]> = {
  assignees: ['assignee', 'assignees'],
  labels: ['label', 'labels'],
  blocked_by: ['blocker', 'blockers'],
  related_to: ['related task', 'related tasks'],
}

function short(text: string): string {
  return text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text
}

function isMemberKey(key: string): boolean {
  return MEMBER_KEYS.has(key)
}

function show(key: string, value: unknown, members: Record<string, Member>): string {
  if (value === null || value === undefined || value === '') return ''
  if (key === 'start_date' || key === 'due_date') return formatDay(String(value))
  if (isMemberKey(key)) return members[String(value)]?.full_name ?? String(value)
  if (key === 'blocked_by' || key === 'related_to') return `#${value}`
  return short(String(value))
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** "#12", or "a deleted task" for an id that no longer exists. */
function taskRef(items: Record<string, Item>, id: unknown): string {
  const item = typeof id === 'string' ? items[id] : undefined
  return item ? `#${item.number}` : 'a deleted task'
}

/**
 * One line per change, e.g. "changed Status from Todo to In Progress". `items` (by id) names a
 * subtask's parent by its number.
 */
export function describeActivity(entry: Activity, members: Record<string, Member>, items: Record<string, Item> = {}): string[] {
  switch (entry.action) {
    case 'created':
      return [entry.changes.parent_id?.new ? `created this item as a subtask of ${taskRef(items, entry.changes.parent_id.new)}` : 'created this item']
    case 'archived':
      return ['archived this item']
    case 'restored':
      return ['restored this item']
    case 'deleted':
      return ['deleted this item']
    case 'updated':
      break
  }

  const lines: string[] = []
  for (const [key, change] of Object.entries(entry.changes)) {
    const label = labelForChangeKey(key)
    const lower = label.toLowerCase()
    if (key === 'title') {
      lines.push(`renamed this from “${short(String(change.old ?? ''))}” to “${short(String(change.new ?? ''))}”`)
    } else if (key === 'description') {
      lines.push('edited the description')
    } else if (key === 'is_milestone') {
      lines.push(change.new ? 'made this a milestone' : 'stopped this being a milestone')
    } else if (key === 'is_phase') {
      lines.push(change.new ? 'made this a phase' : 'stopped this being a phase')
    } else if (key === 'parent_id') {
      if (change.new && change.old) lines.push(`moved this from ${taskRef(items, change.old)} to ${taskRef(items, change.new)}`)
      else if (change.new) lines.push(`made this a subtask of ${taskRef(items, change.new)}`)
      else lines.push(`made this a separate task (it was a subtask of ${taskRef(items, change.old)})`)
    } else if (key === 'attachments') {
      lines.push(change.new ? `added the image “${short(String(change.new))}”` : `removed the image “${short(String(change.old ?? ''))}”`)
    } else if (key === 'blocked_reason') {
      lines.push(change.new ? 'updated why it is blocked' : 'cleared why it is blocked')
    } else if (Array.isArray(change.old) || Array.isArray(change.new)) {
      const before = asList(change.old)
      const after = asList(change.new)
      const added = after.filter((v) => !before.includes(v)).map((v) => show(key, v, members))
      const removed = before.filter((v) => !after.includes(v)).map((v) => show(key, v, members))
      const [one, many] = LIST_WORDS[key] ?? [lower, lower]
      if (added.length) lines.push(`added ${added.length > 1 ? many : one} ${joinNames(added)}`)
      if (removed.length) lines.push(`removed ${removed.length > 1 ? many : one} ${joinNames(removed)}`)
      if (!added.length && !removed.length) lines.push(`reordered ${lower}`)
    } else {
      const before = show(key, change.old, members)
      const after = show(key, change.new, members)
      if (!before && after) lines.push(`set ${label} to ${after}`)
      else if (before && !after) lines.push(`cleared ${label}`)
      else lines.push(`changed ${label} from ${before} to ${after}`)
    }
  }
  return lines.length ? lines : ['updated this item']
}
