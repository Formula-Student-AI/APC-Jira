// Member pickers: the item's assignees, and the searchable member list (also used for subteam leads and
// members, and for a new item's assignees).

import { CheckIcon } from '@primer/octicons-react'
import { useId, useState } from 'react'
import type { SubteamPerson } from '../lib/subteamRoster'
import { useAuth } from '../store/auth'
import { updateItemList, useBoard } from '../store/board'
import { useMembersList, useSubteamPeople } from '../store/hooks'
import type { Item } from '../types'
import { Avatar, AvatarStack } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { arrowKeyFocus } from './dom'
import { groupMemberRows, memberName, memberRows, type MemberRow } from './members'

/** People to list first, under their own heading: say a task's subteam (its leads, then its members). */
export interface MemberGroup {
  label: string
  people: readonly SubteamPerson[]
}

interface MenuProps {
  selected: string[]
  label: string
  onToggle: (username: string, select: boolean) => void
  disabled?: boolean
  /** People not offered (say a subteam's leads, when choosing its members), unless already chosen */
  hidden?: readonly string[]
  /** People listed first, under their own heading, before everyone else */
  group?: MemberGroup
}

/**
 * Search box and a list of active members (plus any selected retired ones) to tick and untick; with a
 * `group`, its people come first, under its name, then everyone else.
 */
export function MemberMenu({ selected, label, onToggle, disabled = false, hidden = [], group }: MenuProps) {
  const active = useMembersList()
  const members = useBoard((s) => s.members)
  const [query, setQuery] = useState('')
  const headingId = useId()
  const hide = new Set(hidden)
  const rows = memberRows(active, members, selected, query).filter((row) => row.selected || !hide.has(row.username))
  const { first, rest } = groupMemberRows(rows, group?.people.map((person) => person.username) ?? [])
  const leads = new Set(group?.people.filter((person) => person.lead).map((person) => person.username))
  const option = (row: MemberRow) => (
    <button
      key={row.username}
      type="button"
      className="menu-item"
      aria-pressed={row.selected}
      disabled={disabled}
      onClick={() => onToggle(row.username, !row.selected)}
    >
      <span className="ip-check">{row.selected && <CheckIcon size={14} />}</span>
      <Avatar username={row.username} size={20} />
      <span className="ip-member-name">
        {row.name}
        {leads.has(row.username) && <span className="muted"> (lead)</span>}
        {row.retired && <span className="muted"> (retired)</span>}
      </span>
      <span className="ip-member-user">{row.username}</span>
    </button>
  )
  return (
    <div className="ip-member-menu" onKeyDown={arrowKeyFocus}>
      <input
        className="input"
        autoFocus
        value={query}
        placeholder="Search members"
        aria-label={`Search members for ${label}`}
        onChange={(event) => setQuery(event.target.value)}
        // Inside a form (New item), Enter here mustn't send it.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
        }}
      />
      <div className="ip-member-list">
        {rows.length === 0 && <p className="muted ip-member-none">No members match.</p>}
        {group && first.length > 0 ? (
          <>
            <div role="group" aria-labelledby={`${headingId}-first`}>
              <p id={`${headingId}-first`} className="ip-member-group">
                {group.label}
              </p>
              {first.map(option)}
            </div>
            {rest.length > 0 && (
              <div role="group" aria-labelledby={`${headingId}-rest`}>
                <p id={`${headingId}-rest`} className="ip-member-group">
                  Everyone else
                </p>
                {rest.map(option)}
              </div>
            )}
          </>
        ) : (
          rows.map(option)
        )}
      </div>
    </div>
  )
}

/** Assignees: several members. Changes are sent as additions/removals so nobody's change is lost. */
export function AssigneesPicker({ item }: { item: Item }) {
  const members = useBoard((s) => s.members)
  const me = useAuth((s) => s.member?.username ?? null)
  // The task's subteam's people (its leads, then its members) are listed first.
  const people = useSubteamPeople(item.subteam)
  const group = item.subteam && people.length ? { label: item.subteam, people } : undefined
  const names = item.assignees.map((username) => memberName(members, username))
  const toggle = (username: string, select: boolean) =>
    void updateItemList(item.id, 'assignees', select ? { add: [username] } : { remove: [username] })

  return (
    <div className="ip-picker">
      <Dropdown
        label={
          item.assignees.length ? (
            <span className="ip-people">
              <AvatarStack usernames={item.assignees} max={4} />
              <span className="ip-people-names">{names.join(', ')}</span>
            </span>
          ) : (
            <span className="muted">No one</span>
          )
        }
        ariaLabel={`Assignees: ${names.join(', ') || 'no one'}. Change`}
        buttonClassName="ip-picker-button"
        width={320}
      >
        {() => <MemberMenu selected={item.assignees} label="Assignees" onToggle={toggle} group={group} />}
      </Dropdown>
      {me && !item.assignees.includes(me) && (
        <button type="button" className="ip-link-button" onClick={() => toggle(me, true)}>
          Assign me
        </button>
      )}
    </div>
  )
}
