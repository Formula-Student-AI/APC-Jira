// Rows for the member pickers.

import type { Member } from '../types'

export interface MemberRow {
  username: string
  name: string
  selected: boolean
  /** Chosen earlier but retired (or no longer a member): listed so they can still be removed. */
  retired: boolean
}

/** Full name of a member, or the username when they aren't known. */
export function memberName(members: Record<string, Member>, username: string): string {
  return members[username]?.full_name ?? username
}

/**
 * Active members (already sorted by name), then any selected people who are no longer active,
 * filtered by `query` (matches the full name or the username).
 */
export function memberRows(
  active: Member[],
  members: Record<string, Member>,
  selected: string[],
  query: string,
): MemberRow[] {
  const chosen = new Set(selected)
  const rows: MemberRow[] = active.map((m) => ({
    username: m.username,
    name: m.full_name,
    selected: chosen.has(m.username),
    retired: false,
  }))
  const listed = new Set(rows.map((row) => row.username))
  for (const username of selected) {
    if (!listed.has(username)) {
      rows.push({ username, name: memberName(members, username), selected: true, retired: true })
    }
  }
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) => row.name.toLowerCase().includes(q) || row.username.toLowerCase().includes(q))
}

/**
 * Splits picker rows into the people to offer `first`, in that order (say a subteam's leads, then its
 * members), and everyone else, in the order given.
 */
export function groupMemberRows(rows: readonly MemberRow[], first: readonly string[]): { first: MemberRow[]; rest: MemberRow[] } {
  const byUsername = new Map(rows.map((row) => [row.username, row]))
  const firstRows = [...new Set(first)].flatMap((username) => byUsername.get(username) ?? [])
  const taken = new Set(firstRows.map((row) => row.username))
  return { first: firstRows, rest: rows.filter((row) => !taken.has(row.username)) }
}
