// A Jira-style card: number, title, subteam and other chips, labels, dates and assignees.
// SortableCard is the draggable card on the board; CardBody is also shown in the drag overlay.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarIcon } from '@primer/octicons-react'
import { memo, type KeyboardEvent } from 'react'
import { FIELDS, isBlocked, type FieldKey } from '../../fields'
import { useToday } from '../../lib/clock'
import { formatDayRange, isOverdue } from '../../lib/format'
import { openItem } from '../../lib/router'
import { useBoard } from '../../store/board'
import type { Item, Member } from '../../types'
import { Avatar, AvatarStack } from '../../ui/Avatar'
import { BlockedBadge } from '../../ui/BlockedBadge'
import { OptionChip } from '../../ui/OptionChip'
import { cx } from './boardModel'
import { justDragged } from './dnd'

interface CardProps {
  item: Item
  /** Extra fields from the view config (e.g. priority, size, team_lead) */
  fields: FieldKey[]
}

function open(item: Item): void {
  // Number 0 = still being created; right after a drop the browser may still send a click.
  if (item.number > 0 && !justDragged()) openItem(item.number)
}

/** A card in a board cell: drag to move, click or Enter to open. */
export const SortableCard = memo(function SortableCard({ item, fields }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: item.number === 0,
  })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      open(item)
      return
    }
    listeners?.onKeyDown?.(event)
  }

  return (
    <div
      ref={setNodeRef}
      className={cx('bcard', isDragging && 'bcard-placeholder', item.number === 0 && 'bcard-pending')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => open(item)}
    >
      <CardBody item={item} fields={fields} />
    </div>
  )
})

/** The card's content. `overlay` styles it as the card being carried. */
export function CardBody({ item, fields, overlay = false }: CardProps & { overlay?: boolean }) {
  const today = useToday()
  const members = useBoard((s) => s.members)
  const dates = formatDayRange(item.start_date, item.due_date)
  const overdue = isOverdue(item.due_date, item.status, today)
  const shownFields = fields.filter((key) => FIELDS[key].source === 'extra' && item.extra[key])
  const hasChips = !!item.subteam || shownFields.length > 0 || item.labels.length > 0

  return (
    <div className={cx('bcard-body', overlay && 'bcard-overlay')}>
      <div className="bcard-top">
        <span className="bcard-number">{item.number ? `#${item.number}` : '#…'}</span>
        {isBlocked(item) && <BlockedBadge reason={item.blocked_reason} />}
      </div>
      <p className="bcard-title">{item.title}</p>
      {hasChips && (
        <div className="bcard-chips">
          <OptionChip field="subteam" name={item.subteam} title={`Subteam: ${item.subteam}`} />
          {shownFields.map((key) => (
            <CardField key={key} field={key} value={item.extra[key] as string} members={members} />
          ))}
          {item.labels.map((label) => (
            <span key={label} className="chip chip-plain" title={`Label: ${label}`}>
              {label}
            </span>
          ))}
        </div>
      )}
      {(dates || item.assignees.length > 0) && (
        <div className="bcard-footer">
          {dates ? (
            <span className={cx('bcard-dates', overdue && 'bcard-overdue')} title={overdue ? 'Overdue' : 'Dates'}>
              <CalendarIcon size={12} />
              {dates}
            </span>
          ) : (
            <span />
          )}
          <AvatarStack usernames={item.assignees} size={20} />
        </div>
      )}
    </div>
  )
}

function CardField({ field, value, members }: { field: FieldKey; value: string; members: Record<string, Member> }) {
  const def = FIELDS[field]
  if (def.kind === 'single_select') return <OptionChip field={field} name={value} title={`${def.label}: ${value}`} />
  if (def.kind === 'member') {
    const name = members[value]?.full_name ?? value
    return (
      <span className="bcard-member" title={`${def.label}: ${name}`}>
        <Avatar username={value} size={16} />
        {name.split(' ')[0]}
      </span>
    )
  }
  return (
    <span className="bcard-text" title={`${def.label}: ${value}`}>
      {value}
    </span>
  )
}
