// Table layout (GitHub "Blocked" view): one row per item, columns from the view config.
// A row opens the item panel on click or Enter; ArrowUp/ArrowDown move between rows.
// # and Title stay pinned while the other columns scroll sideways inside the table's own container.

import { BlockedIcon, CheckCircleIcon, FilterIcon, TableIcon } from '@primer/octicons-react'
import { useId, type CSSProperties, type KeyboardEvent } from 'react'
import { FIELDS, fieldValue, isBlocked } from '../../fields'
import { useToday } from '../../lib/clock'
import { openItem, useRoute } from '../../lib/router'
import { useBoard } from '../../store/board'
import { useSubteamLeads, useViewItems } from '../../store/hooks'
import type { Item, Member } from '../../types'
import { AvatarStack } from '../../ui/Avatar'
import { DomainChip, OptionChip } from '../../ui/OptionChip'
import { PriorityIcon } from '../../ui/PriorityIcon'
import type { TableViewConfig } from '../config'
import { columnsWidth, countText, firstName, formatCellDay, isBlockedView, tableColumns, type TableColumn } from './columns'
import './table.css'

type Members = Record<string, Member>

export function TableView({ view, query }: { view: TableViewConfig; query: string }) {
  const items = useViewItems(view.filter, query)
  // Same view without the filter box, for "2 of 5" and to tell "nothing here" from "nothing matches".
  const unfiltered = useViewItems(view.filter, '')
  const members = useBoard((s) => s.members)
  const today = useToday()
  const openNumber = useRoute().item
  const headingId = useId()

  const columns = tableColumns(view.columns)
  const blockedView = isBlockedView(view)
  const filtering = query.trim() !== ''
  // Lets the table's minimum width (CSS) include every fixed column.
  const tableStyle = { '--tview-cols-w': `${columnsWidth(columns)}px` } as CSSProperties

  return (
    <div className="tview">
      <div className="tview-head">
        <h2 id={headingId} className="tview-name">
          {blockedView ? <BlockedIcon className="tview-name-blocked" /> : <TableIcon />}
          {view.name}
        </h2>
        <span className="tview-count">
          {countText(items.length, unfiltered.length, blockedView ? 'blocked item' : 'item', filtering)}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState blockedView={blockedView} nothingInView={unfiltered.length === 0} />
      ) : (
        <div className="tview-scroll">
          <table className="tview-table" aria-labelledby={headingId} style={tableStyle}>
            <colgroup>
              <col className="tview-col-num" />
              <col />
              {columns.map((column) =>
                column.grow ? (
                  <col
                    key={column.key}
                    className="tview-col-grow"
                    style={{ '--tview-col-w': `${column.width}px` } as CSSProperties}
                  />
                ) : (
                  <col key={column.key} style={{ width: column.width }} />
                ),
              )}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="tview-num" aria-label="Number">
                  #
                </th>
                <th scope="col" className="tview-title">
                  Title
                </th>
                {columns.map((column) => (
                  <th key={column.key} scope="col" title={column.label}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  item={item}
                  columns={columns}
                  members={members}
                  today={today}
                  isOpen={item.number !== 0 && item.number === openNumber}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmptyState({ blockedView, nothingInView }: { blockedView: boolean; nothingInView: boolean }) {
  if (!nothingInView) {
    return (
      <div className="empty-state tview-empty">
        <FilterIcon size={24} />
        <p>No items match the filter.</p>
      </div>
    )
  }
  return (
    <div className="empty-state tview-empty">
      {blockedView ? <CheckCircleIcon size={24} className="tview-empty-ok" /> : <TableIcon size={24} />}
      <p>{blockedView ? 'Nothing is blocked right now.' : 'No items here yet.'}</p>
    </div>
  )
}

interface TableRowProps {
  item: Item
  columns: TableColumn[]
  members: Members
  today: string
  /** The item is open in the side panel */
  isOpen: boolean
}

function TableRow({ item, columns, members, today, isOpen }: TableRowProps) {
  // Number 0 = still being created: shown, but it can't be opened yet.
  const pending = item.number === 0

  function open() {
    if (!pending) openItem(item.number)
  }

  function onClick() {
    // Finishing a text selection (e.g. copying a blocked reason) shouldn't open the item.
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && selection.toString().trim()) return
    open()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      open()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const row = event.key === 'ArrowDown' ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling
      if (row instanceof HTMLElement) {
        event.preventDefault()
        row.focus()
      }
    }
  }

  return (
    <tr
      className="tview-row"
      tabIndex={0}
      aria-current={isOpen || undefined}
      aria-disabled={pending || undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <td className="tview-num" title={pending ? 'Still being created' : undefined}>
        {pending ? '#…' : `#${item.number}`}
      </td>
      <td className="tview-title" title={item.title}>
        {item.title}
      </td>
      {columns.map((column) => (
        <TableCell key={column.key} item={item} column={column} members={members} today={today} />
      ))}
    </tr>
  )
}

interface TableCellProps {
  item: Item
  column: TableColumn
  members: Members
  today: string
}

/** One cell, drawn according to the kind of field. */
function TableCell({ item, column, members, today }: TableCellProps) {
  const { key } = column
  if (key === 'blocked_reason') {
    const reason = item.blocked_reason?.trim()
    if (reason) return <td title={reason}>{reason}</td>
    return <td className="tview-none">{isBlocked(item) ? 'No reason given' : ''}</td>
  }
  if (key === 'subteam_lead') return <LeadsCell subteam={item.subteam} members={members} />

  const value = fieldValue(item, key)
  const text = typeof value === 'string' && value !== '' ? value : null
  const list = Array.isArray(value) ? value : []

  if (key === 'priority') {
    return (
      <td title={text ?? undefined}>
        {text && (
          <span className="tview-cell">
            <PriorityIcon name={text} />
            <span className="tview-ellipsis">{text}</span>
          </span>
        )}
      </td>
    )
  }

  switch (FIELDS[key].kind) {
    case 'members':
      return <PeopleCell usernames={list} members={members} />
    case 'single_select':
      return <td>{key === 'domain' ? <DomainChip subteam={item.subteam} name={text} /> : <OptionChip field={key} name={text} />}</td>
    case 'labels':
      return (
        <td title={list.join(', ')}>
          <span className="tview-cell">
            {list.map((label) => (
              <span key={label} className="chip chip-plain">
                {label}
              </span>
            ))}
          </span>
        </td>
      )
    case 'date':
      return <td>{formatCellDay(text, today)}</td>
  }
}

/** Avatars and first names, with the full names in the tooltip. */
function PeopleCell({ usernames, members }: { usernames: string[]; members: Members }) {
  if (usernames.length === 0) return <td />
  const names = usernames.map((username) => members[username]?.full_name ?? username)
  return (
    <td title={names.join(', ')}>
      <span className="tview-cell">
        <AvatarStack usernames={usernames} />
        <span className="tview-ellipsis">{names.map(firstName).join(', ')}</span>
      </span>
    </td>
  )
}

/** The leads of the item's subteam (chosen in Board settings). */
function LeadsCell({ subteam, members }: { subteam: string | null; members: Members }) {
  const leads = useSubteamLeads(subteam)
  return <PeopleCell usernames={leads} members={members} />
}
