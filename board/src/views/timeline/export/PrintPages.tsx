// The Timeline export's print portal. While the Export dialog is open, <body> holds a hidden copy of the PDF's
// pages at their true size, with every print rule in its own <style>, so the Print button, Ctrl/Cmd+P and
// File > Print all print the same pages. It stays mounted the whole time: mounting it on the click and
// awaiting anything before print() breaks Safari's gesture rule, and removing it as soon as print() returns
// empties the print in browsers where print() doesn't block.

import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { SheetSpec } from './exportSheets'
import { printCss, restoreTitle, setPrintTitle } from './PrintPagesSetup'
import type { Page } from './scene'
import { SvgPage } from './SvgPage'

export interface PrintPagesProps {
  pages: Page[]
  /** The sheet the pages were laid out for (A4 or A3) */
  sheet: SheetSpec
  logoHref: string | null
  /** The PDF's file name: the page's title while printing, which browsers offer as the name */
  fileName: string
  /** Before every print (the button, Ctrl/Cmd+P or File > Print), so the pages can be brought up to date */
  onBeforePrint: () => void
  onAfterPrint: () => void
  /** The Print button: focus goes back to it if the print window left focus nowhere */
  returnFocusTo: RefObject<HTMLElement | null>
}

export function PrintPages(props: PrintPagesProps) {
  const { pages, sheet, logoHref, fileName, onBeforePrint, onAfterPrint, returnFocusTo } = props
  // The listeners are added once and read the latest props from here.
  const latest = useRef({ fileName, onBeforePrint, onAfterPrint, returnFocusTo })
  useEffect(() => {
    latest.current = { fileName, onBeforePrint, onAfterPrint, returnFocusTo }
  })

  useEffect(() => {
    const before = () => {
      latest.current.onBeforePrint()
      setPrintTitle(latest.current.fileName)
    }
    const after = () => {
      restoreTitle()
      latest.current.onAfterPrint()
      // Safari doesn't focus a clicked button, and the print window can leave focus on <body>.
      const button = latest.current.returnFocusTo.current
      const active = document.activeElement
      if (button?.isConnected && (!active || active === document.body)) button.focus()
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
      // Closed mid-print, where printing doesn't block: put the title back anyway.
      restoreTitle()
    }
  }, [])

  return createPortal(
    <div className="xp-print">
      <style>{printCss(sheet)}</style>
      {pages.map((page, index) => (
        <div key={index} className="xp-sheet">
          <SvgPage page={page} sheet={sheet} size="print" logoHref={logoHref} />
        </div>
      ))}
    </div>,
    document.body,
  )
}
