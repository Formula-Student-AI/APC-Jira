// Columns and small helpers for the table view.

import { format } from 'date-fns'
import { BLOCKED_STATUS, FIELDS, type FieldKey, type FieldKind } from '../../fields'
import { parseFilter } from '../../lib/filter'
import { parseDay } from '../../lib/format'
import type { TableViewConfig } from '../config'

export type TableColumnKey = TableViewConfig['columns'][number]

export interface TableColumn {
  key: TableColumnKey
  label: string
  /** Width in px. A growing column uses it as its minimum and shares spare room with Title on wide screens. */
  width: number
  grow: boolean
}

/** Default width per kind of field: room for the header label and a typical value. */
const KIND_WIDTHS: Record<FieldKind, number> = {
  single_select: 128,
  members: 128,
  labels: 192,
  date: 104,
}

/** Fields that need more or less room than their kind's default. */
const KEY_WIDTHS: Partial<Record<FieldKey, number>> = {
  subteam: 160,
  priority: 112,
}

export function tableColumns(keys: TableColumnKey[]): TableColumn[] {
  return keys.map((key) => {
    if (key === 'blocked_reason') return { key, label: 'Blocked reason', width: 280, grow: true }
    if (key === 'subteam_lead') return { key, label: 'Subteam lead', width: 168, grow: false }
    return { key, label: FIELDS[key].label, width: KEY_WIDTHS[key] ?? KIND_WIDTHS[FIELDS[key].kind], grow: false }
  })
}

/** Sum of the columns' widths (their minimums, for growing ones). */
export function columnsWidth(columns: TableColumn[]): number {
  return columns.reduce((sum, column) => sum + column.width, 0)
}

/** True when the view's own filter only lets blocked items through (status:Blocked or is:blocked). */
export function isBlockedView(view: TableViewConfig): boolean {
  const blocked = BLOCKED_STATUS.toLowerCase()
  return parseFilter(view.filter).some(
    (token) =>
      token.kind === 'qualifier' &&
      !token.negate &&
      token.values.length === 1 &&
      ((token.key === 'status' && token.values[0].toLowerCase() === blocked) ||
        (token.key === 'is' && token.values[0].toLowerCase() === 'blocked')),
  )
}

/** "3 blocked items", or "2 of 5 blocked items" while the filter box hides some. */
export function countText(shown: number, total: number, noun: string, filtering: boolean): string {
  const plural = (n: number) => (n === 1 ? noun : `${noun}s`)
  return filtering && shown < total ? `${shown} of ${total} ${plural(total)}` : `${shown} ${plural(shown)}`
}

/** "Alex Smith" -> "Alex" */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

/** "4 Nov", or "4 Nov 2027" outside the current year. `today` is 'YYYY-MM-DD' (from useToday). */
export function formatCellDay(value: string | null, today: string): string {
  const date = parseDay(value)
  if (!date) return ''
  const sameYear = date.getFullYear() === parseDay(today)?.getFullYear()
  return format(date, sameYear ? 'd MMM' : 'd MMM yyyy')
}
