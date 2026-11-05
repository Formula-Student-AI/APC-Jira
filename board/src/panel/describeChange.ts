// Turns an activity entry into short sentences for the History list.

import { FIELDS, labelForChangeKey, type FieldKey } from '../fields'
import { formatDay } from '../lib/format'
import type { Activity, Member } from '../types'

const MAX = 60

function short(text: string): string {
  return text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text
}

function isMemberKey(key: string): boolean {
  return key in FIELDS && (FIELDS[key as FieldKey].kind === 'member' || FIELDS[key as FieldKey].kind === 'members')
}

function show(key: string, value: unknown, members: Record<string, Member>): string {
  if (value === null || value === undefined || value === '') return ''
  if (key === 'start_date' || key === 'due_date') return formatDay(String(value))
  if (isMemberKey(key)) return members[String(value)]?.full_name ?? String(value)
  if (key === 'blocked_by') return `#${value}`
  return short(String(value))
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** One line per change, e.g. "changed Status from Todo to In Progress". */
export function describeActivity(entry: Activity, members: Record<string, Member>): string[] {
  switch (entry.action) {
    case 'created':
      return ['created this item']
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
    } else if (key === 'blocked_reason') {
      lines.push(change.new ? 'updated why it is blocked' : 'cleared why it is blocked')
    } else if (Array.isArray(change.old) || Array.isArray(change.new)) {
      const before = asList(change.old)
      const after = asList(change.new)
      const added = after.filter((v) => !before.includes(v)).map((v) => show(key, v, members))
      const removed = before.filter((v) => !after.includes(v)).map((v) => show(key, v, members))
      const one = key === 'assignees' ? 'assignee' : key === 'labels' ? 'label' : key === 'blocked_by' ? 'blocker' : lower
      const many = key === 'assignees' ? 'assignees' : key === 'labels' ? 'labels' : key === 'blocked_by' ? 'blockers' : lower
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
