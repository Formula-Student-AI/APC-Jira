// What deleting a member changes, for the question in Board settings > Members. The database does the
// work (members_before_delete in schema.sql); this only describes it.

import type { FieldOption, Item } from '../types'

export interface MemberUse {
  /** Items the member is assigned to (archived ones too: the database takes them off those as well) */
  assigned: number
  /** Names of the subteams they lead, in board order */
  leads: string[]
}

/** The items a member is assigned to and the subteams they lead. */
export function memberUse(items: Iterable<Item>, options: FieldOption[], username: string): MemberUse {
  let assigned = 0
  for (const item of items) if (item.assignees.includes(username)) assigned++
  const leads = options.filter((o) => o.field === 'subteam' && o.leads.includes(username)).map((o) => o.name)
  return { assigned, leads }
}

/** "A", "A and B", "A, B and C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** What deleting them changes, in a sentence or two (it follows "Delete <name>?"). */
export function deletionText({ assigned, leads }: MemberUse): string {
  const changes: string[] = []
  if (assigned === 1) changes.push("be taken off the item they're assigned to")
  else if (assigned > 1) changes.push(`be taken off the ${assigned} items they're assigned to`)
  if (leads.length) changes.push(`no longer lead ${joinNames(leads)}`)
  const first = changes.length ? `They'll ${changes.join(' and ')}. ` : ''
  return `${first}Their past changes stay in the history, under their username, and any device signed in as them is signed out.`
}
