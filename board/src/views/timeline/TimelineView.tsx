// Timeline (roadmap): bars from start date to due date, coloured by subteam, grouped by subteam.
// Drag a bar to move it, drag its ends to change the dates; arrow keys do the same on a focused bar.
// Links between tasks are drawn as lines from the end of the blocking bar to the start of the blocked one
// (red when the dates clash); drag from the round handle at either end of a bar onto another task to link them.
// Milestones are diamonds on their date, each with a line down the timeline; phases are bands shaded over
// their dates. The whole team's (and Admin's, which stands for it) run across every subteam; any other
// subteam's run down its own section only. Export makes a PDF or slide images of what it shows.

import { addDays } from 'date-fns'
import { BlockedIcon, CalendarIcon, ChevronDownIcon, ChevronRightIcon, DownloadIcon } from '@primer/octicons-react'
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { isBlocked } from '../../fields'
import { useToday } from '../../lib/clock'
import { formatDay, formatDayRange, parseDay, toDay } from '../../lib/format'
import { datesClash } from '../../lib/links'
import { colorClass, optionColor } from '../../lib/options'
import { openItem } from '../../lib/router'
import { addLink, updateItem, useBoard } from '../../store/board'
import { useFieldOptions, useViewItems } from '../../store/hooks'
import type { Item } from '../../types'
import { AvatarStack } from '../../ui/Avatar'
import { MilestoneIcon } from '../../ui/MilestoneIcon'
import { PhaseIcon } from '../../ui/PhaseIcon'
import { OptionDot } from '../../ui/OptionChip'
import type { TimelineViewConfig } from '../config'
import { SubteamPicker } from '../SubteamPicker'
import { filterWithSubteams, useShownSubteams } from '../subteams'
import type { ExportDialogProps } from './export/ExportDialog'
import { ExportUnavailable } from './export/ExportUnavailable'
import { KeyDateDialog, type KeyDateKind } from './KeyDateDialog'
import {
  computeRange,
  datesForBar,
  dayIndex,
  dayString,
  DIAMOND_R,
  dragBar,
  GROUP_H,
  isWholeTeam,
  linkX,
  milestoneMarkers,
  phaseBands,
  groupForTimeline,
  monthSpans,
  PX_PER_DAY,
  ROW_H,
  rowLayout,
  shownBar,
  timelineLinks,
  weekTicks,
  ZOOMS,
  type Bar,
  type DragMode,
  type LinkLine,
  type MilestoneMarker,
  type PhaseBand,
  type Range,
  type TimelineGroup,
  type Zoom,
} from './timelineMath'
import './timeline.css'

const ZOOM_KEY = 'fsai-board:timeline-zoom'
/** Room above the first subteam for the names of Today and the whole team's milestones, and with a second
 *  line for its phases' names: they stick 56 px and 80 px down the scroll area (see .tl-marker-label). */
const NAMES_H = { one: 28, two: 52 }

/** A subteam's own milestones and phases, drawn in its section only. */
interface SectionKeyDates {
  markers: MilestoneMarker[]
  bands: PhaseBand[]
}

// Export is its own chunk, fetched ahead when the pointer or focus reaches its button. If it can't load
// (after a redeploy, or offline), a small dialog says so: the app has no error boundary to catch it.
const loadExport = () => import('./export/ExportDialog')
const ExportDialog = lazy<ComponentType<ExportDialogProps>>(() =>
  loadExport()
    .then((module) => ({ default: module.ExportDialog }))
    .catch(() => ({ default: ExportUnavailable })),
)
const prefetchExport = () => void loadExport().catch(() => undefined)
const MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

function loadZoom(): Zoom {
  try {
    const stored = localStorage.getItem(ZOOM_KEY)
    return ZOOMS.some((z) => z.id === stored) ? (stored as Zoom) : 'quarter'
  } catch {
    return 'quarter'
  }
}

interface TimelineViewProps {
  view: TimelineViewConfig
  query: string
  /** Subteams picked in the subteam bar (empty = all) */
  teams: string[]
}

