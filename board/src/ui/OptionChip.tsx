import { colorClass, optionColor } from '../lib/options'
import { useBoard } from '../store/board'

interface OptionChipProps {
  /** Field key, e.g. 'status', 'subteam', 'priority' */
  field: string
  name: string | null | undefined
  size?: 'sm' | 'md'
  title?: string
}

/**
 * A dropdown value shown in its option colour: a soft pill, or a Jira-style lozenge for a status.
 * Renders nothing for an empty value.
 */
export function OptionChip({ field, name, size = 'sm', title }: OptionChipProps) {
  const options = useBoard((s) => s.options)
  if (!name) return null
  const color = optionColor(options, field, name)
  const classes = ['chip', size === 'md' && 'chip-md', field === 'status' && 'chip-status', colorClass(color)]
  return (
    <span className={classes.filter(Boolean).join(' ')} title={title ?? name}>
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
