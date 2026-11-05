import { ArrowSwitchIcon, ChevronDownIcon, GearIcon, PencilIcon } from '@primer/octicons-react'
import { useId, useState, type FormEvent } from 'react'
import { BoardSettingsDialog } from '../settings/BoardSettingsDialog'
import { errorText, setMyName, switchUser } from '../store/auth'
import { useHasBoardAdminRole, useIsBoardAdmin, useMe } from '../store/hooks'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { Modal } from '../ui/Modal'

/** The signed-in member: name, board admin status, "Edit my name", "Board settings" and "Switch user". */
export function UserMenu() {
  const member = useMe()
  const adminActive = useIsBoardAdmin()
  const adminRole = useHasBoardAdminRole()
  const [dialog, setDialog] = useState<'name' | 'settings' | null>(null)
  if (!member) return null

  return (
    <>
      <Dropdown
        label={
          <>
            <Avatar username={member.username} size={24} />
            <span className="hdr-user-name">{member.full_name}</span>
            <ChevronDownIcon size={12} />
          </>
        }
        ariaLabel={`Signed in as ${member.full_name}. Account menu`}
        buttonClassName="btn btn-ghost hdr-user"
        align="right"
        width={290}
      >
        {(close) => (
          <div>
            <div className="hdr-user-info">
              <strong>{member.full_name}</strong>
              <span className="muted">{member.email}</span>
              {adminRole && <span className="badge hdr-admin-badge">Board admin</span>}
              {adminRole && !adminActive && (
                <span className="muted hdr-admin-note">
                  Board admin tools need a verified sign-in, or the board owner can allow them. See the README.
                </span>
              )}
            </div>
            <div className="menu-divider" />
            <button type="button" className="menu-item" onClick={() => { close(); setDialog('name') }}>
              <PencilIcon /> Edit my name
            </button>
            {adminActive && (
              <button type="button" className="menu-item" onClick={() => { close(); setDialog('settings') }}>
                <GearIcon /> Board settings
              </button>
            )}
            <button type="button" className="menu-item" onClick={() => { close(); void switchUser() }}>
              <ArrowSwitchIcon /> Switch user
            </button>
          </div>
        )}
      </Dropdown>
      {dialog === 'name' && <EditNameDialog current={member.full_name} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <BoardSettingsDialog onClose={() => setDialog(null)} />}
    </>
  )
}

function EditNameDialog({ current, onClose }: { current: string; onClose: () => void }) {
  const [name, setName] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formId = useId()
  const inputId = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await setMyName(name)
      onClose()
    } catch (problem) {
      setError(errorText(problem))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Edit my name"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy || !name.trim()}>
            Save
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)}>
        <label className="field-label" htmlFor={inputId}>
          Full name
        </label>
        <input
          id={inputId}
          className="input"
          autoFocus
          maxLength={100}
          value={name}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
        />
        {error && <p className="field-error">{error}</p>}
      </form>
    </Modal>
  )
}
