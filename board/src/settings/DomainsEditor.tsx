// Subteam domains: each subteam's own list (e.g. Electrical: LV systems, Accumulator). Board admins edit
// every subteam's in Board settings > Domains; a subteam's leads edit theirs in user menu > Subteam
// domains. The database checks who may change what.

import { useId, useMemo, useState } from 'react'
import { nextDomainColor } from '../lib/options'
import { memberName } from '../panel/members'
import { useBoard } from '../store/board'
import { useDomainSubteams, useIsBoardAdmin } from '../store/hooks'
import { Modal } from '../ui/Modal'
import { OptionDot } from '../ui/OptionChip'
import { AddOptionForm, OptionRow } from './OptionEditor'
import './settings.css'

/** Add, rename, recolour, reorder and delete the domains of the subteams you may manage. */
export function DomainsEditor() {
  const subteams = useDomainSubteams()
  const admin = useIsBoardAdmin()
  const options = useBoard((s) => s.options)
  const members = useBoard((s) => s.members)
  // The subteam shown stays put (even if another subteam is added or moved first) until you pick another,
  // or it stops being yours to manage.
  const [pickedId, setPickedId] = useState<string | null>(() => subteams[0]?.id ?? null)
  const selectId = useId()
  const subteam = subteams.find((option) => option.id === pickedId) ?? subteams[0]
  const domains = useMemo(
    () => (subteam ? options.filter((o) => o.field === 'domain' && o.parent_id === subteam.id) : []),
    [options, subteam],
  )

  if (!subteam) {
    return (
      <p className="muted settings-help">
        {admin
          ? 'There are no subteams yet. Add them under Dropdown options.'
          : "You don't lead a subteam any more, so there are no domains for you to change."}
      </p>
    )
  }

  const leads = subteam.leads.map((username) => memberName(members, username))
  return (
    <div className="settings-section">
      <p className="muted settings-help">
        Each subteam has its own domains, e.g. LV systems or Accumulator for Electrical. A task can have one of its
        subteam's domains (Domain, in the task's panel). Renaming a domain updates its tasks, and a domain still in
        use can't be deleted. A task moved to another subteam loses its domain, unless that subteam has one with the
        same name.
      </p>
      <div className="settings-row">
        <label className="field-label" htmlFor={selectId}>
          Subteam
        </label>
        {subteams.length > 1 ? (
          <select
            id={selectId}
            className="select settings-field"
            value={subteam.id}
            onChange={(event) => setPickedId(event.target.value)}
          >
            {subteams.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : (
          <output id={selectId} className="settings-domain-team">
            <OptionDot field="subteam" name={subteam.name} />
            {subteam.name}
          </output>
        )}
      </div>
      <p className="muted settings-help">
        {leads.length > 0
          ? `Looked after by ${joinNames(leads)} (${leads.length > 1 ? 'its leads' : 'its lead'}) and the board admins.`
          : 'No lead yet, so only board admins can change these. Choose leads under Subteam leads.'}
      </p>
      {domains.length > 0 ? (
        <ul className="settings-options" aria-label={`${subteam.name} domains`}>
          {domains.map((option, index) => (
            // Keyed by name too, so a rename from elsewhere resets the row's text box.
            <OptionRow key={`${option.id}:${option.name}`} option={option} first={index === 0} last={index === domains.length - 1} />
          ))}
        </ul>
      ) : (
        <p className="muted settings-help">{subteam.name} has no domains yet.</p>
      )}
      <AddOptionForm
        key={subteam.id}
        field="domain"
        parentId={subteam.id}
        noun={`${subteam.name} domain`}
        defaultColor={nextDomainColor(domains, subteam.color)}
      />
    </div>
  )
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Subteam domains" from the user menu, for subteam leads who aren't board admins. */
export function DomainsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Subteam domains" onClose={onClose} width={640}>
      <DomainsEditor />
    </Modal>
  )
}
