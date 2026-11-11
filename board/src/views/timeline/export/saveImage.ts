// Slide images: painting a page onto a canvas and handing the PNG to the user (download or clipboard).
// Kept thin because it needs the browser: what goes on the canvas is all paintCanvas, tested in node.

import { INK } from './exportPalette'
import { paintPage } from './paintCanvas'
import type { Page } from './scene'

export interface ImageAssets {
  /** The logo as an ImageBitmap (same origin, so the canvas isn't tainted), or null to leave it out */
  logo: ImageBitmap | null
}

const CANT_MAKE = "Couldn't make the image on this device."

/** The largest canvas older iOS will draw (16.7 megapixels), the lowest of any browser's limits. A slide is 8.3. */
const MAX_PIXELS = 4096 * 4096

interface Surface {
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  encode: () => Promise<Blob | null>
  release: () => void
}

/** An OffscreenCanvas where the browser can draw on one, else a <canvas> that is never put in the page. */
function makeSurface(width: number, height: number): Surface | null {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height)
    // Shrinking a canvas to nothing frees its memory at once; Safari on phones would otherwise keep it a while.
    const release = () => {
      canvas.width = 0
      canvas.height = 0
    }
    // Safari 16.0 to 16.3 have OffscreenCanvas but can't draw 2D on it.
    const context = canvas.getContext('2d')
    if (context) return { context, encode: () => canvas.convertToBlob({ type: 'image/png' }), release }
    release()
  }
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const release = () => {
    canvas.width = 0
    canvas.height = 0
  }
  const context = canvas.getContext('2d')
  if (context) return { context, encode: () => new Promise((resolve) => canvas.toBlob(resolve, 'image/png')), release }
  release()
  return null
}

async function paintPng(page: Page, assets: ImageAssets, pxPerPt: number): Promise<Blob> {
  // Whole pixels, rounding up so the page's last part-pixel is kept (the slide is exactly 3840 × 2160).
  const width = Math.ceil(page.width * pxPerPt - 1e-6)
  const height = Math.ceil(page.height * pxPerPt - 1e-6)
  if (!(width > 0 && height > 0 && width * height <= MAX_PIXELS)) throw new Error(CANT_MAKE)
  let surface: Surface | null = null
  try {
    surface = makeSurface(width, height)
    if (surface) {
      const { context } = surface
      context.imageSmoothingQuality = 'high'
      // As SvgPage's text-rendering: glyphs keep the widths they were measured at, unhinted (where supported).
      context.textRendering = 'geometricPrecision'
      // White to the last pixel; paintPage then paints the page itself white too, and everything on it.
      context.fillStyle = INK.white
      context.fillRect(0, 0, width, height)
      paintPage(context, page, pxPerPt, { logo: assets.logo }, (d) => new Path2D(d))
      const blob = await surface.encode()
      if (blob) return blob
    }
  } catch (error) {
    throw new Error(CANT_MAKE, { cause: error })
  } finally {
    surface?.release()
  }
  throw new Error(CANT_MAKE)
}

// Renders wait for the one before to finish, so a second click can't put a second 8-megapixel canvas in memory.
let queue: Promise<unknown> = Promise.resolve()

/**
 * The page as a PNG at `pxPerPt` pixels per point (SLIDE_PX_PER_PT for slides: 3840 × 2160 px), on white.
 * Uses one canvas at a time and releases it afterwards. Rejects with a plain-English Error if the device
 * can't make the image.
 */
export function renderPng(page: Page, assets: ImageAssets, pxPerPt: number): Promise<Blob> {
  const png = queue.then(() => paintPng(page, assets, pxPerPt))
  queue = png.catch(() => undefined)
  return png
}

/** Saves a blob as a file (an object URL and <a download>, revoked after a moment). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  // Older Firefox ignores a click on a link that isn't in the document, so it is added just for the click.
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking straight away can cancel a download that hasn't started yet (Firefox, Safari).
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Whether this browser can put a PNG on the clipboard (ClipboardItem and navigator.clipboard.write). */
export function canCopyImages(): boolean {
  if (typeof ClipboardItem === 'undefined' || typeof navigator === 'undefined') return false
  // There is no navigator.clipboard on a page that isn't secure: GitHub Pages is HTTPS, but the dev server
  // opened on a phone over the network is plain http.
  if (typeof navigator.clipboard?.write !== 'function') return false
  // ClipboardItem.supports came later; every browser with ClipboardItem but without it takes PNGs.
  return typeof ClipboardItem.supports !== 'function' || ClipboardItem.supports('image/png')
}

/**
 * Puts a PNG on the clipboard. Call it inside the click with the blob's promise (not an awaited blob):
 * Safari needs the ClipboardItem made during the gesture.
 */
export async function copyPng(blob: Promise<Blob>): Promise<void> {
  if (!canCopyImages()) {
    void blob.catch(() => undefined)
    throw new Error("This browser can't copy images. Download the image instead.")
  }
  // An async function runs straight through to its first await, so the item is made and the write starts
  // while the click is still being handled.
  const item = new ClipboardItem({ 'image/png': blob })
  try {
    await navigator.clipboard.write([item])
  } catch (error) {
    // If the image itself couldn't be made, that is the error to show (awaiting the blob throws it).
    await blob
    throw new Error("Couldn't copy the image. Download it instead.", { cause: error })
  }
}
