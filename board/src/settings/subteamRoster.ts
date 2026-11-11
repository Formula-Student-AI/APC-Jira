// Who is in which subteam, as lists for Board settings > Subteam members: a subteam's members by name, and
// the active members who aren't in any subteam yet. Only a record: it changes no task.

import type { FieldOption, Member, SubteamMember } from '../types'

const nameOf = (members: Record<string, Member>, username: string) => members[username]?.full_name ?? username

const byName = (members: Record<string, Member>) => (a: string, b: string) =>
  nameOf(members, a).localeCompare(nameOf(members, b), 'en-GB', { sensitivity: 'base' }) || a.localeCompare(b)

/** The usernames in subteam `subteam` (its option id), by name: board members only (a deleted one is gone). */
export function subteamRoster(rows: readonly SubteamMember[], subteam: string, members: Record<string, Member>): string[] {
  const usernames = new Set(rows.filter((row) => row.subteam === subteam && Object.hasOwn(members, row.username)).map((row) => row.username))
  return [...usernames].sort(byName(members))
}

/** Active members in no subteam that still exists, by name: who is still to be put in one. */
export function notInASubteam(members: Record<string, Member>, rows: readonly SubteamMember[], options: readonly FieldOption[]): string[] {
  const subteams = new Set(options.filter((option) => option.field === 'subteam').map((option) => option.id))
  const placed = new Set(rows.filter((row) => subteams.has(row.subteam)).map((row) => row.username))
  return Object.values(members)
    .filter((member) => member.active && !placed.has(member.username))
    .map((member) => member.username)
    .sort(byName(members))
}
