// Subteam members: a record of who is in which subteam. Board admins keep every subteam's in Board settings >
// Subteam members; a subteam's leads keep theirs in user menu > Subteam members. It changes no task: who is
// assigned to what, and who leads a subteam, stay as they are. The database checks who may change what.

import { PlusIcon, XIcon } from '@primer/octicons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MemberMenu } from '../panel/MemberPicker'
import { memberName } from '../panel/members'
import { pushToast, setSubteamMember, useBoard } from '../store/board'
import { useIsBoardAdmin, useManagedSubteams } from '../store/hooks'
import type { FieldOption } from '../types'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { Modal } from '../ui/Modal'
import { OptionDot } from '../ui/OptionChip'
import { notInASubteam, subteamRoster } from './subteamRoster'
import { useBusy } from './useBusy'
import './settings.css'

/** Who is in each subteam you look after (every one for a board admin), to add people to or take them out. */
export function SubteamMembersEditor() {
  const subteams = useManagedSubteams()
  const admin = useIsBoardAdmin()
  const rows = useBoard((s) => s.subteamMembers)
  const members = useBoard((s) => s.members)
  const options = useBoard((s) => s.options)
  const unassigned = useMemo(() => (admin ? notInASubteam(members, rows, options) : []), [admin, members, rows, options])

  if (subteams.length === 0) {
    return (
      <p className="muted settings-help">
        {admin
          ? 'There are no subteams yet. Add them under Dropdown options.'
          : "You don't lead a subteam any more, so there is no one for you to add."}
      </p>
    )
  }
  return (
    <div className="settings-section">
      <p className="muted settings-help">
        A record of who is in each subteam. It changes no task: who is assigned to what, and who leads a subteam,
        stay as they are. Someone can be in more than one subteam.
      </p>
      <ul className="settings-leads">
        {subteams.map((subteam) => (
          <SubteamMembersRow key={subteam.id} subteam={subteam} />
        ))}
      </ul>
      {unassigned.length > 0 && (
        <p className="muted settings-help settings-unassigned">
          Not in a subteam yet: {unassigned.map((username) => memberName(members, username)).join(', ')}.
        </p>
      )}
    </div>
  )
}

function SubteamMembersRow({ subteam }: { subteam: FieldOption }) {
  const members = useBoard((s) => s.members)
  const rows = useBoard((s) => s.subteamMembers)
  const [busy, run] = useBusy()
  // Why the last change couldn't be saved (it has been put back): shown under the row, and in the Add members
  // menu while that is open over it, as a toast would be hidden behind the dialog. If the row is gone by the
  // time the answer comes (the dialog was closed, say), a toast says it instead.
  const [problem, setProblem] = useState<string | null>(null)
  const shown = useRef(false)
  useEffect(() => {
    shown.current = true
    return () => {
      shown.current = false
    }
  }, [])
  const usernames = useMemo(() => subteamRoster(rows, subteam.id, members), [rows, subteam.id, members])
  const toggle = (username: string, select: boolean) => {
    setProblem(null)
    run(async () => {
      const reason = await setSubteamMember(subteam.id, username, select)
      if (shown.current) setProblem(reason)
      else if (reason) pushToast('error', reason)
    })
  }

  return (
    <li className="settings-lead-row">
      <span className="settings-lead-team">
        <OptionDot field="subteam" name={subteam.name} />
        {subteam.name}
        <span className="muted settings-member-count">{usernames.length}</span>
      </span>
      <div className="settings-lead-people">
        {usernames.length === 0 && <span className="muted">No one yet</span>}
        {usernames.map((username) => {
          const name = memberName(members, username)
          const retired = members[username]?.active === false
          return (
            <span key={username} className="settings-lead">
              <Avatar username={username} size={20} />
              <span className="settings-lead-name">
                {name}
                {retired && <span className="muted"> (retired)</span>}
                {subteam.leads.includes(username) && <span className="muted"> (lead)</span>}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Take ${name} out of ${subteam.name}`}
                disabled={busy}
                onClick={() => toggle(username, false)}
              >
                <XIcon size={14} />
              </button>
            </span>
          )
        })}
      </div>
      <Dropdown
        label={
          <>
            <PlusIcon /> Add members
          </>
        }
        ariaLabel={`Choose who is in ${subteam.name}`}
        buttonClassName="btn btn-sm"
        align="right"
        width={320}
      >
        {() => (
          <>
            {/* The menu covers the row's own copy below; that one is the alert screen readers announce. */}
            {problem && <p className="field-error settings-menu-error">{problem}</p>}
            <MemberMenu selected={usernames} label={`${subteam.name} members`} disabled={busy} onToggle={toggle} />
          </>
        )}
      </Dropdown>
      {problem && (
        <p className="field-error settings-lead-error" role="alert">
          {problem}
        </p>
      )}
    </li>
  )
}

/** "Subteam members" from the user menu, for subteam leads who aren't board admins. */
export function SubteamMembersDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Subteam members" onClose={onClose} width={640}>
      <SubteamMembersEditor />
    </Modal>
  )
}
