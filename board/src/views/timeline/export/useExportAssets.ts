// What the Timeline export needs from the browser before its pages can be measured and drawn: the fonts for
// its text, a measure in those fonts, and the Bristol FSAI logo. The logo is fetched once per visit and kept
// two ways: a data URL for SVG (so a hidden print sheet never waits for an image to load) and an ImageBitmap
// for canvas (same origin, so the canvas is never tainted). If it can't be loaded, pages leave it out.

import { useEffect, useRef, useState } from 'react'
import type { Measure } from './scene'
import { createMeasure, ensureFonts } from './measureText'

const LOGO_URL = `${import.meta.env.BASE_URL}logo-login-light.png`
/** Past these, the export goes ahead with fallback fonts or without the logo rather than wait on a slow network. */
const FONT_WAIT_MS = 4000
const LOGO_WAIT_MS = 8000

export interface ExportAssets {
  /** The fonts for the export's text have loaded (or given up) and the logo has loaded or failed */
  ready: boolean
  /** Goes up each time more fonts finish loading; `measure` is new each time, so the layout runs again */
  version: number
  measure: Measure
  /** The logo as a data URL for SVG, or null to leave it out */
  logoHref: string | null
  /** The logo for canvas, or null to leave it out */
  logoBitmap: ImageBitmap | null
}

interface Logo {
  href: string | null
  bitmap: ImageBitmap | null
}

const NO_LOGO: Logo = { href: null, bitmap: null }

let logoLoad: Promise<Logo> | null = null

/** The logo, fetched once; a failure isn't kept, so the next time the dialog opens it tries again. */
function loadLogo(): Promise<Logo> {
  logoLoad ??= within(fetchLogo(), LOGO_WAIT_MS, NO_LOGO).then((logo) => {
    if (!logo.href) logoLoad = null
    return logo
  })
  return logoLoad
}

async function fetchLogo(): Promise<Logo> {
  try {
    const response = await fetch(LOGO_URL)
    if (!response.ok) return NO_LOGO
    const blob = await response.blob()
    const [href, bitmap] = await Promise.all([
      dataUrl(blob).catch(() => null),
      typeof createImageBitmap === 'function' ? createImageBitmap(blob).catch(() => null) : Promise.resolve(null),
    ])
    return { href, bitmap }
  } catch {
    return NO_LOGO
  }
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No data URL')))
    reader.onerror = () => reject(reader.error ?? new Error('The logo could not be read'))
    reader.readAsDataURL(blob)
  })
}

/** `promise`, or `fallback` if it takes longer than `ms`. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

/** How many of the document's font faces have loaded (each unicode-range subset is a face). */
function loadedFaces(): number {
  let count = 0
  document.fonts?.forEach((face) => {
    if (face.status === 'loaded') count++
  })
  return count
}

/**
 * Loads the fonts `text` needs (the export's text, so new scripts in titles and names load before they are
 * measured) and the logo, and says when both are ready. When more fonts finish loading the measure is
 * replaced, so the layout measures again in the real faces.
 */
export function useExportAssets(text: string): ExportAssets {
  const [fonts, setFonts] = useState(() => ({ version: 0, measure: createMeasure() }))
  const [fontsReady, setFontsReady] = useState(false)
  const [logo, setLogo] = useState<Logo | null>(null)
  // Faces loaded when the current measure was made: read and written only in effects and listeners.
  const faces = useRef(0)

  useEffect(() => {
    const set = document.fonts
    faces.current = loadedFaces()
    if (!set) return
    const remeasure = () => {
      faces.current = loadedFaces()
      setFonts((current) => ({ version: current.version + 1, measure: createMeasure() }))
    }
    set.addEventListener('loadingdone', remeasure)
    return () => set.removeEventListener('loadingdone', remeasure)
  }, [])

  useEffect(() => {
    let live = true
    void within(ensureFonts(text), FONT_WAIT_MS, undefined).then(() => {
      if (!live) return
      setFontsReady(true)
      // In case a face loaded without a loadingdone event reaching us.
      const now = loadedFaces()
      if (now !== faces.current) {
        faces.current = now
        setFonts((current) => ({ version: current.version + 1, measure: createMeasure() }))
      }
    })
    return () => {
      live = false
    }
  }, [text])

  useEffect(() => {
    let live = true
    void loadLogo().then((loaded) => {
      if (live) setLogo(loaded)
    })
    return () => {
      live = false
    }
  }, [])

  return {
    ready: fontsReady && logo !== null,
    version: fonts.version,
    measure: fonts.measure,
    logoHref: logo?.href ?? null,
    logoBitmap: logo?.bitmap ?? null,
  }
}
