// Subteam members: a record of who is in which subteam. Board admins keep every subteam's in Board settings >
// Subteam members; a subteam's leads keep theirs in user menu > Subteam members. A subteam's leads are shown
// as its leads, not counted as members (Subteam leads sets them). It changes no task: when one is assigned,
// its subteam's people are only listed first. The database checks who may change what.

import { PlusIcon, XIcon } from '@primer/octicons-react'
import { useEffect, useMemo } from 'react'
import { leadRoster, notInASubteam, subteamRoster } from '../lib/subteamRoster'
import { MemberMenu } from '../panel/MemberPicker'
import { memberName } from '../panel/members'
import { setSubteamMember, useBoard } from '../store/board'
import { useIsBoardAdmin, useManagedSubteams } from '../store/hooks'
import type { FieldOption } from '../types'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { Modal } from '../ui/Modal'
import { OptionDot } from '../ui/OptionChip'
import { useSaveProblems, type SaveProblems } from './saveProblems'
import { useBusy } from './useBusy'
import './settings.css'

/** Who is in each subteam you look after (every one for a board admin), to add people to or take them out. */
export function SubteamMembersEditor({ saveProblems }: { saveProblems: SaveProblems }) {
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
        A record of who is in each subteam. Its leads are shown, not counted as members. Someone can be in more than
        one subteam. It changes no task: when you assign one, its subteam&apos;s leads and members are just listed first.
      </p>
      <ul className="settings-leads">
        {subteams.map((subteam) => (
          <SubteamMembersRow
            key={subteam.id}
            subteam={subteam}
            problem={saveProblems.problems[subteam.id] ?? null}
            report={saveProblems.report}
            watch={saveProblems.watch}
          />
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

function SubteamMembersRow({
  subteam,
  problem,
  report,
  watch,
}: {
  subteam: FieldOption
  /** Why the last change couldn't be saved (it has been put back) */
  problem: string | null
  report: SaveProblems['report']
  watch: SaveProblems['watch']
}) {
  const members = useBoard((s) => s.members)
  const rows = useBoard((s) => s.subteamMembers)
  const [busy, run] = useBusy()
  // While this row is on screen, its problems are seen here (otherwise closing the dialog toasts them).
  useEffect(() => watch(subteam.id), [watch, subteam.id])
  const usernames = useMemo(() => subteamRoster(rows, subteam, members), [rows, subteam, members])
  const leads = useMemo(() => leadRoster(subteam, members), [subteam, members])
  const toggle = (username: string, select: boolean) => {
    report(subteam.id, null)
    run(async () => report(subteam.id, await setSubteamMember(subteam.id, username, select)))
  }

  return (
    <li className="settings-lead-row">
      <div className="settings-member-team">
        <span className="settings-lead-team">
          <OptionDot field="subteam" name={subteam.name} />
          {subteam.name}
          <span className="muted settings-member-count">{usernames.length}</span>
        </span>
        {leads.length > 0 && (
          <span className="muted settings-member-leads">
            {leads.length === 1 ? 'Lead' : 'Leads'}: {leads.map((username) => memberName(members, username)).join(', ')}
          </span>
        )}
      </div>
      <div className="settings-lead-people">
        {usernames.length === 0 && <span className="muted">No members yet</span>}
        {usernames.map((username) => {
          const name = memberName(members, username)
          const retired = members[username]?.active === false
          return (
            <span key={username} className="settings-lead">
              <Avatar username={username} size={20} />
              <span className="settings-lead-name">
                {name}
                {retired && <span className="muted"> (retired)</span>}
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
            {/* Its leads aren't offered: they are its leads, not members. */}
            <MemberMenu
              selected={usernames}
              label={`${subteam.name} members`}
              disabled={busy}
              hidden={subteam.leads}
              onToggle={toggle}
            />
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
  const saveProblems = useSaveProblems()
  return (
    <Modal title="Subteam members" onClose={onClose} width={640}>
      <SubteamMembersEditor saveProblems={saveProblems} />
    </Modal>
  )
}
