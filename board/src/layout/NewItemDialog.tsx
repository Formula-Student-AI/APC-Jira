import { CheckIcon, PlusIcon } from '@primer/octicons-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { combineFilters, defaultsFromFilter } from '../lib/filter'
import { navigate, type Route } from '../lib/router'
import { MemberMenu } from '../panel/MemberPicker'
import { memberName } from '../panel/members'
import { joinNames } from '../settings/memberDeletion'
import { useAuth } from '../store/auth'
import { createItem, useBoard } from '../store/board'
import { useFieldOptions, useSubteamPeople } from '../store/hooks'
import type { NewItem } from '../types'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'
import type { ViewConfig } from '../views/config'
import { filterWithSubteams, useShownSubteams } from '../views/subteams'

/**
 * "+ New item". Starts with whatever the current view and filter imply (e.g. assigned to you on
 * Self Kanban) so the new item shows up where you are; then opens it in the side panel. Once a subteam is
 * chosen, its people (its leads, then its members) are there to assign it to.
 */
export function NewItemDialog({ route, view, onClose }: { route: Route; view: ViewConfig; onClose: () => void }) {
  const me = useAuth((s) => s.member?.username ?? null)
  const members = useBoard((s) => s.members)
  const options = useBoard((s) => s.options)
  const statusOptions = useFieldOptions('status')
  const subteamOptions = useFieldOptions('subteam')
  // A subteam picked in the subteam bar counts too, so the new item lands where you are looking.
  const shownTeams = useShownSubteams(view, route.teams)
  const defaults = useMemo(
    () => defaultsFromFilter(combineFilters(filterWithSubteams(view, shownTeams), route.q), { me, members, options }),
    [view, shownTeams, route.q, me, members, options],
  )
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState(defaults.status ?? statusOptions[0]?.name ?? '')
  const [subteam, setSubteam] = useState(defaults.subteam ?? '')
  const [assignees, setAssignees] = useState<string[]>(defaults.assignees ?? [])
  // People the view's filter asks for (assignee:@me on Self Kanban, say) who have been unticked: without them,
  // the new item won't show up where you are.
  const unticked = (defaults.assignees ?? []).filter((username) => !assignees.includes(username))
  const [busy, setBusy] = useState(false)
  const formId = useId()
  const titleId = useId()
  const statusId = useId()
  const subteamId = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = title.trim()
    if (!text || busy) return
    setBusy(true)
    const input: NewItem = { title: text, subteam: subteam || null }
    if (status) input.status = status
    if (assignees.length) input.assignees = assignees
    if (defaults.labels) input.labels = defaults.labels
    if (defaults.extra) input.extra = defaults.extra
    const created = await createItem(input)
    setBusy(false)
    if (created) {
      onClose()
      navigate({ item: created.number })
    }
  }

  return (
    <Modal
      title="New item"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy && <span className="spinner" aria-hidden="true" />}
            Create
          </button>
        </>
      }
    >
      <form id={formId} className="hdr-newform" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="field-label" htmlFor={titleId}>
            Title
          </label>
          <input
            id={titleId}
            className="input"
            autoFocus
            data-autofocus
            maxLength={300}
            value={title}
            placeholder="What needs doing?"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="hdr-newform-row">
          <div>
            <label className="field-label" htmlFor={statusId}>
              Status
            </label>
            <select id={statusId} className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={subteamId}>
              Subteam
            </label>
            <select id={subteamId} className="select" value={subteam} onChange={(event) => setSubteam(event.target.value)}>
              <option value="">No subteam</option>
              {subteamOptions.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <AssigneesChoice subteam={subteam} assignees={assignees} onChange={setAssignees} />
        {unticked.length > 0 ? (
          <p className="muted hdr-newform-note">
            Without {joinNames(unticked.map((username) => (username === me ? 'you' : memberName(members, username))))}{' '}
            assigned, it won&apos;t show up in this view.
          </p>
        ) : (
          me &&
          defaults.assignees?.includes(me) && (
            <p className="muted hdr-newform-note">It will be assigned to you, so it shows up in this view.</p>
          )
        )}
      </form>
    </Modal>
  )
}

/**
 * Who the new item is assigned to: the chosen subteam's people (its leads, then its members) and anyone
 * already chosen, each a button to tick, and "Someone else" for the rest of the board. That list opens in
 * place, not as a pop-up menu, which this short dialog's scrolling body would cut off.
 */
function AssigneesChoice({ subteam, assignees, onChange }: { subteam: string; assignees: string[]; onChange: (next: string[]) => void }) {
  const members = useBoard((s) => s.members)
  const people = useSubteamPeople(subteam)
  const labelId = useId()
  const listId = useId()
  const [choosing, setChoosing] = useState(false)
  const chooseButton = useRef<HTMLButtonElement>(null)
  // Everyone chosen here keeps a chip, so unticking one leaves it in place (keeping focus) to tick again.
  const [kept, setKept] = useState<string[]>(assignees)
  const offered = people.map((person) => person.username)
  const shown = [...offered, ...kept.filter((username) => !offered.includes(username))]
  const leads = new Set(people.filter((person) => person.lead).map((person) => person.username))
  const toggle = (username: string, select: boolean) => {
    if (select && !kept.includes(username)) setKept([...kept, username])
    onChange(select ? [...assignees.filter((u) => u !== username), username] : assignees.filter((u) => u !== username))
  }

  // While the list is open, Escape closes it, not the dialog, wherever focus is: a click on a name or a heading
  // can leave focus outside the list (Safari doesn't focus clicked buttons).
  useEffect(() => {
    if (!choosing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setChoosing(false)
      chooseButton.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [choosing])

  return (
    <div>
      <span className="field-label" id={labelId}>
        Assignees
      </span>
      <div className="hdr-newform-people" role="group" aria-labelledby={labelId}>
        {shown.map((username) => {
          const chosen = assignees.includes(username)
          return (
            <button
              key={username}
              type="button"
              className="hdr-person"
              aria-pressed={chosen}
              onClick={() => toggle(username, !chosen)}
            >
              <Avatar username={username} size={20} />
              <span className="hdr-person-name">{memberName(members, username)}</span>
              {leads.has(username) && <span className="muted">lead</span>}
              {chosen && <CheckIcon size={14} className="hdr-person-check" />}
            </button>
          )
        })}
        <button
          ref={chooseButton}
          type="button"
          className="btn btn-sm"
          aria-expanded={choosing}
          aria-controls={choosing ? listId : undefined}
          onClick={() => setChoosing((open) => !open)}
        >
          <PlusIcon /> {shown.length ? 'Someone else' : 'Choose people'}
        </button>
      </div>
      {subteam && !people.length && (
        <p className="muted hdr-newform-note hdr-newform-hint">No one is listed in {subteam} yet (Subteam members).</p>
      )}
      {choosing && (
        <div id={listId} className="hdr-newform-picker">
          <MemberMenu
            selected={assignees}
            label="Assignees"
            onToggle={toggle}
            group={subteam && people.length ? { label: subteam, people } : undefined}
          />
        </div>
      )}
    </div>
  )
}
