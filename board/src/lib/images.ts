// Shrinking images in the browser before they are uploaded, so attachments stay small: a 1600 px copy for
// viewing (a phone photo comes to about 0.2-0.4 MB) and a 400 px thumbnail. WebP where the browser can
// make it, otherwise JPEG (Safari).

export type ImageMime = 'image/webp' | 'image/jpeg'

export interface Encoded {
  blob: Blob
  width: number
  height: number
  mime: ImageMime
}

/** Width and height that fit within `max` on the longest side, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** "820 bytes", "245 KB", "1.2 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function encode(bitmap: ImageBitmap, max: number, quality: number, mime: ImageMime | null): Promise<Encoded> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot resize images.')
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  if (mime !== 'image/jpeg') {
    const webp = await toBlob(canvas, 'image/webp', quality)
    if (webp && webp.type === 'image/webp') return { blob: webp, width, height, mime: 'image/webp' }
  }
  // JPEG has no transparency, so put the image on white first.
  context.globalCompositeOperation = 'destination-over'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  const jpeg = await toBlob(canvas, 'image/jpeg', quality)
  if (!jpeg) throw new Error('This browser cannot save images.')
  return { blob: jpeg, width, height, mime: 'image/jpeg' }
}

/** The 1600 px copy and the 400 px thumbnail of an image (same format). Throws if the browser can't read it. */
export async function shrinkForUpload(file: Blob): Promise<{ full: Encoded; thumb: Encoded }> {
  const bitmap = await createImageBitmap(file)
  try {
    const full = await encode(bitmap, 1600, 0.82, null)
    const thumb = await encode(bitmap, 400, 0.72, full.mime)
    return { full, thumb }
  } finally {
    bitmap.close()
  }
}
