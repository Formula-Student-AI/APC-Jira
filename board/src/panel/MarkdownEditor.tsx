import { MarkdownIcon } from '@primer/octicons-react'
import { lazy, Suspense, useRef, useState } from 'react'
import type { Item } from '../types'
import { saveDescription } from './saves'
import { useAutoGrow } from './useAutoGrow'
import { useDraft } from './useDebouncedSave'

const MarkdownPreview = lazy(() => import('./MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })))

/** Description with Write / Preview tabs; saves while typing (debounced) and when leaving the box. */
export function MarkdownEditor({ item }: { item: Item }) {
  const [tab, setTab] = useState<'write' | 'preview'>(item.description.trim() ? 'preview' : 'write')
  const ref = useRef<HTMLTextAreaElement>(null)
  const draft = useDraft(item.description, (value) => saveDescription(item.id, value), 800)
  useAutoGrow(ref, draft.value)

  return (
    <div className="ip-md">
      <div className="ip-md-tabs" role="tablist" aria-label="Description">
        <button type="button" role="tab" aria-selected={tab === 'write'} className="ip-md-tab" onClick={() => setTab('write')}>
          Write
        </button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className="ip-md-tab" onClick={() => setTab('preview')}>
          Preview
        </button>
        <span className="ip-md-hint">
          <MarkdownIcon size={14} />
          Markdown
        </span>
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ref}
          className="textarea ip-md-text"
          rows={8}
          maxLength={50000}
          value={draft.value}
          placeholder="Add a description… Markdown is supported."
          aria-label="Description"
          onChange={(event) => draft.change(event.target.value)}
          onBlur={draft.commit}
        />
      ) : (
        <div className="ip-md-preview" onDoubleClick={() => setTab('write')}>
          {draft.value.trim() ? (
            <Suspense fallback={<p className="muted">Loading preview…</p>}>
              <MarkdownPreview text={draft.value} />
            </Suspense>
          ) : (
            <p className="muted">No description yet. Markdown is supported.</p>
          )}
        </div>
      )}
    </div>
  )
}
