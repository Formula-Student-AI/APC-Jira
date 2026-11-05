// Filter syntax for the filter box and the views' built-in filters (GitHub Projects style):
//
//   brake pads                 free text: every word must appear in the title or description
//   "brake pads"               a phrase;  #12 or 12 also matches item number 12
//   assignee:xy12345           assignee:@me means the logged-in member
//   status:Todo  subteam:"Braking System"  label:urgent
//   priority:Normal  size:M  difficulty:D2  domain:Drawings  reviewer:@me  team-lead:xy12345 ...
//   status:Todo,"In Progress"  comma = any of these
//   -status:Done               leading minus = not
//   no:assignee  has:label     field is empty / not empty
//   is:blocked  is:archived    archived items are hidden unless the filter says is:archived
//
// Qualifiers and free text are ANDed together. Matching is case-insensitive.

import { FIELDS, type FieldKey } from '../fields'
import type { FieldOption, Item, Member } from '../types'

export interface TextTerm {
  kind: 'text'
  value: string
  negate: boolean
}

export interface Qualifier {
  kind: 'qualifier'
  /** A field key (see fields.ts), or 'no' / 'has' / 'is' */
  key: FieldKey | 'no' | 'has' | 'is'
  values: string[]
  negate: boolean
}

export type FilterToken = TextTerm | Qualifier

export interface FilterContext {
  /** Username of the logged-in member (for @me) */
  me: string | null
  members: Record<string, Member>
}

const KEY_ALIASES: Record<string, FieldKey | 'no' | 'has' | 'is'> = {
  assignee: 'assignees',
  assignees: 'assignees',
  status: 'status',
  subteam: 'subteam',
  subteams: 'subteam',
  team: 'subteam',
  subsystem: 'subteam',
  subsystems: 'subteam',
  label: 'labels',
  labels: 'labels',
  start: 'start_date',
  start_date: 'start_date',
  due: 'due_date',
  due_date: 'due_date',
  priority: 'priority',
  domain: 'domain',
  difficulty: 'difficulty',
  difficulty_level: 'difficulty',
  size: 'size',
  task_force: 'task_force',
  taskforce: 'task_force',
  safety: 'safety_related',
  safety_related: 'safety_related',
  work_package: 'work_package',
  wp: 'work_package',
  reviewer: 'reviewer',
  team_lead: 'team_lead',
  lead: 'team_lead',
  no: 'no',
  has: 'has',
  is: 'is',
}

function normalizeKey(raw: string): FieldKey | 'no' | 'has' | 'is' | null {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return KEY_ALIASES[key] ?? null
}

