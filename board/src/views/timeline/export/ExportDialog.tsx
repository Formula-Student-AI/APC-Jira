// "Export timeline": the Timeline as a stakeholder-ready plan Gantt chart, either a PDF (A4 or A3 landscape,
// printed by the browser from pages laid out here) or 16:9 PNG slides, with a live preview drawn by the same
// code as the output. It holds exactly what the Timeline shows. This component keeps the settings
// (remembered on this device, all but the note), the chain from the board to pages (buildPlan, then
// layoutDocument for each sheet) and the actions. The preview follows the board as it changes; each print
// or image is laid out again at the click, so it carries the data and the time of that moment.

import { CopyIcon } from '@primer/octicons-react'
import { useDeferredValue, useId, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ORG_NAME } from '../../../config'
import { pushToast, useBoard } from '../../../store/board'
import { useMe } from '../../../store/hooks'
import type { FieldOption, Item, Member } from '../../../types'
import { Modal } from '../../../ui/Modal'
import { ExportDialogBoundary } from './ExportDialogBoundary'
import {
  applyFix,
  attempt,
  browserTraits,
  datedRows,
  emptyNotice,
  exportedSettings,
  imageHint,
  includeCounts,
  isEmptyPlan,
  layoutProblem,
  lengthNotices,
  MONTHS_WRONG,
  monthsOutOfOrder,
  planText,
  preparedByText,
  preparedByValue,
  printHint,
  scopeLine,
  slideFileName,
  statusLine,
  type DialogNotice,
} from './ExportDialogModel'
import { ExportOptions } from './ExportOptions'
import { ExportPreview } from './ExportPreview'
import { layoutDocument, type DocumentLayout } from './exportLayout'
import { monthOptions, periodFor, periodLabel } from './exportPeriod'
import { buildPlan, type PlanInput } from './exportPlan'
import { loadSettings, saveSettings, type ExportFormat, type ExportSettings, type PeriodChoice } from './exportSettings'
import { SHEETS, SLIDE, SLIDE_PX_PER_PT, type SheetSpec } from './exportSheets'
import { altText, exportFileName, statusSentence } from './exportText'
import type { NoticeFix, Plan } from './planTypes'
import { PrintPages } from './PrintPages'
import { noticePage, setPrintTitle } from './PrintPagesSetup'
import { canCopyImages, copyPng, downloadBlob, renderPng } from './saveImage'
import type { Measure, Page } from './scene'
import { useExportAssets } from './useExportAssets'
import './export.css'

export interface ExportDialogProps {
  /** The Timeline's items, with its subteams and filter applied */
  items: Item[]
  /** The subteams picked on the Timeline (empty: all) */
  shownTeams: string[]
  /** What is typed in the filter box */
  query: string
  /** The as-of date, 'YYYY-MM-DD': the Timeline's Today */
  today: string
  onClose: () => void
}

/** Everything a plan is built from, as one value, so the preview can lag behind all of it together. */
interface Source {
  items: Item[]
  allItems: Record<string, Item>
  options: FieldOption[]
  members: Record<string, Member>
  me: Member | null
  shownTeams: string[]
  query: string
  today: string
  connected: boolean
  settings: ExportSettings
  note: string
}

type Built<T> = { value: T; error: null } | { value: null; error: string }

/** Pages ready to print or paint, with the sheet they were laid out for. */
interface Laid {
  pages: Page[]
  sheet: SheetSpec
}

const BROWSER = browserTraits(navigator.userAgent, navigator.maxTouchPoints)
const CAN_COPY = attempt(canCopyImages, false)
const IMAGE_FAILED = "Couldn't make the image on this device. Try One row per domain, or the PDF."
const COPY_FAILED = "Couldn't copy the image on this device. Try Download PNG instead."
const ALT_FAILED = "Couldn't copy the alt text. Select it and copy it instead."
const PREPARING = 'The fonts and the logo are still loading. Close this print window and try again in a moment.'
const SLIDES_CHANGED = 'The slides changed while the preview was catching up. Check the preview, then try again.'

