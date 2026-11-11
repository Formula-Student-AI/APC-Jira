// Text for the Timeline export: cleaning user text, fitting and wrapping it with an injected measure, and
// the export's date, name, list, file-name and summary wording. Pure: no DOM and no clock (dates are passed
// in), so formatDay, which reads the clock, isn't reused.

import { format, isSameYear } from 'date-fns'
import { formatDateTime, parseDay } from '../../../lib/format'
import { memberName } from '../../../panel/members'
import { joinNames } from '../../../settings/memberDeletion'
import type { Member } from '../../../types'
import { needsYear, periodLabel } from './exportPeriod'
import type { SheetId } from './exportSheets'
import { cleanText, fitsWidth, newSegmenter, splitGraphemes } from './exportTextCore'
import type { Period, Plan, PlanPhase } from './planTypes'
import type { FontSpec, Measure } from './scene'

// cleanText and splitGraphemes, with their descriptions, are in exportTextCore.ts so that exportPeriod.ts
// can use them without the two modules importing each other; they are exported from here with the rest.
export { cleanText, splitGraphemes }

const ELLIPSIS = '…'

/** The largest n from 0 to `max` for which `fitsAt(n)` holds, when it holds for every n up to some point. */
function largestFitting(max: number, fitsAt: (n: number) => boolean): number {
  let lo = 0
  let hi = max
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fitsAt(mid)) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * One line that fits `maxWidth` points: the text itself, or cut between graphemes and ended with '…'.
 * Measures with 3% slack (a width counts as width × 1.03). Returns '' when not even '…' fits.
 */
export function fitLine(text: string, maxWidth: number, font: FontSpec, measure: Measure): string {
  if (fitsWidth(text, maxWidth, font, measure)) return text
  if (!fitsWidth(ELLIPSIS, maxWidth, font, measure)) return ''
  const graphemes = splitGraphemes(text)
  // A space just before the ellipsis would look like a gap, so it goes.
  const cut = (count: number) => `${graphemes.slice(0, count).join('').trimEnd()}${ELLIPSIS}`
  return cut(largestFitting(graphemes.length - 1, (count) => fitsWidth(cut(count), maxWidth, font, measure)))
}

const words = newSegmenter('word')

/** Scripts written without spaces, where a line may break between any two words. */
const NO_SPACES =
  /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}\u3000-\u303f\uff00-\uffef]/u
/** Never at the start of a line, even after a space: closing brackets and quotes, stops, commas and dashes
 *  ('4 Nov –' ends a line, so a range wraps after its dash), full-width ones too, and the Japanese marks that
 *  belong to the word before. */
const NOT_FIRST = /^[\p{Pe}\p{Pf}!%,.:;?\u2013\u2014\u2026\u3001\u3002\u3005\u30fb\u30fc\uff01\uff0c\uff0e\uff1a\uff1b\uff1f]/u
/** Never at the end of a line: opening brackets and quotes. */
const NOT_LAST = /[\p{Ps}\p{Pi}]$/u
/** Inside a word, a line may break after these when a letter follows: 'state-of-the-art', 'and/or'. */
const BREAK_AFTER = /^[-\u2010/]$/
const LETTER = /^\p{L}/u

/** A run of text a line never breaks inside (unless it is longer than a whole line). */
interface Piece {
  text: string
  /** A space comes before it, which disappears when the line breaks there */
  space: boolean
}

/** Whether a line may break before `segment`, which follows `previous` (or a space) at the end of `before`. */
function canBreak(before: string, previous: string, segment: string, space: boolean): boolean {
  if (NOT_FIRST.test(segment) || NOT_LAST.test(before)) return false
  if (space) return true
  if (NO_SPACES.test(previous) || NO_SPACES.test(segment)) return true
  return BREAK_AFTER.test(previous) && LETTER.test(segment) && before.length > previous.length
}

/** The text in pieces between the places a line may break: at spaces, and between words in Chinese,
 *  Japanese, Thai and other scripts written without them. */
