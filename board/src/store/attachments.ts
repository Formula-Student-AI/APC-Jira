// Attachments (images) on items. An upload is: shrink in the browser, add the row (the database checks
// the limits and names the files), then upload the two files. The bucket is private, so images are shown
// through signed links that last an hour.

import { useEffect, useState } from 'react'
import { shrinkForUpload } from '../lib/images'
import { supabase } from '../lib/supabase'
import type { Attachment } from '../types'
import { dropAttachment, pushToast, putAttachment } from './board'

const BUCKET = 'attachments'
/** Same limits as the database (see attachments in schema.sql). */
export const MAX_PER_ITEM = 20
export const MAX_TOTAL_BYTES = 900 * 1024 * 1024
const MAX_FILE_BYTES = 2 * 1024 * 1024
/** Bigger originals are refused before reading, to spare the browser's memory. */
const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024

/** Add one image to an item. Explains any problem in a toast; returns whether it was added. */
export async function uploadImage(itemId: string, file: File): Promise<boolean> {
  const name = file.name || 'Pasted image'
  if (file.size > MAX_ORIGINAL_BYTES) {
    pushToast('error', `${name} is too big to attach (over 40 MB).`)
    return false
  }
  let shrunk: Awaited<ReturnType<typeof shrinkForUpload>>
  try {
    shrunk = await shrinkForUpload(file)
  } catch {
    pushToast('error', `Couldn't read ${name}. Attach a JPEG, PNG, WebP or GIF image (export HEIC photos as JPEG first).`)
    return false
  }
  const { full, thumb } = shrunk
  if (full.blob.size > MAX_FILE_BYTES) {
    pushToast('error', `${name} is still over 2 MB after shrinking, so it can't be attached.`)
    return false
  }

  const { data: row, error } = await supabase
    .from('attachments')
    .insert({
      item_id: itemId,
      name,
      mime: full.mime,
      size: full.blob.size,
      thumb_size: thumb.blob.size,
      width: full.width,
      height: full.height,
      path: '',
      thumb_path: '',
    })
    .select()
    .single()
  if (error || !row) {
    pushToast('error', `Couldn't attach ${name}: ${error?.message ?? 'unknown problem'}`)
    return false
  }

  const attachment = row as Attachment
  const storage = supabase.storage.from(BUCKET)
  const first = await storage.upload(attachment.path, full.blob, { contentType: full.mime, upsert: false })
  const second = first.error
    ? first
    : await storage.upload(attachment.thumb_path, thumb.blob, { contentType: thumb.mime, upsert: false })
  if (first.error || second.error) {
    // Undo: the row first (its files may then be removed), then whatever did upload.
    await supabase.from('attachments').delete().eq('id', attachment.id)
    if (!first.error) await storage.remove([attachment.path])
    pushToast('error', `Couldn't upload ${name}: ${(first.error ?? second.error)?.message ?? 'unknown problem'}`)
    return false
  }
  putAttachment(attachment)
  return true
}

/** Remove an attachment: its row (the person who added it, or a board admin), then its files. */
export async function deleteAttachment(attachment: Attachment): Promise<void> {
  dropAttachment(attachment.id)
  const { data, error } = await supabase.from('attachments').delete().eq('id', attachment.id).select('id')
  if (error || !data?.length) {
    putAttachment(attachment)
    pushToast(
      'error',
      `Couldn't remove ${attachment.name}: ${error?.message ?? 'only the person who added it, or a board admin, can remove it'}`,
    )
    return
  }
  // If this fails the files stay behind unused; they no longer count towards the limits.
  await supabase.storage.from(BUCKET).remove([attachment.path, attachment.thumb_path])
}

// ------------------------------------------------------------------------------------------ signed links

const LINK_SECONDS = 3600
const cache = new Map<string, { url: string; until: number }>()
const waiting = new Map<string, ((url: string | null) => void)[]>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

/** All paths asked for within a moment go in one request. */
async function flush(): Promise<void> {
  flushTimer = null
  const batch = new Map(waiting)
  waiting.clear()
  const paths = [...batch.keys()]
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS)
  for (const path of paths) {
    const entry = data?.find((d) => d.path === path)
    const url = entry && !entry.error && entry.signedUrl ? entry.signedUrl : null
    if (url) cache.set(path, { url, until: Date.now() + LINK_SECONDS * 1000 })
    for (const resolve of batch.get(path) ?? []) resolve(url)
  }
}

/** A signed link to a file, or null if it can't be had (yet). */
export function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.until > Date.now() + 60_000) return Promise.resolve(hit.url)
  return new Promise((resolve) => {
    waiting.set(path, [...(waiting.get(path) ?? []), resolve])
    flushTimer ??= setTimeout(() => void flush(), 20)
  })
}

/**
 * The signed link for a file, for an <img>. A file someone has only just added may not be uploaded yet,
 * so it asks again a few times.
 */
export function useSignedUrl(path: string | null): string | null {
  const [found, setFound] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    let tries = 0
    const attempt = () => {
      void signedUrl(path).then((url) => {
        if (!alive) return
        if (url) setFound({ path, url })
        else if (++tries < 5) setTimeout(attempt, 1500)
      })
    }
    attempt()
    return () => {
      alive = false
    }
  }, [path])
  return found && found.path === path ? found.url : null
}

/** A signed link that downloads the file under its original name. */
export function downloadUrl(url: string, name: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`
}