function planInput(source: Source, format: ExportFormat, exportedAt: string): PlanInput {
  return {
    items: source.items,
    allItems: source.allItems,
    options: source.options,
    members: source.members,
    me: source.me,
    shownTeams: source.shownTeams,
    query: source.query,
    today: source.today,
    exportedAt,
    connected: source.connected,
    settings: exportedSettings(source.settings),
    format,
    note: source.note,
  }
}

// buildPlan and layoutDocument throw when something is wrong; the dialog says so instead of failing.
function planFor(source: Source, format: ExportFormat, exportedAt: string): Built<Plan> {
  if (monthsOutOfOrder(source.settings.period)) return { value: null, error: MONTHS_WRONG }
  try {
    return { value: buildPlan(planInput(source, format, exportedAt)), error: null }
  } catch (error) {
    return { value: null, error: layoutProblem(error) }
  }
}

function layoutFor(plan: Plan, sheet: SheetSpec, measure: Measure): Built<DocumentLayout> {
  try {
    return { value: layoutDocument(plan, sheet, measure), error: null }
  } catch (error) {
    return { value: null, error: layoutProblem(error) }
  }
}

export function ExportDialog({ items, shownTeams, query, today, onClose }: ExportDialogProps) {
  const allItems = useBoard((s) => s.items)
  const options = useBoard((s) => s.options)
  const members = useBoard((s) => s.members)
  const live = useBoard((s) => s.live)
  const me = useMe()
  const [settings, setSettings] = useState(loadSettings)
  const [note, setNote] = useState('')
  // The preview's footer gives the time the dialog opened; a print or an image gives the time of its click.
  const [openedAt] = useState(() => new Date().toISOString())
  // The image action under way ('download', 'download-2', 'copy-0'): repeat clicks wait for it.
  const [busy, setBusy] = useState<string | null>(null)
  // The last result, also said here: toasts sit behind a modal dialog.
  const [outcome, setOutcome] = useState<{ kind: 'info' | 'error'; message: string } | null>(null)
  // The pages laid out for the print under way; at other times the portal holds the preview's.
  const [printing, setPrinting] = useState<Laid | null>(null)
  const printButton = useRef<HTMLButtonElement>(null)
  const noticesRef = useRef<HTMLDivElement>(null)
  // Set while the Print button's own window.print() runs, so beforeprint doesn't lay the pages out twice.
  const printClicked = useRef(false)
  const hintId = useId()
  const emptyId = useId()
  const problemId = useId()

  const connected = live !== 'reconnecting' && live !== 'offline'
  const source = useMemo<Source>(
    () => ({ items, allItems, options, members, me, shownTeams, query, today, connected, settings, note }),
    [items, allItems, options, members, me, shownTeams, query, today, connected, settings, note],
  )
  // The preview lags behind typing and live changes rather than hold them up.
  const shown = useDeferredValue(source)
  const kind = shown.settings.format

  // The PDF's plan is always built: the options give each paper's page count, and Choose months… starts
  // from its period.
  const pdf = useMemo(() => planFor(shown, 'pdf', openedAt), [shown, openedAt])
  const png = useMemo(() => (kind === 'png' ? planFor(shown, 'png', openedAt) : null), [shown, kind, openedAt])
  const text = useMemo(() => planText([pdf.value, png?.value]), [pdf, png])
  const assets = useExportAssets(text)
  const { measure } = assets
  // Both papers, for the page counts beside them.
  const papers = useMemo(() => {
    if (!pdf.value) return null
    return { a4: layoutFor(pdf.value, SHEETS.a4, measure), a3: layoutFor(pdf.value, SHEETS.a3, measure) }
  }, [pdf, measure])
  const slides = useMemo(() => (png?.value ? layoutFor(png.value, SLIDE, measure) : null), [png, measure])

  const pdfSheet = SHEETS[shown.settings.paper]
  const pdfLayout = papers ? papers[shown.settings.paper] : null
  const plan = kind === 'pdf' ? pdf.value : (png?.value ?? null)
  const layout = kind === 'pdf' ? pdfLayout : slides
  const sheet = kind === 'pdf' ? pdfSheet : SLIDE
  const pages = layout?.value?.pages ?? null
  const problem = (kind === 'pdf' ? pdf.error : (png?.error ?? null)) ?? layout?.error ?? null
  const empty = plan !== null && isEmptyPlan(plan)
  const canAct = assets.ready && problem === null && !empty && pages !== null
  // What Ctrl/Cmd+P and File > Print print, which go round the disabled button: the pages the preview shows
  // (the slides while Image is chosen), or one sheet saying why they can't be printed yet.
  const unprintable = problem ?? (assets.ready ? null : PREPARING)
  const portal = useMemo<Laid>(
    () => printing ?? (unprintable !== null ? { pages: [noticePage(sheet, unprintable, measure)], sheet } : { pages: pages ?? [], sheet }),
    [printing, unprintable, sheet, pages, measure],
  )

  const notices = useMemo<DialogNotice[]>(() => {
    if (!plan) return []
    const list: DialogNotice[] = []
    if (empty) list.push({ ...emptyNotice(plan, shown.settings), id: emptyId })
    list.push(...plan.notices)
    if (layout?.value) {
      list.push(...lengthNotices(kind, layout.value.pages.length, shown.settings))
      for (const text of layout.value.notes) list.push({ kind: 'info', text })
    }
    return list
  }, [plan, empty, layout, kind, shown.settings, emptyId])

  const sheetId = kind === 'pdf' ? shown.settings.paper : 'slide'
  const sentence = plan && pages ? attempt(() => statusSentence(plan, pages.length, sheetId), '') : ''
  const pngPlan = png?.value ?? null
  const alt = kind === 'png' && pngPlan ? attempt(() => altText(pngPlan), '') : ''

  const rows = useMemo(() => datedRows(shown.items), [shown.items])
  const periodLabels = useMemo(() => {
    const months = (choice: PeriodChoice) => periodLabel(periodFor(choice, today, rows).period)
    const label = (name: string, choice: PeriodChoice) => attempt(() => `${name} (${months(choice)})`, name)
    return {
      plan: label('Whole plan', { preset: 'plan' }),
      next3: label('Next 3 months', { preset: 'next3' }),
      next6: label('Next 6 months', { preset: 'next6' }),
    }
  }, [today, rows])
  const months = useMemo(() => attempt(() => monthOptions(today), []), [today])

  const title = exportedSettings(settings).title
  const fileName = attempt(() => exportFileName(ORG_NAME, title, today), `${ORG_NAME} ${title} - Timeline - ${today}`)

  const update = (patch: Partial<ExportSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  const fix = (action: NoticeFix) => {
    update(applyFix(settings, action))
    noticesRef.current?.focus()
  }

  // Choose months… starts from the months shown now.
  const chooseMonths = () => {
    const period = pdf.value?.period ?? attempt(() => periodFor(settings.period, today, rows).period, null)
    const month = today.slice(0, 7)
    const from = period?.first.slice(0, 7) ?? month
    update({ period: { preset: 'months', from, to: period?.last.slice(0, 7) ?? month } })
  }

  const report = (kind: 'info' | 'error', message: string) => {
    pushToast(kind, message)
    setOutcome({ kind, message })
  }

  /** Pages laid out from the board as it is at this moment, not the preview's (which can lag behind it). */
  const layOutNow = (format: ExportFormat): Laid => {
    if (monthsOutOfOrder(settings.period)) throw new Error(MONTHS_WRONG)
    const plan = buildPlan(planInput(source, format, new Date().toISOString()))
    const sheet = format === 'png' ? SLIDE : SHEETS[settings.paper]
    return { pages: layoutDocument(plan, sheet, measure).pages, sheet }
  }

  // Before every print (the button, Ctrl/Cmd+P, File > Print): the portal gets pages of this moment, in the
  // format chosen, put in the document synchronously, before the print window takes its copy. While the
  // fonts load, or with a problem stated, it keeps its one sheet saying why.
  const preparePrint = () => {
    if (printClicked.current || unprintable !== null) return
    const format = settings.format
    try {
      const laid = layOutNow(format)
      flushSync(() => setPrinting(laid))
    } catch (error) {
      const why = error instanceof Error && error.message === MONTHS_WRONG ? MONTHS_WRONG : layoutProblem(error)
      const paper = format === 'png' ? SLIDE : SHEETS[settings.paper]
      flushSync(() => setPrinting({ pages: [noticePage(paper, why, measure)], sheet: paper }))
    }
  }

  // window.print() runs straight away in the click, with nothing awaited: Safari's gesture rule holds.
  const print = () => {
    if (!canAct || busy) return
    setPrintTitle(fileName)
    preparePrint()
    printClicked.current = true
    try {
      window.print()
    } finally {
      printClicked.current = false
    }
  }

  const afterPrint = () => setPrinting(null)

  /**
   * Downloads every slide (one after another, with one canvas at a time), or just slide `only` of the `count`
   * the preview shows. The slides are laid out again from the board as it is now, and the preview can lag
   * behind it: a slide picked by its number is saved only while there are still `count` slides.
   */
  const downloadSlides = (only: number | null, count: number) => {
    if (!canAct || busy) return
    let laid: Laid
    try {
      laid = layOutNow('png')
    } catch (error) {
      report('error', layoutProblem(error))
      return
    }
    if (only !== null && laid.pages.length !== count) {
      report('error', SLIDES_CHANGED)
      return
    }
    const indexes = only === null ? laid.pages.map((_, index) => index) : [only]
    setBusy(only === null ? 'download' : `download-${only}`)
    void (async () => {
      try {
        const names: string[] = []
        for (const index of indexes) {
          const page = laid.pages[index]
          if (!page) continue
          const blob = await renderPng(page, { logo: assets.logoBitmap }, SLIDE_PX_PER_PT)
          const name = slideFileName(fileName, index, laid.pages.length)
          downloadBlob(blob, name)
          names.push(name)
        }
        // The page can't see what the browser does with each file: Chrome and Edge ask before the second.
        if (names.length === 1) report('info', `Downloaded ${names[0]}`)
        else if (names.length > 1) {
          report('info', `Started ${names.length} downloads, one PNG for each slide. If your browser asks, allow this site to download multiple files.`)
        }
      } catch {
        report('error', IMAGE_FAILED)
      } finally {
        setBusy(null)
      }
    })()
  }

  /** Copies slide `index` of the `count` the preview shows, while there are still that many (downloadSlides). */
  const copySlide = (index: number, count: number) => {
    if (!canAct || busy || !CAN_COPY) return
    let laid: Laid
    try {
      laid = layOutNow('png')
    } catch (error) {
      report('error', layoutProblem(error))
      return
    }
    const page: Page | undefined = laid.pages[index]
    if (laid.pages.length !== count || !page) {
      report('error', SLIDES_CHANGED)
      return
    }
    const slide = page
    setBusy(`copy-${index}`)
    // The clipboard item is made inside the click, given the PNG still being made (Safari needs this). The
    // executor runs straight away, and anything it throws becomes a rejection.
    new Promise<void>((resolve, reject) => {
      copyPng(renderPng(slide, { logo: assets.logoBitmap }, SLIDE_PX_PER_PT)).then(resolve, reject)
    })
      .then(() => report('info', 'Image copied: paste it into your slide.'))
      .catch(() => report('error', COPY_FAILED))
      .finally(() => setBusy(null))
  }

  const copyAlt = () => {
    if (!alt) return
    if (!navigator.clipboard) {
      report('error', ALT_FAILED)
      return
    }
    navigator.clipboard.writeText(alt).then(
      () => report('info', 'Alt text copied.'),
      () => report('error', ALT_FAILED),
    )
  }

  const slideCount = kind === 'png' ? (pages?.length ?? 1) : 0
  const imageLabel = slideCount > 1 ? `Download ${slideCount} PNGs` : 'Download PNG'
  const primaryLabel = kind === 'pdf' ? 'Print or save as PDF…' : imageLabel
  const preparing = !assets.ready
  const working = busy === 'download'
  const describedBy = [hintId, empty ? emptyId : null, problem ? problemId : null].filter(Boolean).join(' ')
  const off = !canAct || busy !== null || undefined

  const footer = (
    <>
      <div className="xp-footer-text">
        <p id={hintId} className="xp-footer-hint">
          {kind === 'pdf' ? printHint(BROWSER) : imageHint(BROWSER, slideCount)}
        </p>
        <p className="xp-outcome" role="status">
          {outcome?.kind === 'info' ? outcome.message : ''}
        </p>
        <p className="xp-outcome xp-outcome-error" role="alert">
          {outcome?.kind === 'error' ? outcome.message : ''}
        </p>
      </div>
      <div className="xp-actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        {kind === 'png' && CAN_COPY && slideCount <= 1 && (
          <button
            type="button"
            className="btn"
            aria-disabled={off}
            aria-busy={busy === 'copy-0' || undefined}
            aria-describedby={describedBy}
            onClick={() => copySlide(0, slideCount)}
          >
            <CopyIcon size={16} />
            Copy image
          </button>
        )}
        <button
          ref={printButton}
          type="button"
          className="btn btn-primary"
          aria-disabled={off}
          aria-busy={preparing || working || undefined}
          aria-describedby={describedBy}
          onClick={kind === 'pdf' ? print : () => downloadSlides(null, slideCount)}
        >
          {(preparing || working) && <span className="spinner" aria-hidden="true" />}
          {preparing ? 'Preparing…' : primaryLabel}
        </button>
      </div>
    </>
  )

  return (
    <>
      <Modal title="Export timeline" onClose={onClose} width={1100} className="xp-dialog" footer={footer}>
        <ExportOptions
          settings={settings}
          note={note}
          preparedBy={preparedByText(settings, me)}
          scope={scopeLine(shownTeams, query)}
          pageCounts={{
            a4: assets.ready ? (papers?.a4.value?.pages.length ?? null) : null,
            a3: assets.ready ? (papers?.a3.value?.pages.length ?? null) : null,
          }}
          periodLabels={periodLabels}
          months={months}
          counts={{
            subtasks: includeCounts(plan, shown.settings).subtasks,
            undated: includeCounts(pdf.value, shown.settings).undated,
          }}
          phone={BROWSER.phone}
          onChange={update}
          onChooseMonths={chooseMonths}
          onNote={setNote}
          onPreparedBy={(text) => update({ preparedBy: preparedByValue(text, me) })}
        />
        <ExportPreview
          format={kind}
          sheet={sheet}
          pages={pages}
          logoHref={assets.logoHref}
          ready={assets.ready}
          updating={shown !== source}
          problem={problem}
          problemId={problemId}
          status={statusLine(sentence, notices.length)}
          notices={notices}
          noticesRef={noticesRef}
          onFix={fix}
          slideActions={
            kind === 'png' && slideCount > 1
              ? {
                  canCopy: CAN_COPY,
                  busy,
                  disabled: !canAct,
                  onCopy: (index: number) => copySlide(index, slideCount),
                  onDownload: (index: number) => downloadSlides(index, slideCount),
                }
              : null
          }
          alt={alt ? { text: alt, onCopy: copyAlt } : null}
        />
      </Modal>
      <ExportDialogBoundary resetKey={portal} fallback={() => null}>
        <PrintPages
          pages={portal.pages}
          sheet={portal.sheet}
          logoHref={assets.logoHref}
          fileName={fileName}
          onBeforePrint={preparePrint}
          onAfterPrint={afterPrint}
          returnFocusTo={printButton}
        />
      </ExportDialogBoundary>
    </>
  )
}
