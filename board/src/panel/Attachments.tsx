// Attachments: images on an item, as thumbnails. Add with "+", by dropping images on the section, or by
// pasting one anywhere in the panel. Click a thumbnail to see it full size, download or remove it.
// Images are shrunk before upload (see lib/images.ts), so they take little room.

import { DownloadIcon, ImageIcon, PlusIcon, TrashIcon } from '@primer/octicons-react'
import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { formatDateTime } from '../lib/format'
import { formatBytes } from '../lib/images'
import { MAX_PER_ITEM, deleteAttachment, downloadUrl, uploadImage, useSignedUrl } from '../store/attachments'
import { pushToast, useBoard } from '../store/board'
import { useIsBoardAdmin, useMe } from '../store/hooks'
import type { Attachment, Item } from '../types'
import { Modal } from '../ui/Modal'
import { memberName } from './members'

const NONE: Attachment[] = []
let uploadSeq = 0

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')

export function Attachments({ item }: { item: Item }) {
  const list = useBoard((s) => s.attachments[item.id]) ?? NONE
  const [uploads, setUploads] = useState<{ id: number; name: string }[]>([])
  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState<Attachment | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const ready = item.number > 0
  const room = MAX_PER_ITEM - list.length - uploads.length

  const add = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length < files.length) pushToast('info', 'Only images can be attached.')
    const take = images.slice(0, Math.max(0, room))
    if (images.length > take.length) pushToast('info', `An item can have at most ${MAX_PER_ITEM} attachments.`)
    for (const file of take) {
      const id = ++uploadSeq
      setUploads((current) => [...current, { id, name: file.name || 'Pasted image' }])
      try {
        await uploadImage(item.id, file)
      } finally {
        setUploads((current) => current.filter((upload) => upload.id !== id))
      }
    }
  }

  // Pasting an image anywhere in the panel (outside text boxes) attaches it. The listener reads the
  // latest `add` through a ref, so it is added once per item.
  const addRef = useRef(add)
  useEffect(() => {
    addRef.current = add
  })
  useEffect(() => {
    if (!ready) return
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if (!target?.closest('.ip-panel')) return
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'))
      if (files.length === 0) return
      event.preventDefault()
      void addRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [ready, item.id])

  return (
    <section
      className={`ip-section ip-attachments${dragging ? ' ip-attachments-drop' : ''}`}
      aria-labelledby={titleId}
      onDragOver={(event) => {
        if (!ready || !hasFiles(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        if (!ready || !hasFiles(event)) return
        event.preventDefault()
        setDragging(false)
        void add([...event.dataTransfer.files])
      }}
    >
      <div className="ip-links-head">
        <h3 className="ip-section-title" id={titleId}>
          Attachments{list.length > 0 ? ` (${list.length})` : ''}
        </h3>
        {ready && room > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Add images"
            title="Add images"
            onClick={() => inputRef.current?.click()}
          >
            <PlusIcon />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void add(files)
          }}
        />
      </div>

      {list.length === 0 && uploads.length === 0 ? (
        <p className="ip-link-none">{dragging ? 'Drop the images to attach them.' : 'No images yet. Add, drop or paste images here.'}</p>
      ) : (
        <ul className="ip-thumbs">
          {list.map((attachment) => (
            <Thumb key={attachment.id} attachment={attachment} onOpen={() => setOpen(attachment)} />
          ))}
          {uploads.map((upload) => (
            <li key={upload.id} className="ip-thumb ip-thumb-busy" aria-label={`Uploading ${upload.name}`}>
              <span className="ip-thumb-image">
                <span className="spinner" aria-hidden="true" />
              </span>
              <span className="ip-thumb-name">{upload.name}</span>
            </li>
          ))}
        </ul>
      )}
      {open && <Viewer attachment={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

function Thumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const url = useSignedUrl(attachment.thumb_path)
  return (
    <li className="ip-thumb">
      <button type="button" className="ip-thumb-image" title={attachment.name} onClick={onOpen}>
        {url ? <img src={url} alt={attachment.name} loading="lazy" /> : <ImageIcon size={20} aria-label={attachment.name} />}
      </button>
      <span className="ip-thumb-name" title={attachment.name}>
        {attachment.name}
      </span>
    </li>
  )
}

/** The full-size image, with who added it, Download and Remove. */
function Viewer({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const url = useSignedUrl(attachment.path)
  const members = useBoard((s) => s.members)
  const me = useMe()
  const admin = useIsBoardAdmin()
  const canRemove = admin || (!!me && attachment.created_by === me.username)
  const [confirming, setConfirming] = useState(false)

  return (
    <Modal
      title={attachment.name}
      onClose={onClose}
      width={980}
      footer={
        <>
          {canRemove &&
            (confirming ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  onClose()
                  void deleteAttachment(attachment)
                }}
              >
                <TrashIcon /> Remove for everyone
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
                <TrashIcon /> Remove
              </button>
            ))}
          {url && (
            <a className="btn" href={downloadUrl(url, attachment.name)} download={attachment.name}>
              <DownloadIcon /> Download
            </a>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="ip-viewer">
        {url ? <img src={url} alt={attachment.name} width={attachment.width} height={attachment.height} /> : <span className="spinner" />}
      </div>
      <p className="muted ip-viewer-meta">
        Added by {attachment.created_by ? memberName(members, attachment.created_by) : 'a script'},{' '}
        {formatDateTime(attachment.created_at)} · {attachment.width} × {attachment.height} · {formatBytes(attachment.size)}
      </p>
    </Modal>
  )
}
