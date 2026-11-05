import { XIcon } from '@primer/octicons-react'
import { useId, useState } from 'react'
import { pushToast, updateItemList } from '../store/board'
import type { Item } from '../types'
import { canonicalLabel, suggestLabels, useAllLabels } from './labels'

/** Labels as removable chips, plus a box to add one (suggesting labels already in use). */
export function LabelsEditor({ item }: { item: Item }) {
  const all = useAllLabels()
  const [text, setText] = useState('')
  const listId = useId()
  const suggestions = suggestLabels(all, item.labels, text)

  const add = () => {
    const label = canonicalLabel(all, text)
    if (!label) return
    if (label.length > 50) {
      pushToast('error', 'Labels can be at most 50 characters.')
      return
    }
    setText('')
    if (!item.labels.some((existing) => existing.toLowerCase() === label.toLowerCase())) {
      void updateItemList(item.id, 'labels', { add: [label] })
    }
  }

  return (
    <div className="ip-labels">
      {item.labels.map((label) => (
        <span key={label} className="chip chip-plain ip-label">
          {label}
          <button
            type="button"
            className="ip-label-remove"
            aria-label={`Remove label ${label}`}
            onClick={() => void updateItemList(item.id, 'labels', { remove: [label] })}
          >
            <XIcon size={12} />
          </button>
        </span>
      ))}
      <input
        className="input ip-label-input"
        value={text}
        list={listId}
        maxLength={50}
        placeholder="Add a label"
        aria-label="Add a label"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            add()
          }
        }}
        onBlur={() => {
          if (text.trim()) add()
        }}
      />
      <datalist id={listId}>
        {suggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </div>
  )
}
