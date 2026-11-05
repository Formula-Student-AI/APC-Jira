import { differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

/** "Test Alpha" -> "TA", "Sam" -> "SA" */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Parse a 'YYYY-MM-DD' column value as a local date. */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = parseISO(value)
  return isValid(date) ? date : null
}

/** Date -> 'YYYY-MM-DD' */
export function toDay(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** "4 Nov", or "4 Nov 2027" when not this year. */
export function formatDay(value: string | null | undefined): string {
  const date = parseDay(value)
  if (!date) return ''
  return date.getFullYear() === new Date().getFullYear() ? format(date, 'd MMM') : format(date, 'd MMM yyyy')
}

/** "4 Nov – 20 Dec", "From 4 Nov", "Due 20 Dec", or '' */
export function formatDayRange(start: string | null, due: string | null): string {
  if (start && due) return `${formatDay(start)} – ${formatDay(due)}`
  if (start) return `From ${formatDay(start)}`
  if (due) return `Due ${formatDay(due)}`
  return ''
}

/** True when the due date is before `today` ('YYYY-MM-DD') and the item isn't done. */
export function isOverdue(due: string | null, status: string, today: string): boolean {
  const dueDate = parseDay(due)
  const todayDate = parseDay(today)
  if (!dueDate || !todayDate || status === 'Done') return false
  return differenceInCalendarDays(dueDate, todayDate) < 0
}

/** "5 minutes ago" */
export function timeAgo(iso: string): string {
  const date = parseISO(iso)
  return isValid(date) ? `${formatDistanceToNowStrict(date)} ago` : ''
}

/** "4 Nov 2026, 21:40" */
export function formatDateTime(iso: string): string {
  const date = parseISO(iso)
  return isValid(date) ? format(date, 'd MMM yyyy, HH:mm') : ''
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return String(error)
}
