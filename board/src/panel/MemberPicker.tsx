// Member pickers: the item's assignees, and the searchable member list (also used for subteam leads).

import { CheckIcon } from '@primer/octicons-react'
import { useState } from 'react'
import { useAuth } from '../store/auth'
import { updateItemList, useBoard } from '../store/board'
import { useMembersList } from '../store/hooks'
import type { Item } from '../types'
import { Avatar, AvatarStack } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { arrowKeyFocus } from './dom'
import { memberName, memberRows } from './members'

interface MenuProps {
  selected: string[]
  label: string
  onToggle: (username: string, select: boolean) => void
  disabled?: boolean
}

/** Search box and a list of active members (plus any selected retired ones) to tick and untick. */
export function MemberMenu({ selected, label, onToggle, disabled = false }: MenuProps) {
  const active = useMembersList()
  const members = useBoard((s) => s.members)
  const [query, setQuery] = useState('')
  const rows = memberRows(active, members, selected, query)
  return (
    <div className="ip-member-menu" onKeyDown={arrowKeyFocus}>
      <input
        className="input"
        autoFocus
        value={query}
        placeholder="Search members"
        aria-label={`Search members for ${label}`}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="ip-member-list">
        {rows.length === 0 && <p className="muted ip-member-none">No members match.</p>}
        {rows.map((row) => (
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
              {row.retired && <span className="muted"> (retired)</span>}
            </span>
            <span className="ip-member-user">{row.username}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Assignees: several members. Changes are sent as additions/removals so nobody's change is lost. */
export function AssigneesPicker({ item }: { item: Item }) {
  const members = useBoard((s) => s.members)
  const me = useAuth((s) => s.member?.username ?? null)
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
        {() => <MemberMenu selected={item.assignees} label="Assignees" onToggle={toggle} />}
      </Dropdown>
      {me && !item.assignees.includes(me) && (
        <button type="button" className="ip-link-button" onClick={() => toggle(me, true)}>
          Assign me
        </button>
      )}
    </div>
  )
}
