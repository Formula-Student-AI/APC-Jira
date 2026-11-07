import { colorClass, findDomain, optionColor } from '../lib/options'
import { useBoard } from '../store/board'

interface OptionChipProps {
  /** Field key, e.g. 'status', 'subteam', 'priority' */
  field: string
  name: string | null | undefined
  size?: 'sm' | 'md'
  title?: string
  /** Read out before the value by screen readers, e.g. "Subteam" (where nothing else says what it is) */
  label?: string
}

/**
 * A dropdown value shown in its option colour: a soft pill, or a Jira-style lozenge for a status.
 * Renders nothing for an empty value.
 */
export function OptionChip({ field, name, size = 'sm', title, label }: OptionChipProps) {
  const options = useBoard((s) => s.options)
  if (!name) return null
  const color = optionColor(options, field, name)
  const classes = ['chip', size === 'md' && 'chip-md', field === 'status' && 'chip-status', colorClass(color)]
  return (
    <span className={classes.filter(Boolean).join(' ')} title={title ?? name}>
      {label && <span className="sr-only">{label}: </span>}
      {name}
    </span>
  )
}

/**
 * An item's domain as a pill, like its subteam's. The colour is looked up within the subteam, since two
 * subteams can have a domain of the same name. Renders nothing when there is no domain.
 */
export function DomainChip({ subteam, name }: { subteam: string | null; name: string | null }) {
  const color = useBoard((s) => findDomain(s.options, subteam, name)?.color ?? 'GRAY')
  if (!name) return null
  return (
    <span className={`chip ${colorClass(color)}`} title={`Domain: ${name}`}>
      <span className="sr-only">Domain: </span>
      {name}
    </span>
  )
}

/** Just the coloured dot of an option (used in column headers and dropdown lists). */
export function OptionDot({ field, name }: { field: string; name: string | null | undefined }) {
  const options = useBoard((s) => s.options)
  const color = optionColor(options, field, name)
  return <span className={`chip-dot ${colorClass(color)}`} aria-hidden="true" />
}