/** Split on whitespace outside double quotes. Quotes stay in the tokens. */
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quoted = false
  for (const ch of input) {
    if (ch === '"') quoted = !quoted
    if (!quoted && /\s/.test(ch)) {
      if (current) tokens.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

function unquote(value: string): string {
  return value.replace(/^"(.*)"$/s, '$1').replace(/"/g, '')
}

/** Split a qualifier value on commas outside quotes. */
function splitValues(raw: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted
    if (ch === ',' && !quoted) {
      values.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  values.push(current)
  return values.map((v) => unquote(v).trim()).filter(Boolean)
}

/** Index of the first ':' outside quotes, or -1. */
function colonIndex(token: string): number {
  let quoted = false
  for (let i = 0; i < token.length; i++) {
    if (token[i] === '"') quoted = !quoted
    else if (token[i] === ':' && !quoted) return i
  }
  return -1
}

export function parseFilter(input: string): FilterToken[] {
  const result: FilterToken[] = []
  for (const raw of tokenize(input)) {
    const negate = raw.length > 1 && raw.startsWith('-')
    const token = negate ? raw.slice(1) : raw
    const colon = colonIndex(token)
    if (colon > 0) {
      const key = normalizeKey(unquote(token.slice(0, colon)))
      const values = splitValues(token.slice(colon + 1))
      if (key && values.length) {
        result.push({ kind: 'qualifier', key, values, negate })
        continue
      }
    }
    const value = unquote(token).trim()
    if (value) result.push({ kind: 'text', value, negate })
  }
  return result
}

/** Join filter strings (e.g. a view's built-in filter and what the user typed). */
export function combineFilters(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

const lower = (s: string) => s.toLowerCase()

function memberMatches(username: string, value: string, ctx: FilterContext): boolean {
  const v = lower(value)
  if (v === '@me') return ctx.me !== null && username === ctx.me
  if (lower(username) === v) return true
  const name = ctx.members[username]?.full_name
  return !!name && lower(name).includes(v)
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function fieldRaw(item: Item, key: FieldKey): unknown {
  return FIELDS[key].source === 'extra' ? item.extra[key] : item[key as keyof Item]
}

function qualifierMatches(item: Item, q: Qualifier, ctx: FilterContext): boolean {
  if (q.key === 'is') {
    return q.values.some((v) => {
      const s = lower(v)
      if (s === 'blocked') return item.status === 'Blocked'
      if (s === 'archived') return item.archived
      if (s === 'open' || s === 'active') return !item.archived
      return false
    })
  }
  if (q.key === 'no' || q.key === 'has') {
    return q.values.some((v) => {
      const key = normalizeKey(v)
      if (!key || key === 'no' || key === 'has' || key === 'is') return false
      const empty = isEmptyValue(fieldRaw(item, key))
      return q.key === 'no' ? empty : !empty
    })
  }

  const def = FIELDS[q.key]
  const raw = fieldRaw(item, q.key)
  switch (def.kind) {
    case 'members': {
      const list = (raw as string[] | undefined) ?? []
      return q.values.some((v) => list.some((u) => memberMatches(u, v, ctx)))
    }
    case 'member': {
      const username = raw as string | undefined
      return !!username && q.values.some((v) => memberMatches(username, v, ctx))
    }
    case 'labels': {
      const list = ((raw as string[] | undefined) ?? []).map(lower)
      return q.values.some((v) => list.includes(lower(v)))
    }
    case 'text': {
      const text = lower(String(raw ?? ''))
      return !!text && q.values.some((v) => text.includes(lower(v)))
    }
    case 'single_select':
    case 'date': {
      const value = lower(String(raw ?? ''))
      return !!value && q.values.some((v) => value === lower(v))
    }
  }
}

function textMatches(item: Item, value: string): boolean {
  const v = lower(value)
  const numberMatch = /^#?(\d+)$/.exec(v)
  if (numberMatch && item.number === Number(numberMatch[1])) return true
  return lower(item.title).includes(v) || lower(item.description).includes(v)
}

export interface FilterDefaults {
  status?: string
  subteam?: string
  assignees?: string[]
  labels?: string[]
  extra?: Record<string, string>
}

function canonicalOption(options: FieldOption[], field: string, value: string): string | null {
  return options.find((o) => o.field === field && lower(o.name) === lower(value))?.name ?? null
}

/**
 * Field values a new item needs so it shows up in a filtered view, e.g. "assignee:@me" assigns it to
 * you and "subteam:Electrical" puts it in Electrical. Only plain, single-value qualifiers count.
 */
export function defaultsFromFilter(
  filter: string,
  ctx: FilterContext & { options: FieldOption[] },
): FilterDefaults {
  const out: FilterDefaults = {}
  const memberFor = (value: string): string | null => {
    const v = lower(value)
    if (v === '@me') return ctx.me
    return ctx.members[v] ? v : null
  }
  for (const token of parseFilter(filter)) {
    if (token.kind !== 'qualifier' || token.negate || token.values.length !== 1) continue
    const value = token.values[0]
    const key = token.key
    if (key === 'no' || key === 'has' || key === 'is') continue
    if (key === 'status' || key === 'subteam') {
      const name = canonicalOption(ctx.options, key, value)
      if (name) out[key] = name
      continue
    }
    const def = FIELDS[key]
    if (def.kind === 'members') {
      const username = memberFor(value)
      if (username) out.assignees = [...new Set([...(out.assignees ?? []), username])]
    } else if (def.kind === 'labels') {
      out.labels = [...new Set([...(out.labels ?? []), value])]
    } else if (def.source === 'extra') {
      const resolved =
        def.kind === 'single_select'
          ? canonicalOption(ctx.options, key, value)
          : def.kind === 'member'
            ? memberFor(value)
            : value
      if (resolved) out.extra = { ...out.extra, [key]: resolved }
    }
  }
  return out
}

/** Does the item match every token? Archived items only match when a token asks for is:archived. */
export function matchesFilter(item: Item, tokens: FilterToken[], ctx: FilterContext): boolean {
  const wantsArchived = tokens.some(
    (t) => t.kind === 'qualifier' && t.key === 'is' && !t.negate && t.values.some((v) => lower(v) === 'archived'),
  )
  if (item.archived && !wantsArchived) return false
  return tokens.every((t) => {
    const hit = t.kind === 'text' ? textMatches(item, t.value) : qualifierMatches(item, t, ctx)
    return t.negate ? !hit : hit
  })
}
