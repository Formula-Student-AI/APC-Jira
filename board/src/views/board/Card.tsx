// A Jira-style card: number and priority, title, subteam (its leads in the tooltip), labels, dates and assignees.
// SortableCard is the draggable card on the board; CardBody is also shown in the drag overlay.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarIcon, PaperclipIcon } from '@primer/octicons-react'
import { memo, type KeyboardEvent } from 'react'
import { isBlocked } from '../../fields'
import { useToday } from '../../lib/clock'
import { formatDayRange, isOverdue } from '../../lib/format'
import { subteamLeads } from '../../lib/options'
import { openItem } from '../../lib/router'
import { useBoard } from '../../store/board'
import type { Item } from '../../types'
import { AvatarStack } from '../../ui/Avatar'
import { BlockedBadge } from '../../ui/BlockedBadge'
import { OptionChip } from '../../ui/OptionChip'
import { PriorityIcon } from '../../ui/PriorityIcon'
import { cx } from './boardModel'
import { justDragged } from './dnd'

interface CardProps {
  item: Item
}

function open(item: Item): void {
  // Number 0 = still being created; right after a drop the browser may still send a click.
  if (item.number > 0 && !justDragged()) openItem(item.number)
}

/** A card in a board cell: drag to move, click or Enter to open. */
export const SortableCard = memo(function SortableCard({ item }: CardProps) {
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
      <CardBody item={item} />
    </div>
  )
})

/** The card's content. `overlay` styles it as the card being carried. */
export function CardBody({ item, overlay = false }: CardProps & { overlay?: boolean }) {
  const today = useToday()
  // One string, so the card only re-renders when the lead names themselves change.
  const leads = useBoard((s) =>
    subteamLeads(s.options, item.subteam)
      .map((username) => s.members[username]?.full_name ?? username)
      .join(', '),
  )
  const attachments = useBoard((s) => s.attachments[item.id]?.length ?? 0)
  const dates = formatDayRange(item.start_date, item.due_date)
  const overdue = isOverdue(item.due_date, item.status, today)
  const hasChips = !!item.subteam || item.labels.length > 0

  return (
    <div className={cx('bcard-body', overlay && 'bcard-overlay')}>
      <div className="bcard-top">
        <span className="bcard-key">
          <span className="bcard-number">{item.number ? `#${item.number}` : '#…'}</span>
          <PriorityIcon name={item.extra.priority} />
        </span>
        {isBlocked(item) && <BlockedBadge reason={item.blocked_reason} />}
      </div>
      <p className="bcard-title">{item.title}</p>
      {hasChips && (
        <div className="bcard-chips">
          <OptionChip
            field="subteam"
            name={item.subteam}
            title={leads ? `Subteam: ${item.subteam} · Lead: ${leads}` : `Subteam: ${item.subteam}`}
          />
          {item.labels.map((label) => (
            <span key={label} className="chip chip-plain" title={`Label: ${label}`}>
              {label}
            </span>
          ))}
        </div>
      )}
      {(dates || item.assignees.length > 0 || attachments > 0) && (
        <div className="bcard-footer">
          <span className="bcard-meta">
            {dates && (
              <span className={cx('bcard-dates', overdue && 'bcard-overdue')} title={overdue ? 'Overdue' : 'Dates'}>
                <CalendarIcon size={12} />
                {dates}
              </span>
            )}
            {attachments > 0 && (
              <span className="bcard-attachments" title={`${attachments} attachment${attachments === 1 ? '' : 's'}`}>
                <PaperclipIcon size={12} />
                {attachments}
              </span>
            )}
          </span>
          <AvatarStack usernames={item.assignees} size={20} />
        </div>
      )}
    </div>
  )
}