export function TimelineView({ view, query, teams }: TimelineViewProps) {
  const shownTeams = useShownSubteams(view, teams)
  const items = useViewItems(filterWithSubteams(view, shownTeams), query)
  const allSubteams = useFieldOptions('subteam')
  // Only the picked subteams get rows.
  const subteams = useMemo(
    () => (shownTeams.length ? allSubteams.filter((option) => shownTeams.includes(option.name)) : allSubteams),
    [allSubteams, shownTeams],
  )
  const today = useToday()
  const [zoom, setZoom] = useState<Zoom>(loadZoom)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const todayDate = useMemo(() => parseDay(today) ?? new Date(2026, 10, 5), [today])
  const range = useMemo(() => computeRange(items, todayDate), [items, todayDate])
  const px = PX_PER_DAY[zoom]
  const width = Math.ceil(range.days * px)
  const todayIndex = dayIndex(range, todayDate)
  const { groups, undated } = useMemo(() => groupForTimeline(items, subteams), [items, subteams])
  const layout = useMemo(() => rowLayout(groups, collapsed), [groups, collapsed])
  const links = useMemo(() => timelineLinks(groups, layout.centres, range, px, datesClash), [groups, layout, range, px])
  // Milestones and phases are for everyone, whatever the filter. The whole team's (isWholeTeam) run across
  // every subteam shown; a subteam's run down its own section, when it is shown.
  const allItems = useBoard((s) => s.items)
  const markers = useMemo(() => milestoneMarkers(Object.values(allItems), range, px), [allItems, range, px])
  const bands = useMemo(() => phaseBands(Object.values(allItems), range, px), [allItems, range, px])
  const wholeTeam = useMemo<SectionKeyDates>(
    () => ({
      markers: markers.filter((marker) => isWholeTeam(marker.subteam, allSubteams)),
      bands: bands.filter((band) => isWholeTeam(band.subteam, allSubteams)),
    }),
    [markers, bands, allSubteams],
  )
  const bySubteam = useMemo(() => {
    const map = new Map<string, SectionKeyDates>()
    const own = (subteam: string) => {
      const found = map.get(subteam)
      if (found) return found
      const made: SectionKeyDates = { markers: [], bands: [] }
      map.set(subteam, made)
      return made
    }
    for (const marker of markers) if (marker.subteam && !isWholeTeam(marker.subteam, allSubteams)) own(marker.subteam).markers.push(marker)
    for (const band of bands) if (band.subteam && !isWholeTeam(band.subteam, allSubteams)) own(band.subteam).bands.push(band)
    return map
  }, [markers, bands, allSubteams])
  const todayShown = todayIndex >= 0 && todayIndex < range.days
  const namesH =
    wholeTeam.bands.length > 0 ? NAMES_H.two : todayShown || wholeTeam.markers.length > 0 ? NAMES_H.one : 0
  const [adding, setAdding] = useState<KeyDateKind | null>(null)
  const [exporting, setExporting] = useState(false)
  const exportButton = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<SVGSVGElement>(null)
  const draftPathRef = useRef<SVGPathElement>(null)
  const linking = useLinking(layout.centres, px, items, layerRef, draftPathRef)

  // Where "today" is, for scrolling after a zoom change or a click on Today (read in handlers only).
  const todayX = useRef(0)
  useEffect(() => {
    todayX.current = todayIndex * px
  })

  const scrollToToday = () => {
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, todayX.current - (el.clientWidth - labelWidth(el)) / 4)
  }

  // Start with today about a quarter of the way across.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, todayX.current - (el.clientWidth - labelWidth(el)) / 4)
  }, [])

  // Where focus was when Export opened, to put it back there on closing: Ctrl/Cmd+P opens Export from
  // wherever the user is (the filter box, a bar), and typing should carry on where it left off.
  const focusBefore = useRef<HTMLElement | null>(null)

  // Ctrl/Cmd+P opens Export rather than printing the clipped app. With a dialog open (Export's own among
  // them) the browser prints as usual, and Export prints its pages.
  useEffect(() => {
    const onKeyDown = (event: WindowEventMap['keydown']) => {
      const print = (event.key === 'p' || event.key === 'P') && (MAC ? event.metaKey : event.ctrlKey)
      if (!print || event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return
      event.preventDefault()
      focusBefore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setExporting(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Modal closes its <dialog> only after React has removed it, so focus is put back here: where it was,
  // or on Export when that is gone.
  const wasExporting = useRef(false)
  useEffect(() => {
    if (exporting) wasExporting.current = true
    else if (wasExporting.current) {
      wasExporting.current = false
      const back = focusBefore.current
      focusBefore.current = null
      if (back && back !== document.body && back.isConnected) back.focus()
      // Where it was may be gone, or no longer take focus: then Export has it.
      if (!back || document.activeElement !== back) exportButton.current?.focus()
    }
  }, [exporting])

  const changeZoom = (next: Zoom) => {
    setZoom(next)
    try {
      localStorage.setItem(ZOOM_KEY, next)
    } catch {
      // not remembered in private mode
    }
    requestAnimationFrame(scrollToToday)
  }

  const toggle = (key: string) => {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed(next)
  }

  const canvasStyle = { '--tl-width': `${width}px` } as CSSProperties
  // Row and heading heights come from timelineMath, so the drawn links line up with the rows.
  const sizeStyle = { '--tl-row-h': `${ROW_H}px`, '--tl-group-h': `${GROUP_H}px` } as CSSProperties

  return (
    <div className={`tl${linking.draft ? ' tl-linking' : ''}`} style={sizeStyle}>
      <div className="tl-toolbar">
        <div className="tl-zoom" role="group" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button key={z.id} type="button" className="tl-zoom-button" aria-pressed={zoom === z.id} onClick={() => changeZoom(z.id)}>
              {z.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm" onClick={scrollToToday}>
          <CalendarIcon size={14} />
          Today
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setAdding('milestone')}>
          <MilestoneIcon size={11} label="" />
          Milestone
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setAdding('phase')}>
          <PhaseIcon size={12} label="" />
          Phase
        </button>
        <button
          ref={exportButton}
          type="button"
          className="btn btn-sm"
          aria-haspopup="dialog"
          aria-keyshortcuts={MAC ? 'Meta+P' : 'Control+P'}
          title={`Export as PDF or image (${MAC ? '⌘P' : 'Ctrl+P'})`}
          onPointerEnter={prefetchExport}
          onFocus={prefetchExport}
          onClick={() => setExporting(true)}
        >
          <DownloadIcon size={14} />
          Export
        </button>
        {exporting && (
          <Suspense
            fallback={
              <span className="spinner" role="status">
                <span className="sr-only">Opening Export…</span>
              </span>
            }
          >
            <ExportDialog items={items} shownTeams={shownTeams} query={query} today={today} onClose={() => setExporting(false)} />
          </Suspense>
        )}
        {/* The subteam buttons double as the colour key. */}
        <SubteamPicker mode={view.subteamPicker ?? 'many'} shown={shownTeams} />
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-canvas" style={canvasStyle}>
          <Scale range={range} zoom={zoom} px={px} todayIndex={todayIndex} />
          <div className="tl-body">
            <Gridlines range={range} zoom={zoom} px={px} todayIndex={todayIndex} markers={wholeTeam.markers} bands={wholeTeam.bands} />
            <LinkLayer
              links={links}
              top={namesH}
              height={layout.height}
              draft={linking.draft}
              layerRef={layerRef}
              draftPathRef={draftPathRef}
            />
            {namesH > 0 && <div className="tl-names" style={{ height: namesH }} aria-hidden="true" />}
            {groups.map((group) => (
              <GroupRows
                key={group.key}
                group={group}
                keyDates={group.value === null ? undefined : bySubteam.get(group.value)}
                collapsed={collapsed.has(group.key)}
                onToggle={() => toggle(group.key)}
                range={range}
                px={px}
                linking={linking}
              />
            ))}
            <UndatedRows
              items={undated}
              collapsed={collapsed.has('undated')}
              onToggle={() => toggle('undated')}
              today={today}
              linkTarget={linking.target}
            />
            {adding && (
              <KeyDateDialog kind={adding} subteam={shownTeams.length === 1 ? shownTeams[0] : null} onClose={() => setAdding(null)} />
            )}
            {items.length === 0 && (
              <p className="tl-empty muted">
                {query.trim() ? 'No items match the filter.' : shownTeams.length ? 'These subteams have no items yet.' : 'No items yet.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Width of the sticky label column (from CSS, so it follows the phone layout). */
function labelWidth(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).getPropertyValue('--tl-label-w')) || 0
}

// ------------------------------------------------------------------------------------------ links

type LinkSide = 'start' | 'end'

/** A link being dragged out of a bar: the bar, which end, and where the line starts. */
interface LinkDraft {
  from: Item
  side: LinkSide
  x: number
  y: number
}

interface Linking {
  draft: LinkDraft | null
  /** Number of the task under the pointer while a link is dragged */
  target: number | null
  start: (item: Item, side: LinkSide, bar: Bar) => void
  move: (event: PointerEvent<HTMLElement>) => void
  end: (event: PointerEvent<HTMLElement>) => void
  cancel: () => void
}

/** The task row under a point (any task but `from`), or null. */
function taskAt(clientX: number, clientY: number, from: number): number | null {
  const row = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-item-number]')
  const number = Number(row?.dataset.itemNumber)
  return Number.isInteger(number) && number > 0 && number !== from ? number : null
}

/**
 * Dragging from a bar's link handle onto another task links them, as in Jira: from the end of a bar,
 * the other task waits on this one; from the start, this one waits on the other. The line follows the
 * pointer without re-rendering the timeline; only the highlighted target row changes state.
 */
function useLinking(
  centres: ReadonlyMap<number, number>,
  px: number,
  items: Item[],
  layerRef: RefObject<SVGSVGElement | null>,
  draftPathRef: RefObject<SVGPathElement | null>,
): Linking {
  const [draft, setDraft] = useState<LinkDraft | null>(null)
  const [target, setTarget] = useState<number | null>(null)

  const stop = () => {
    setDraft(null)
    setTarget(null)
  }

  return {
    draft,
    target,
    start(item, side, bar) {
      const y = centres.get(item.number)
      if (y === undefined) return
      setDraft({ from: item, side, x: linkX(item, bar, side, px), y })
      setTarget(null)
    },
    move(event) {
      if (!draft) return
      const rect = layerRef.current?.getBoundingClientRect()
      if (rect) {
        draftPathRef.current?.setAttribute('d', `M${draft.x} ${draft.y}L${event.clientX - rect.left} ${event.clientY - rect.top}`)
      }
      const next = taskAt(event.clientX, event.clientY, draft.from.number)
      if (next !== target) setTarget(next)
    },
    end(event) {
      const current = draft
      stop()
      if (!current) return
      const number = taskAt(event.clientX, event.clientY, current.from.number)
      const other = number === null ? undefined : items.find((item) => item.number === number)
      if (!other) return
      if (current.side === 'end') addLink(other.id, 'blocked_by', current.from.number)
      else addLink(current.from.id, 'blocked_by', other.number)
    },
    cancel: stop,
  }
}

interface LinkLayerProps {
  links: LinkLine[]
  /** Where the first subteam starts, below the room for the whole team's names */
  top: number
  height: number
  draft: LinkDraft | null
  layerRef: RefObject<SVGSVGElement | null>
  draftPathRef: RefObject<SVGPathElement | null>
}

/** The link lines, under the bars; also the line being dragged out of a bar. */
function LinkLayer({ links, top, height, draft, layerRef, draftPathRef }: LinkLayerProps) {
  return (
    <svg ref={layerRef} className="tl-links" style={{ top }} height={Math.max(1, height)} aria-hidden="true">
      {links.map((link) => (
        <path key={link.key} className={`tl-link${link.clash ? ' tl-link-clash' : ''}`} d={link.path} />
      ))}
      {draft && (
        <path ref={draftPathRef} className="tl-link tl-link-draft" d={`M${draft.x} ${draft.y}L${draft.x} ${draft.y}`} />
      )}
    </svg>
  )
}

function Scale({ range, zoom, px, todayIndex }: { range: Range; zoom: Zoom; px: number; todayIndex: number }) {
  const months = monthSpans(range, zoom)
  return (
    <div className="tl-header">
      <div className="tl-corner">Items</div>
      <div className="tl-scale">
        <div className="tl-scale-row">
          {months.map((month) => (
            <span key={month.key} className="tl-month" style={{ left: month.start * px, width: month.days * px }}>
              {month.label}
            </span>
          ))}
        </div>
        <div className="tl-scale-row tl-scale-minor">
          {zoom === 'month' &&
            Array.from({ length: range.days }, (_, index) => {
              const day = dayString(range, index)
              return (
                <span key={day} className={`tl-day${index === todayIndex ? ' tl-day-today' : ''}`} style={{ left: index * px, width: px }}>
                  {Number(day.slice(8))}
                </span>
              )
            })}
          {zoom === 'quarter' &&
            weekTicks(range).map((week) => (
              <span key={week.key} className="tl-week" style={{ left: week.start * px }}>
                {week.label}
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}

interface GridlinesProps {
  range: Range
  zoom: Zoom
  px: number
  todayIndex: number
  markers: MilestoneMarker[]
  bands: PhaseBand[]
}

/** Phases: their dates shaded, with the name at the top (click it to open). */
function PhaseBands({ bands }: { bands: PhaseBand[] }) {
  const options = useBoard((s) => s.options)
  return bands.map((band) => (
    <span
      key={band.id}
      className={`tl-band ${colorClass(optionColor(options, 'subteam', band.subteam))}`}
      style={{ left: band.x, width: band.width }}
    >
      <button
        type="button"
        className="tl-band-label"
        tabIndex={-1}
        title={`${band.title}, ${formatDayRange(band.start, band.end)}`}
        onClick={() => openItem(band.number)}
      >
        <PhaseIcon size={11} label="" />
        {band.title}
      </button>
    </span>
  ))
}

/** Milestones: a dashed line, with the name at the top (click it to open). */
function MilestoneLines({ markers }: { markers: MilestoneMarker[] }) {
  const options = useBoard((s) => s.options)
  return markers.map((marker) => (
    <span key={marker.id} className={`tl-marker ${colorClass(optionColor(options, 'subteam', marker.subteam))}`} style={{ left: marker.x }}>
      <button
        type="button"
        className="tl-marker-label"
        tabIndex={-1}
        title={`${marker.title}, ${formatDay(marker.date)}`}
        onClick={() => openItem(marker.number)}
      >
        <MilestoneIcon size={10} label="" />
        {marker.title}
      </button>
    </span>
  ))
}

/** The whole team's milestones and phases, across every subteam, with the month lines and Today. */
function Gridlines({ range, zoom, px, todayIndex, markers, bands }: GridlinesProps) {
  return (
    <div className="tl-grid" aria-hidden="true">
      <PhaseBands bands={bands} />
      {/* A month that began before the range would put its line left of the dates, under the labels. */}
      {monthSpans(range, zoom)
        .filter((month) => month.start > 0)
        .map((month) => (
          <span key={month.key} className="tl-gridline" style={{ left: month.start * px }} />
        ))}
      {todayIndex >= 0 && todayIndex < range.days && (
        <span className="tl-today" style={{ left: todayIndex * px + px / 2 }}>
          <span className="tl-today-label">Today</span>
        </span>
      )}
      <MilestoneLines markers={markers} />
    </div>
  )
}

interface GroupRowsProps {
  group: TimelineGroup
  /** The subteam's own milestones and phases (not the whole team's) */
  keyDates: SectionKeyDates | undefined
  collapsed: boolean
  onToggle: () => void
  range: Range
  px: number
  linking: Linking
}

function GroupRows({ group, keyDates, collapsed, onToggle, range, px, linking }: GroupRowsProps) {
  const shown = new Set(group.items.map((item) => item.id))
  return (
    <section className="tl-section" aria-label={group.name}>
      {/* The subteam's own milestones and phases run down its section only, named in its heading row. */}
      {keyDates && (keyDates.markers.length > 0 || keyDates.bands.length > 0) && (
        <div className="tl-section-grid" aria-hidden="true">
          <PhaseBands bands={keyDates.bands} />
          <MilestoneLines markers={keyDates.markers} />
        </div>
      )}
      <div className="tl-group">
        <button type="button" className="tl-group-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          <OptionDot field="subteam" name={group.value} />
          <span>{group.name}</span>
          <span className="badge badge-count">{group.items.length}</span>
        </button>
      </div>
      {!collapsed &&
        group.items.map((item) => {
          const bar = shownBar(item, range)
          return (
            <div
              key={item.id}
              className={`tl-row${linking.target === item.number ? ' tl-row-link-target' : ''}`}
              data-item-number={item.number || undefined}
            >
              <RowLabel item={item} nested={!!item.parent_id && shown.has(item.parent_id)} />
              <div className="tl-track">{bar && <TimelineBar item={item} bar={bar} range={range} px={px} linking={linking} />}</div>
            </div>
          )
        })}
    </section>
  )
}

/**
 * A row's label. A subtask shown just under its parent (`nested`) is indented; one shown elsewhere (its
 * parent is in another subteam, undated, or filtered out) names its parent instead.
 */
function RowLabel({ item, nested }: { item: Item; nested: boolean }) {
  const parentNumber = useBoard((s) => (item.parent_id && !nested ? (s.items[item.parent_id]?.number ?? null) : null))
  return (
    <button
      type="button"
      className={`tl-label${nested ? ' tl-label-sub' : ''}`}
      disabled={item.number === 0}
      onClick={() => openItem(item.number)}
      title={`#${item.number} ${item.title}${item.parent_id ? ' (a subtask)' : ''}`}
    >
      {nested && (
        <span className="tl-label-submark" aria-hidden="true">
          ↳
        </span>
      )}
      <span className="tl-label-number">{item.number ? `#${item.number}` : '#…'}</span>
      <span className="tl-label-title">{item.title}</span>
      {parentNumber !== null && (
        <span className="tl-label-parent" title={`Subtask of #${parentNumber}`}>
          ↳ #{parentNumber}
        </span>
      )}
      <AvatarStack usernames={item.assignees} max={2} size={18} />
    </button>
  )
}

interface DragInfo {
  mode: DragMode
  startX: number
  moved: boolean
}

interface BarProps {
  item: Item
  bar: Bar
  range: Range
  px: number
  linking: Linking
}

function TimelineBar({ item, bar, range, px, linking }: BarProps) {
  const options = useBoard((s) => s.options)
  const [preview, setPreview] = useState<Bar | null>(null)
  const drag = useRef<DragInfo | null>(null)
  const shown = preview ?? bar
  const color = optionColor(options, 'subteam', item.subteam)
  const pending = item.number === 0

  const save = (next: Bar, mode: DragMode) => {
    const dates = datesForBar(item, next, range, mode)
    if (dates.start_date !== item.start_date || dates.due_date !== item.due_date) {
      void updateItem(item.id, dates, 'the dates')
    }
  }

  // The bar and its two handles share this handler; data-mode says which part was grabbed.
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (pending || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const mode = (event.currentTarget.dataset.mode as DragMode | undefined) ?? 'move'
    drag.current = { mode, startX: event.clientX, moved: false }
  }

  const deltaDays = (event: PointerEvent<HTMLElement>, info: DragInfo) => Math.round((event.clientX - info.startX) / px)

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const info = drag.current
    if (!info) return
    if (!info.moved && Math.abs(event.clientX - info.startX) < 4) return
    info.moved = true
    setPreview(dragBar(bar, info.mode, deltaDays(event, info)))
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const info = drag.current
    drag.current = null
    if (!info) return
    setPreview(null)
    if (!info.moved) {
      openItem(item.number)
      return
    }
    save(dragBar(bar, info.mode, deltaDays(event, info)), info.mode)
  }

  const onPointerCancel = () => {
    drag.current = null
    setPreview(null)
  }

  // A link handle: drag it onto another task (pointer only; the item panel's Linked tasks does the same).
  const onLinkDown = (event: PointerEvent<HTMLElement>) => {
    if (pending || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    linking.start(item, event.currentTarget.dataset.side === 'start' ? 'start' : 'end', bar)
  }
  const linkHandle = (side: LinkSide) => (
    <span
      className={`tl-link-handle tl-link-handle-${side}`}
      data-side={side}
      title={side === 'end' ? 'Drag onto a task that waits on this one' : 'Drag onto a task this one waits on'}
      aria-hidden="true"
      onPointerDown={onLinkDown}
      onPointerMove={linking.move}
      onPointerUp={linking.end}
      onPointerCancel={linking.cancel}
    />
  )

  // Keyboard: Enter opens; arrows move by a day; Shift+arrows change the due date.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (pending) return
    if (event.key === 'Enter') {
      event.preventDefault()
      openItem(item.number)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const delta = event.key === 'ArrowLeft' ? -1 : 1
      const mode: DragMode = event.shiftKey && !item.is_milestone ? 'end' : 'move'
      save(dragBar(bar, mode, delta), mode)
    }
  }

  const milestone = item.is_milestone
  const label = milestone ? formatDay(item.due_date ?? item.start_date ?? '') : formatDayRange(item.start_date, item.due_date)
  const linkingFromHere = linking.draft?.from.id === item.id
  // A milestone is a diamond centred on its day; a task is a bar over its days.
  const place = milestone
    ? { left: (shown.start + 0.5) * px - DIAMOND_R, width: DIAMOND_R * 2 }
    : { left: shown.start * px, width: Math.max(px, (shown.end - shown.start + 1) * px) }
  const previewLabel = preview
    ? formatDayRange(dayString(range, preview.start), dayString(range, preview.end))
    : null

  return (
    <div
      className={`tl-bar ${colorClass(color)}${milestone ? ' tl-milestone' : ''}${item.is_phase ? ' tl-phase' : ''}${isBlocked(item) ? ' tl-bar-blocked' : ''}${preview ? ' tl-bar-dragging' : ''}${linkingFromHere ? ' tl-bar-linking' : ''}`}
      style={place}
      role="button"
      tabIndex={pending ? -1 : 0}
      aria-label={`${milestone ? 'Milestone ' : ''}#${item.number} ${item.title}, ${label}. Arrow keys move it by a day${milestone ? '' : ', Shift+arrows change the due date'}, Enter opens it.`}
      title={`#${item.number} ${item.title} (${label})`}
      data-mode="move"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      {milestone ? (
        <>
          <span className="tl-milestone-diamond" aria-hidden="true" />
          <span className="tl-milestone-label">{item.title}</span>
        </>
      ) : (
        <>
          <span className="tl-handle tl-handle-start" data-mode="start" onPointerDown={onPointerDown} aria-hidden="true" />
          {isBlocked(item) && <BlockedIcon size={12} className="tl-bar-icon" />}
          {item.is_phase && <PhaseIcon size={12} label="Phase" />}
          <span className="tl-bar-label">{item.title}</span>
          <span className="tl-handle tl-handle-end" data-mode="end" onPointerDown={onPointerDown} aria-hidden="true" />
        </>
      )}
      {!pending && linkHandle('start')}
      {!pending && linkHandle('end')}
      {previewLabel && <span className="tl-tooltip">{previewLabel}</span>}
    </div>
  )
}

interface UndatedRowsProps {
  items: Item[]
  collapsed: boolean
  onToggle: () => void
  today: string
  /** The task a link being dragged would join */
  linkTarget: number | null
}

function UndatedRows({ items, collapsed, onToggle, today, linkTarget }: UndatedRowsProps) {
  if (items.length === 0) return null
  const shown = new Set(items.map((item) => item.id))
  const addDates = (item: Item) => {
    const start = parseDay(today)
    if (!start) return
    void updateItem(item.id, { start_date: today, due_date: toDay(addDays(start, 7)) }, 'the dates')
  }
  return (
    <section className="tl-section" aria-label="No dates">
      <div className="tl-group">
        <button type="button" className="tl-group-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          <span>No dates</span>
          <span className="badge badge-count">{items.length}</span>
        </button>
      </div>
      {!collapsed &&
        items.map((item) => (
          <div
            key={item.id}
            className={`tl-row tl-row-undated${linkTarget === item.number ? ' tl-row-link-target' : ''}`}
            data-item-number={item.number || undefined}
          >
            <RowLabel item={item} nested={!!item.parent_id && shown.has(item.parent_id)} />
            <div className="tl-track">
              <button type="button" className="btn btn-sm tl-adddates" disabled={item.number === 0} onClick={() => addDates(item)}>
                <CalendarIcon size={14} />
                Add dates
              </button>
            </div>
          </div>
        ))}
    </section>
  )
}