function linePieces(text: string): Piece[] {
  // Without Intl.Segmenter, lines break at spaces only; a long run of Chinese then breaks between graphemes.
  if (!words) return text.split(/\s+/u).filter(Boolean).map((word, i) => ({ text: word, space: i > 0 }))
  const pieces: Piece[] = []
  let space = false
  let previous = ''
  for (const { segment } of words.segment(text)) {
    if (segment.trim() === '') {
      space = true
      previous = ''
      continue
    }
    const last = pieces.at(-1)
    if (last && !canBreak(last.text, previous, segment, space)) last.text += `${space ? ' ' : ''}${segment}`
    else pieces.push({ text: segment, space: space && last !== undefined })
    space = false
    previous = segment
  }
  return pieces
}

const joinPieces = (pieces: Piece[]) =>
  pieces.map((piece, i) => `${i > 0 && piece.space ? ' ' : ''}${piece.text}`).join('')

/**
 * Up to `maxLines` lines, broken between words (Intl.Segmenter word granularity, falling back to spaces; a
 * word longer than a line is broken between graphemes). If the text doesn't fit, the last line ends with
 * '…'. Same 3% slack as fitLine. Returns [''] for empty text and never more than maxLines lines.
 */
export function wrapLines(text: string, maxWidth: number, font: FontSpec, measure: Measure, maxLines: number): string[] {
  const limit = maxLines >= 1 ? Math.floor(maxLines) : 1
  const pieces = linePieces(text)
  if (pieces.length === 0) return ['']
  const fits = (line: string) => fitsWidth(line, maxWidth, font, measure)
  const rest = (from: number) => fitLine(joinPieces(pieces.slice(from)), maxWidth, font, measure)
  const lines: string[] = []
  let line = ''
  let i = 0
  while (i < pieces.length) {
    // The last line takes whatever is left, ending with '…' if that doesn't fit.
    if (lines.length === limit - 1) return [...lines, rest(i)]
    const piece = pieces[i]
    const longer = line ? `${line}${piece.space ? ' ' : ''}${piece.text}` : piece.text
    if (fits(longer)) {
      line = longer
      i++
    } else if (line) {
      lines.push(line)
      line = ''
    } else {
      // A word longer than a whole line: as much of it as fits, and the rest starts the next line. Rather than
      // start that line with a closing mark (or end this one on an opening mark), a grapheme moves down too.
      const graphemes = splitGraphemes(piece.text)
      let count = largestFitting(graphemes.length, (n) => fits(graphemes.slice(0, n).join('')))
      if (count === 0) return [...lines, rest(i)]
      while (count > 1 && (NOT_FIRST.test(graphemes[count]) || NOT_LAST.test(graphemes[count - 1]))) count--
      lines.push(graphemes.slice(0, count).join(''))
      pieces[i] = { text: graphemes.slice(count).join(''), space: false }
    }
  }
  return [...lines, line]
}

/** '15 Dec', or '15 Dec 2026' with the year. English month names whatever the browser's locale. */
export function formatDayShort(day: string, withYear: boolean): string {
  const date = parseDay(day)
  return date ? format(date, withYear ? 'd MMM yyyy' : 'd MMM') : ''
}

/**
 * The board's range wording for a task in a period: '4 Nov – 20 Dec', 'Due 20 Dec', 'From 4 Nov', or ''.
 * Years are added when needsYear (exportPeriod.ts) says so for either date; a range within one year then
 * shows it once ('14 Jan – 3 Mar 2027'), and a range across years shows both ('20 Dec 2026 – 14 Jan 2027').
 */
