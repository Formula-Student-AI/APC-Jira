// Timeline (roadmap): bars from start date to due date, coloured by subteam, grouped by subteam.
// Drag a bar to move it, drag its ends to change the dates; arrow keys do the same on a focused bar.

import { addDays } from 'date-fns'
import { BlockedIcon, CalendarIcon, ChevronDownIcon, ChevronRightIcon } from '@primer/octicons-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { isBlocked } from '../../fields'
import { useToday } from '../../lib/clock'
import { formatDayRange, parseDay, toDay } from '../../lib/format'
import { colorClass, optionColor } from '../../lib/options'
import { openItem } from '../../lib/router'
import { updateItem, useBoard } from '../../store/board'
import { useFieldOptions, useViewItems } from '../../store/hooks'
import type { Item } from '../../types'
import { AvatarStack } from '../../ui/Avatar'
import { OptionDot } from '../../ui/OptionChip'
import type { TimelineViewConfig } from '../config'
import {
  barFor,
  computeRange,
  datesForBar,
  dayIndex,
  dayString,
  dragBar,
  groupForTimeline,
  monthSpans,
  PX_PER_DAY,
  weekTicks,
  ZOOMS,
  type Bar,
  type DragMode,
  type Range,
  type TimelineGroup,
  type Zoom,
} from './timelineMath'
import './timeline.css'

const ZOOM_KEY = 'fsai-board:timeline-zoom'

function loadZoom(): Zoom {
  try {
    const stored = localStorage.getItem(ZOOM_KEY)
    return ZOOMS.some((z) => z.id === stored) ? (stored as Zoom) : 'quarter'
  } catch {
    return 'quarter'
  }
}

export function TimelineView({ view, query }: { view: TimelineViewConfig; query: string }) {
  const items = useViewItems(view.filter, query)
  const subteams = useFieldOptions('subteam')
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

  return (
    <div className="tl">
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
        <ul className="tl-legend" aria-label="Subteam colours">
          {subteams.map((option) => (
            <li key={option.id}>
              <OptionDot field="subteam" name={option.name} />
              {option.name}
            </li>
          ))}
        </ul>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-canvas" style={canvasStyle}>
          <Scale range={range} zoom={zoom} px={px} todayIndex={todayIndex} />
          <div className="tl-body">
            <Gridlines range={range} zoom={zoom} px={px} todayIndex={todayIndex} />
            {groups.map((group) => (
              <GroupRows
                key={group.key}
                group={group}
                collapsed={collapsed.has(group.key)}
                onToggle={() => toggle(group.key)}
                range={range}
                px={px}
              />
            ))}
            <UndatedRows items={undated} collapsed={collapsed.has('undated')} onToggle={() => toggle('undated')} today={today} />
            {items.length === 0 && <p className="tl-empty muted">{query.trim() ? 'No items match the filter.' : 'No items yet.'}</p>}
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

function Gridlines({ range, zoom, px, todayIndex }: { range: Range; zoom: Zoom; px: number; todayIndex: number }) {
  return (
    <div className="tl-grid" aria-hidden="true">
      {monthSpans(range, zoom).map((month) => (
        <span key={month.key} className="tl-gridline" style={{ left: month.start * px }} />
      ))}
      {todayIndex >= 0 && todayIndex < range.days && (
        <span className="tl-today" style={{ left: todayIndex * px + px / 2 }}>
          <span className="tl-today-label">Today</span>
        </span>
      )}
    </div>
  )
}

interface GroupRowsProps {
  group: TimelineGroup
  collapsed: boolean
  onToggle: () => void
  range: Range
  px: number
}

function GroupRows({ group, collapsed, onToggle, range, px }: GroupRowsProps) {
  return (
    <section className="tl-section" aria-label={group.name}>
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
          const bar = barFor(item, range)
          return (
            <div key={item.id} className="tl-row">
              <RowLabel item={item} />
              <div className="tl-track">{bar && <TimelineBar item={item} bar={bar} range={range} px={px} />}</div>
            </div>
          )
        })}
    </section>
  )
}

function RowLabel({ item }: { item: Item }) {
  return (
    <button
      type="button"
      className="tl-label"
      disabled={item.number === 0}
      onClick={() => openItem(item.number)}
      title={`#${item.number} ${item.title}`}
    >
      <span className="tl-label-number">{item.number ? `#${item.number}` : '#…'}</span>
      <span className="tl-label-title">{item.title}</span>
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
}

function TimelineBar({ item, bar, range, px }: BarProps) {
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

  // Keyboard: Enter opens; arrows move by a day; Shift+arrows change the due date.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (pending) return
    if (event.key === 'Enter') {
      event.preventDefault()
      openItem(item.number)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const delta = event.key === 'ArrowLeft' ? -1 : 1
      const mode: DragMode = event.shiftKey ? 'end' : 'move'
      save(dragBar(bar, mode, delta), mode)
    }
  }

  const label = formatDayRange(item.start_date, item.due_date)
  const previewLabel = preview
    ? formatDayRange(dayString(range, preview.start), dayString(range, preview.end))
    : null

  return (
    <div
      className={`tl-bar ${colorClass(color)}${isBlocked(item) ? ' tl-bar-blocked' : ''}${preview ? ' tl-bar-dragging' : ''}`}
      style={{ left: shown.start * px, width: Math.max(px, (shown.end - shown.start + 1) * px) }}
      role="button"
      tabIndex={pending ? -1 : 0}
      aria-label={`#${item.number} ${item.title}, ${label}. Arrow keys move it by a day, Shift+arrows change the due date, Enter opens it.`}
      title={`#${item.number} ${item.title} (${label})`}
      data-mode="move"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <span className="tl-handle tl-handle-start" data-mode="start" onPointerDown={onPointerDown} aria-hidden="true" />
      {isBlocked(item) && <BlockedIcon size={12} className="tl-bar-icon" />}
      <span className="tl-bar-label">{item.title}</span>
      <span className="tl-handle tl-handle-end" data-mode="end" onPointerDown={onPointerDown} aria-hidden="true" />
      {previewLabel && <span className="tl-tooltip">{previewLabel}</span>}
    </div>
  )
}

function UndatedRows({ items, collapsed, onToggle, today }: { items: Item[]; collapsed: boolean; onToggle: () => void; today: string }) {
  if (items.length === 0) return null
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
          <div key={item.id} className="tl-row tl-row-undated">
            <RowLabel item={item} />
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
