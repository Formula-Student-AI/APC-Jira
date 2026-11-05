import { useId, useMemo, useState, type FormEvent } from 'react'
import { combineFilters, defaultsFromFilter } from '../lib/filter'
import { navigate, type Route } from '../lib/router'
import { useAuth } from '../store/auth'
import { createItem, useBoard } from '../store/board'
import { useFieldOptions } from '../store/hooks'
import type { NewItem } from '../types'
import { Modal } from '../ui/Modal'
import type { ViewConfig } from '../views/config'

/**
 * "+ New item". Starts with whatever the current view and filter imply (e.g. assigned to you on
 * Self Kanban) so the new item shows up where you are; then opens it in the side panel.
 */
export function NewItemDialog({ route, view, onClose }: { route: Route; view: ViewConfig; onClose: () => void }) {
  const me = useAuth((s) => s.member?.username ?? null)
  const members = useBoard((s) => s.members)
  const options = useBoard((s) => s.options)
  const statusOptions = useFieldOptions('status')
  const subteamOptions = useFieldOptions('subteam')
  const defaults = useMemo(
    () => defaultsFromFilter(combineFilters(view.filter, route.q), { me, members, options }),
    [view.filter, route.q, me, members, options],
  )
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState(defaults.status ?? statusOptions[0]?.name ?? '')
  const [subteam, setSubteam] = useState(defaults.subteam ?? '')
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
    if (defaults.assignees) input.assignees = defaults.assignees
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
        {defaults.assignees?.includes(me ?? '') && (
          <p className="muted hdr-newform-note">It will be assigned to you, so it shows up in this view.</p>
        )}
      </form>
    </Modal>
  )
}
