// The Export dialog's preview: every page stacked as white paper, drawn by the same SvgPage as the output.
// For a PDF it is the printed sheet itself; for an image, the vector form of the same slide. Above the pages
// are the status line and the notices with their one-click fixes; Fit shows whole pages, and 100% the true
// size, to check wrapping and ellipses before sending.

import { AlertIcon, CopyIcon, DownloadIcon, InfoIcon } from '@primer/octicons-react'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { ExportDialogBoundary } from './ExportDialogBoundary'
import type { DialogNotice } from './ExportDialogModel'
import type { ExportFormat } from './exportSettings'
import type { SheetSpec } from './exportSheets'
import type { NoticeFix } from './planTypes'
import type { Page } from './scene'
import { SvgPage } from './SvgPage'

/** The status line changes at most this often, so a screen reader isn't read every keystroke's count. */
const STATUS_EVERY_MS = 600

type Zoom = 'fit' | 'actual'

const ZOOMS: [Zoom, string][] = [
  ['fit', 'Fit'],
  ['actual', '100%'],
]

export interface SlideActions {
  canCopy: boolean
  /** The action under way, e.g. 'copy-1': the others wait for it */
  busy: string | null
  /** Nothing can be made yet (preparing, empty or a problem) */
  disabled: boolean
  onCopy: (index: number) => void
  onDownload: (index: number) => void
}

export interface ExportPreviewProps {
  format: ExportFormat
  /** The sheet the pages were laid out for */
  sheet: SheetSpec
  /** null while there is nothing to draw yet */
  pages: Page[] | null
  logoHref: string | null
  /** The fonts and the logo are ready, so the pages are drawn as they will print */
  ready: boolean
  /** The preview is catching up with a change */
  updating: boolean
  /** Why there are no pages (a layout that failed, or months in the wrong order) */
  problem: string | null
  problemId: string
  status: string
  notices: DialogNotice[]
  /** The notices' container, focused after a one-click fix */
  noticesRef: RefObject<HTMLDivElement | null>
  onFix: (fix: NoticeFix) => void
  /** Each slide's own Copy and Download, when an image export makes several */
  slideActions: SlideActions | null
  /** The slides' alt text, with its Copy button (images only) */
  alt: { text: string; onCopy: () => void } | null
}

export function ExportPreview(props: ExportPreviewProps) {
  const { format, sheet, pages, logoHref, ready, updating, problem, problemId } = props
  const { notices, noticesRef, onFix, slideActions, alt } = props
  const [zoom, setZoom] = useState<Zoom>('fit')
  const status = useThrottled(problem ? '' : ready && pages ? props.status : 'Preparing the preview…', STATUS_EVERY_MS)
  const altId = useId()
  const noun = format === 'png' ? 'Slide' : 'Page'
  const drawn = !problem && ready && pages !== null
  // Sized from the sheet, so a page that isn't drawn yet (content-visibility) still keeps its place.
  const paperStyle = { aspectRatio: `${sheet.width} / ${sheet.height}`, width: zoom === 'actual' ? sheet.cssWidth : undefined }

  return (
    <section className="xp-preview" aria-label="Preview">
      <div className="xp-preview-bar">
        <p className="xp-status" role="status">
          {status}
        </p>
        {/* Styled as the Timeline's own zoom buttons (timeline.css, always loaded with the Timeline). */}
        <div className="tl-zoom" role="group" aria-label="Preview size">
          {ZOOMS.map(([id, label]) => (
            <button key={id} type="button" className="tl-zoom-button" aria-pressed={zoom === id} onClick={() => setZoom(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div ref={noticesRef} className="xp-notices" role="group" aria-label="Notes" tabIndex={-1}>
        {notices.length > 0 && (
          <ul className="xp-notice-list">
            {notices.map((notice, index) => {
              const fix = notice.fix
              const Icon = notice.kind === 'warning' ? AlertIcon : InfoIcon
              return (
                <li key={index} id={notice.id} className={`xp-notice xp-notice-${notice.kind}`}>
                  <Icon className="xp-notice-icon" />
                  <span className="xp-notice-text">{notice.text}</span>
                  {fix && (
                    <button type="button" className="btn btn-sm xp-notice-fix" onClick={() => onFix(fix.action)}>
                      {fix.label}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {problem ? (
        <p id={problemId} className="xp-problem" role="alert">
          <AlertIcon className="xp-notice-icon" />
          <span>{problem}</span>
        </p>
      ) : !drawn ? (
        // The status line above says what is happening.
        <div className="xp-preparing" aria-hidden="true">
          <span className="spinner" />
        </div>
      ) : (
        <ExportDialogBoundary
          resetKey={pages}
          fallback={(message) => (
            <p className="xp-problem" role="alert">
              <AlertIcon className="xp-notice-icon" />
              <span>Couldn't draw the preview: {message}</span>
            </p>
          )}
        >
          <ol className={`xp-pages xp-pages-${zoom}`} aria-busy={updating || undefined}>
            {pages.map((page, index) => (
              <li key={index} className="xp-page">
                <div className="xp-paper" style={paperStyle}>
                  <SvgPage page={page} sheet={sheet} size={zoom === 'fit' ? 'fit' : 'print'} logoHref={logoHref} />
                </div>
                <div className="xp-caption">
                  <span>
                    {noun} {index + 1} of {pages.length}
                  </span>
                  {slideActions && pages.length > 1 && (
                    <SlideButtons actions={slideActions} index={index} count={pages.length} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </ExportDialogBoundary>
      )}

      {drawn && alt && (
        <div className="xp-alt">
          <label className="field-label" htmlFor={altId}>
            Alt text, to paste with the {pages.length > 1 ? 'slides' : 'slide'}
          </label>
          <textarea id={altId} className="textarea xp-alt-text" readOnly rows={4} value={alt.text} />
          <button type="button" className="btn btn-sm" onClick={alt.onCopy}>
            <CopyIcon size={14} />
            Copy alt text
          </button>
        </div>
      )}
    </section>
  )
}

/** One slide's own Copy and Download (an image export that runs to several slides). */
function SlideButtons({ actions, index, count }: { actions: SlideActions; index: number; count: number }) {
  const which = `slide ${index + 1} of ${count}`
  const waiting = actions.disabled || actions.busy !== null
  return (
    <span className="xp-slide-actions">
      {actions.canCopy && (
        <button
          type="button"
          className="btn btn-sm"
          aria-label={`Copy ${which}`}
          aria-disabled={waiting || undefined}
          aria-busy={actions.busy === `copy-${index}` || undefined}
          onClick={() => actions.onCopy(index)}
        >
          <CopyIcon size={14} />
          Copy
        </button>
      )}
      <button
        type="button"
        className="btn btn-sm"
        aria-label={`Download ${which}`}
        aria-disabled={waiting || undefined}
        aria-busy={actions.busy === `download-${index}` || undefined}
        onClick={() => actions.onDownload(index)}
      >
        <DownloadIcon size={14} />
        Download
      </button>
    </span>
  )
}

/** `value`, changing at most once every `ms` (the latest value always shows in the end). */
function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value)
  // When it last changed: read and written only in the effect and its timer.
  const last = useRef(0)
  useEffect(() => {
    const timer = setTimeout(
      () => {
        last.current = Date.now()
        setShown(value)
      },
      Math.max(0, last.current + ms - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [value, ms])
  return shown
}
