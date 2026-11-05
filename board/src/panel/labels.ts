// Label suggestions: every label already used on any item.

import { useMemo } from 'react'
import { useBoard } from '../store/board'
import type { Item } from '../types'

/** Labels used on the given items, once each (first spelling wins), A to Z. */
export function collectLabels(items: Item[]): string[] {
  const byKey = new Map<string, string>()
  for (const item of items) {
    for (const label of item.labels) {
      const key = label.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, label)
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}

export function useAllLabels(): string[] {
  const items = useBoard((s) => s.items)
  return useMemo(() => collectLabels(Object.values(items)), [items])
}

/** Labels matching what was typed and not on the item yet. Those starting with the text come first. */
export function suggestLabels(all: string[], current: string[], query: string, limit = 8): string[] {
  const taken = new Set(current.map((label) => label.toLowerCase()))
  const q = query.trim().toLowerCase()
  const matches = all.filter((label) => !taken.has(label.toLowerCase()) && label.toLowerCase().includes(q))
  const starts = matches.filter((label) => label.toLowerCase().startsWith(q))
  const rest = matches.filter((label) => !label.toLowerCase().startsWith(q))
  return [...starts, ...rest].slice(0, limit)
}

/** Tidy a typed label, reusing the existing spelling when the label is already used ("Urgent" -> "urgent"). */
export function canonicalLabel(all: string[], typed: string): string {
  const label = typed.trim().replace(/\s+/g, ' ')
  return all.find((existing) => existing.toLowerCase() === label.toLowerCase()) ?? label
}