export function formatRange(start: string | null, due: string | null, period: Period): string {
  const startDate = parseDay(start)
  const dueDate = parseDay(due)
  if (start && startDate && due && dueDate) {
    if (!needsYear(start, period) && !needsYear(due, period)) {
      return `${formatDayShort(start, false)} – ${formatDayShort(due, false)}`
    }
    return `${formatDayShort(start, !isSameYear(startDate, dueDate))} – ${formatDayShort(due, true)}`
  }
  if (start && startDate) return `From ${formatDayShort(start, needsYear(start, period))}`
  if (due && dueDate) return `Due ${formatDayShort(due, needsYear(due, period))}`
  return ''
}

/**
 * A summary row's dates in months: 'Sep – Jul', or one month alone ('Sep'). Years follow formatRange's
 * rule: when needsYear says so for either date, once within one year ('Jan – Mar 2027'), else both
 * ('Sep 2026 – Jul 2027').
 */
export function formatMonthRange(first: string | null, last: string | null, period: Period): string {
  const days = [first, last].flatMap((day) => {
    const date = parseDay(day)
    return day && date ? [{ day, date }] : []
  })
  if (days.length === 0) return ''
  const from = days[0]
  const to = days[days.length - 1]
  const withYear = days.some(({ day }) => needsYear(day, period))
  const end = format(to.date, withYear ? 'MMM yyyy' : 'MMM')
  if (format(from.date, 'yyyy-MM') === format(to.date, 'yyyy-MM')) return end
  return `${format(from.date, withYear && !isSameYear(from.date, to.date) ? 'MMM yyyy' : 'MMM')} – ${end}`
}

/** The as-of date in full: '10 November 2026'. */
export function formatAsOf(day: string): string {
  const date = parseDay(day)
  return date ? format(date, 'd MMMM yyyy') : ''
}

/** The time of export in local time: '10 Nov 2026, 14:32'. */
export function formatStamp(iso: string): string {
  // The board's own date-and-time wording, which takes the time as an argument rather than reading the clock.
  return formatDateTime(iso)
}

/**
 * Owner text: the first known assignee's full name plus '+N' for the other known ones ('Jane Smith +2',
 * 'Jane Smith'), or '' when nobody is assigned. Unknown or deleted members are left out, never shown as a
 * username. Names are cleaned with cleanText.
 */
export function ownerText(usernames: string[], members: Record<string, Member>): string {
  // Only members with a name, as memberName falls back to the username for anyone else.
  const names = [...new Set(usernames)]
    .filter((username) => Object.hasOwn(members, username) && typeof members[username].full_name === 'string')
    .map((username) => cleanText(memberName(members, username)))
    .filter((name) => name !== '')
  if (names.length === 0) return ''
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
}

/** Strong right-to-left letters: Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan and Mandaic with their
 *  presentation forms, and the right-to-left scripts beyond the BMP. */
