// Who is in which subteam: a subteam's leads and its members (a lead is listed as a lead, not counted as a
// member), the active members in no subteam yet, and the people to offer first when assigning a task in a
// subteam. Only a record, which suggests people: it changes no task.

import type { FieldOption, Member, SubteamMember } from '../types'

type Subteam = Pick<FieldOption, 'id' | 'leads'>

const nameOf = (members: Record<string, Member>, username: string) => members[username]?.full_name ?? username

const byName = (members: Record<string, Member>) => (a: string, b: string) =>
  nameOf(members, a).localeCompare(nameOf(members, b), 'en-GB', { sensitivity: 'base' }) || a.localeCompare(b)

/** A subteam's leads who are board members, by name. */
export function leadRoster(subteam: Pick<FieldOption, 'leads'>, members: Record<string, Member>): string[] {
  return [...new Set(subteam.leads.filter((username) => Object.hasOwn(members, username)))].sort(byName(members))
}

/**
 * A subteam's members, by name: board members only (a deleted one is gone), and not its leads, who are listed
 * as its leads instead of being counted as members.
 */
export function subteamRoster(rows: readonly SubteamMember[], subteam: Subteam, members: Record<string, Member>): string[] {
  const leads = new Set(subteam.leads)
  const usernames = new Set(
    rows
      .filter((row) => row.subteam === subteam.id && Object.hasOwn(members, row.username) && !leads.has(row.username))
      .map((row) => row.username),
  )
  return [...usernames].sort(byName(members))
}

/** Active members who neither lead nor are in a subteam that still exists, by name: who is still to be put in one. */
export function notInASubteam(members: Record<string, Member>, rows: readonly SubteamMember[], options: readonly FieldOption[]): string[] {
  const subteams = options.filter((option) => option.field === 'subteam')
  const ids = new Set(subteams.map((subteam) => subteam.id))
  const placed = new Set([
    ...rows.filter((row) => ids.has(row.subteam)).map((row) => row.username),
    ...subteams.flatMap((subteam) => subteam.leads),
  ])
  return Object.values(members)
    .filter((member) => member.active && !placed.has(member.username))
    .map((member) => member.username)
    .sort(byName(members))
}

export interface SubteamPerson {
  username: string
  lead: boolean
}

/**
 * The people of a subteam to offer first when assigning one of its tasks: its active leads, then its active
 * members, each by name. None for no subteam.
 */
export function subteamPeople(subteam: Subteam | undefined, rows: readonly SubteamMember[], members: Record<string, Member>): SubteamPerson[] {
  if (!subteam) return []
  const active = (username: string) => members[username]?.active === true
  return [
    ...leadRoster(subteam, members).filter(active).map((username) => ({ username, lead: true })),
    ...subteamRoster(rows, subteam, members).filter(active).map((username) => ({ username, lead: false })),
  ]
}
