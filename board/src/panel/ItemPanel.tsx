// The side panel for one item (route ?item=N): edit everything, see its history.
// Every change saves straight away (typing is debounced) and shows a "Saved" state.

import {
  ArchiveIcon,
  CheckIcon,
  KebabHorizontalIcon,
  LinkIcon,
  MarkGithubIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
} from '@primer/octicons-react'
import { useRef, useState } from 'react'
import { closeItem } from '../lib/router'
import { timeAgo, formatDateTime } from '../lib/format'
import { archiveItem, deleteItem, pushToast, restoreItem, useBoard } from '../store/board'
import { useIsBoardAdmin, useItemByNumber, useSaveState } from '../store/hooks'
import type { Item } from '../types'
import { Dropdown } from '../ui/Dropdown'
import { Modal } from '../ui/Modal'
import { BlockingSection } from './BlockingSection'
import { focusPanel } from './dom'
import { History } from './History'
import { MarkdownEditor } from './MarkdownEditor'
import { PanelFields } from './PanelFields'
import { saveTitle } from './saves'
import { useAutoGrow } from './useAutoGrow'
import { useDraft } from './useDebouncedSave'
import { useMinuteTick } from './useMinuteTick'
import { usePanelEscape, usePanelFocus } from './usePanel'
import './panel.css'

export function ItemPanel({ number }: { number: number }) {
  const item = useItemByNumber(number)
  const panelRef = useRef<HTMLElement>(null)
  usePanelFocus(panelRef, number)
  usePanelEscape(panelRef)

  return (
    <>
      <div className="ip-backdrop" onClick={closeItem} aria-hidden="true" />
      <aside ref={panelRef} className="ip-panel" tabIndex={-1} aria-label={`Item #${number}`}>
        {item ? (
          // Keyed by item, so drafts start fresh and pending saves flush when another item opens.
          <PanelContent key={item.id} item={item} />
        ) : (
          <div className="ip-missing">
            <p>Item #{number} wasn't found. It may have been deleted.</p>
            <button type="button" className="btn" onClick={closeItem}>
              Close
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

function PanelContent({ item }: { item: Item }) {
  return (
    <>
      <header className="ip-header">
        <span className="ip-number">#{item.number || '…'}</span>
        {item.archived && <span className="badge ip-archived">Archived</span>}
        <SaveIndicator itemId={item.id} />
        <span className="ip-spacer" />
        <PanelMenu item={item} />
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={closeItem}>
          <XIcon />
        </button>
      </header>
      <div className="ip-body">
        <TitleField item={item} />
        {item.archived && (
          <p className="ip-archived-note">
            This item is archived, so it's hidden from the views.{' '}
            <button type="button" className="ip-link-button" onClick={() => void restoreItem(item.id)}>
              Restore it
            </button>
          </p>
        )}
        <PanelFields item={item} />
        <BlockingSection item={item} />
        <section className="ip-section">
          <h3 className="ip-section-title">Description</h3>
          <MarkdownEditor item={item} />
        </section>
        <section className="ip-section">
          <h3 className="ip-section-title">History</h3>
          <History item={item} />
        </section>
        <MetaLine item={item} />
      </div>
    </>
  )
}

function TitleField({ item }: { item: Item }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const draft = useDraft(item.title, (value) => saveTitle(item.id, value), 600)
  useAutoGrow(ref, draft.value)
  return (
    <textarea
      ref={ref}
      className="ip-title"
      rows={1}
      maxLength={300}
      value={draft.value}
      aria-label="Title"
      onChange={(event) => draft.change(event.target.value.replace(/\n/g, ' '))}
      onBlur={draft.commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          draft.commit()
          focusPanel(event.currentTarget)
        }
      }}
    />
  )
}

function SaveIndicator({ itemId }: { itemId: string }) {
  const state = useSaveState(itemId)
  if (state === 'idle') return null
  return (
    <span className={`ip-save ip-save-${state}`} role="status">
      {state === 'saving' && <span className="spinner" aria-hidden="true" />}
      {state === 'saved' && <CheckIcon size={14} />}
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Not saved'}
    </span>
  )
}

function PanelMenu({ item }: { item: Item }) {
  const isAdmin = useIsBoardAdmin()
  const [confirming, setConfirming] = useState(false)
  const githubUrl = item.github_url?.startsWith('https://github.com/') ? item.github_url : null

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      pushToast('info', 'Link copied.')
    } catch {
      pushToast('error', "Couldn't copy the link. Copy it from the address bar instead.")
    }
  }

  return (
    <>
      <Dropdown
        label={<KebabHorizontalIcon />}
        ariaLabel="More actions"
        buttonClassName="btn btn-ghost btn-icon btn-sm"
        align="right"
        width={230}
      >
        {(close) => (
          <div>
            <button type="button" className="menu-item" onClick={() => { void copyLink(); close() }}>
              <LinkIcon /> Copy link
            </button>
            {githubUrl && (
              <a className="menu-item" href={githubUrl} target="_blank" rel="noopener noreferrer" onClick={close}>
                <MarkGithubIcon /> Open on GitHub
              </a>
            )}
            {item.archived ? (
              <button type="button" className="menu-item" onClick={() => { void restoreItem(item.id); close() }}>
                <UndoIcon /> Restore
              </button>
            ) : (
              <button type="button" className="menu-item" onClick={() => { void archiveItem(item.id); close() }}>
                <ArchiveIcon /> Archive
              </button>
            )}
            {isAdmin && (
              <>
                <div className="menu-divider" />
                <button type="button" className="menu-item menu-item-danger" onClick={() => { close(); setConfirming(true) }}>
                  <TrashIcon /> Delete permanently
                </button>
              </>
            )}
          </div>
        )}
      </Dropdown>
      {confirming && (
        <Modal
          title={`Delete #${item.number}?`}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  setConfirming(false)
                  if (await deleteItem(item.id)) closeItem()
                }}
              >
                Delete permanently
              </button>
            </>
          }
        >
          <p>
            This removes “{item.title}” for everyone. Its history is kept. To hide an item without deleting it, archive
            it instead.
          </p>
        </Modal>
      )}
    </>
  )
}

function MetaLine({ item }: { item: Item }) {
  const members = useBoard((s) => s.members)
  useMinuteTick()
  const name = (username: string | null) => (username ? (members[username]?.full_name ?? username) : 'a script')
  return (
    <p className="ip-meta">
      <span title={formatDateTime(item.created_at)}>
        Created by {name(item.created_by)} · {timeAgo(item.created_at)}
      </span>
      {item.updated_at !== item.created_at && (
        <span title={formatDateTime(item.updated_at)}>
          Last changed by {name(item.updated_by)} · {timeAgo(item.updated_at)}
        </span>
      )}
    </p>
  )
}