const RIGHT_TO_LEFT = /[֐-ࣿיִ-﷿ﹰ-ﻼ]|[\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/u

/**
 * Text set apart from what is drawn around it (between U+2068 and U+2069), so the numbers and words after a
 * right-to-left name keep their place: without it, the '15' of 'Next key date: <name>, 15 Dec 2026' is
 * drawn on the far side of the name. Text without right-to-left letters comes back as it is. Apply it last,
 * after fitting: cleanText removes these marks.
 */
export function isolate(text: string): string {
  return RIGHT_TO_LEFT.test(text) ? `⁨${text}⁩` : text
}

/** An owner as ownerText writes it ('Name +2', possibly shortened), with the name set apart (isolate). */
export function isolateOwner(owner: string): string {
  const match = /^(.*?)( \+\d+)?$/u.exec(owner)
  return match ? `${isolate(match[1])}${match[2] ?? ''}` : isolate(owner)
}

function newListFormat(): Intl.ListFormat | null {
  try {
    if (typeof Intl.ListFormat !== 'function') return null
    return new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' })
  } catch {
    return null
  }
}

const lists = newListFormat()

/** 'Mechanical', 'Mechanical and Electrical', 'Mechanical, Electrical and Admin' (Intl.ListFormat en-GB, with a fallback). */
export function listText(names: string[]): string {
  // Without Intl.ListFormat, the board's own joining gives the same British wording (no comma before 'and').
  return lists ? lists.format(names) : joinNames(names)
}

export interface SubtitleScope {
  /** The subteams picked on the Timeline; none means all of them */
  subteams: string[]
  /** One row per domain */
  summary: boolean
  /** Something is typed in the filter box */
  filtered: boolean
  period: Period
}

/**
 * The automatic subtitle stating the scope: 'Timeline', then 'All subteams' or the subteams shown, then
 * 'summary by domain' and 'selected tasks' when they apply, then the period, joined with ' · ':
 * 'Timeline · Mechanical and Electrical · selected tasks · Sep 2026 – Aug 2027'.
 */
export function subtitleText(scope: SubtitleScope): string {
  return [
    'Timeline',
    scope.subteams.length > 0 ? listText(scope.subteams.map(cleanText)) : 'All subteams',
    scope.summary ? 'summary by domain' : '',
    scope.filtered ? 'selected tasks' : '',
    periodLabel(scope.period),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Characters Windows refuses in a file name that part one thing from another: they become hyphens. */
const SEPARATORS = /[\\/:]/g
/** The other characters Windows refuses in a file name: they are removed. */
const NOT_IN_FILE_NAMES = /[*?"<>|]/g
/** Hyphen, figure and en dashes, em dash, horizontal bar and minus. */
const DASHES = /[\u2010-\u2015\u2212]/g
const FILE_NAME_MAX = 100

function fileNamePart(text: string): string {
  return cleanText(text)
    .replace(/\s*:\s+/g, ' - ')
    .replace(SEPARATORS, '-')
    .replace(NOT_IN_FILE_NAMES, '')
    .replace(DASHES, '-')
    .replace(/-{2,}/g, '-')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** At most `max` UTF-16 units of `text`, cut between graphemes so no emoji or accent is broken. */
function cutToLength(text: string, max: number): string {
  if (text.length <= max) return text
  let kept = ''
  for (const grapheme of splitGraphemes(text)) {
    if (kept.length + grapheme.length > max) break
    kept += grapheme
  }
  return kept
}

/**
 * The file name without extension: '<org> <title> - Timeline - 2026-11-10' ('Bristol FSAI 2026–27 Plan -
 * Timeline - 2026-11-10'); the org is left out when the title already starts with it. Of the characters
 * Windows forbids, \ / and : become hyphens ('2026/27' gives '2026-27', 'Update: Q3' gives 'Update - Q3') and
 * * ? " < > | are removed, as are control characters; dashes (– —) become hyphens, spaces are collapsed,
 * trailing dots and spaces dropped, at most 100 characters. Other Unicode is kept.
 */
export function exportFileName(org: string, title: string, asOf: string): string {
  const name = fileNamePart(title)
  const prefix = fileNamePart(org)
  const named = prefix && !name.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix} ${name}` : name
  const tail = ['Timeline', fileNamePart(asOf)].filter(Boolean).join(' - ')
  // A long title is shortened rather than the date, which tells one month's export from the next.
  const head = cutToLength(named.trim(), FILE_NAME_MAX - tail.length - 3).replace(/[\s.-]+$/u, '')
  return head ? `${head} - ${tail}` : tail
}

const count = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/** The top-level tasks listed under Not yet scheduled (0 when that group isn't listed). */
export function unscheduledCount(plan: Plan): number {
  return Math.max(0, plan.groups.find((group) => group.undated)?.counts.tasks ?? 0)
}

/**
 * '48 tasks in 5 subteams and the whole team', '3 tasks in 1 subteam', '2 tasks for the whole team', 'no
 * tasks', with ', 2 not yet scheduled' when tasks without dates are listed. Subteams are those the tasks
 * are in: not the legend's list, which also has subteams with only a key date or a phase.
 */
function tasksPhrase(plan: Plan): string {
  const { tasks } = plan.counts
  const unscheduled = unscheduledCount(plan)
  const later = unscheduled > 0 ? `${unscheduled} not yet scheduled` : ''
  if (tasks === 0) return later ? `no scheduled tasks, ${later}` : 'no tasks'
  const dated = plan.groups.filter((group) => !group.undated)
  const subteams = dated.filter((group) => group.key !== 'none').length
  const wholeTeam = dated.some((group) => group.key === 'none')
  const where =
    subteams > 0
      ? ` in ${count(subteams, 'subteam')}${wholeTeam ? ' and the whole team' : ''}`
      : wholeTeam
        ? ' for the whole team'
        : ''
  return [`${count(tasks, 'task')}${where}`, later].filter(Boolean).join(', ')
}

/**
 * The dialog's status line, e.g. '3 pages, A4 landscape. 48 tasks in 5 subteams, 6 key dates, 3 phases.'
 * (for slides: '1 slide, 16:9.'). Counts of zero are left out after the tasks.
 */
export function statusSentence(plan: Plan, pageCount: number, sheet: SheetId): string {
  const pages =
    sheet === 'slide'
      ? `${count(pageCount, 'slide')}, 16:9.`
      : `${count(pageCount, 'page')}, ${sheet.toUpperCase()} landscape.`
  const tasks = tasksPhrase(plan)
  const parts = [`${tasks.charAt(0).toUpperCase()}${tasks.slice(1)}`]
  if (plan.keyDates.length > 0) parts.push(count(plan.keyDates.length, 'key date'))
  if (plan.phases.length > 0) parts.push(count(plan.phases.length, 'phase'))
  return `${pages} ${parts.join(', ')}.`
}

/**
 * Alt text for a slide image, in sentences: what it shows, the period, the headline counts, the current
 * phase and the next key date, e.g. 'Gantt chart of the Bristol Formula Student AI 2026–27 Plan, Sep 2026 to
 * Aug 2027, as of 10 November 2026: 48 tasks in 5 subteams, 12 done, 3 blocked, 2 overdue. Current phase:
 * Detailed design, until 20 Dec. Next key date: Design freeze, 15 Dec 2026.'
 */
export function altText(plan: Plan): string {
  const title = cleanText(plan.title)
  const org = cleanText(plan.org)
  const named = [plan.org, plan.orgShort]
    .map((name) => cleanText(name).toLowerCase())
    .some((name) => name !== '' && title.toLowerCase().startsWith(name))
  const what = !title ? `${org} plan`.trim() : named || !org ? title : `${org} ${title}`
  const asOf = formatAsOf(plan.asOf)
  // Screen readers read 'to' more clearly than a dash.
  const months = periodLabel(plan.period).replace(' – ', ' to ')
  const opening = [`Gantt chart of the ${what}`, months, asOf && `as of ${asOf}`].filter(Boolean).join(', ')
  const { done, blocked, overdue, atRisk } = plan.counts
  const flags: [number, string][] = [
    [done, 'done'],
    [blocked, 'blocked'],
    [overdue, 'overdue'],
    [atRisk, 'at risk'],
  ]
  const facts = [tasksPhrase(plan), ...flags.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`)]
  const sentences = [`${opening}: ${facts.join(', ')}.`]

  // Whole-team phases are the plan's own, so one of those is named before a subteam's.
  const now = plan.phases.filter((phase) => phase.state === 'now')
  const current: PlanPhase | undefined = now.find((phase) => phase.color === null) ?? now[0]
  if (current) {
    const until = formatDayShort(current.end, needsYear(current.end, plan.period))
    sentences.push(`Current phase: ${cleanText(current.title)}${until ? `, until ${until}` : ''}.`)
  }
  const next = plan.nextKeyDate
  if (next) {
    const when = [formatDayShort(next.date, true), next.state === 'atRisk' ? 'at risk' : ''].filter(Boolean)
    sentences.push(`Next key date: ${[cleanText(next.title), ...when].join(', ')}.`)
  }
  return sentences.join(' ')
}
