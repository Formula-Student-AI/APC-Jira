// Tiny hash router so the app works on GitHub Pages: #/<view>?item=<number>&q=<filter>
import { useSyncExternalStore } from 'react'
import { DEFAULT_VIEW, viewById, type ViewId } from '../views/config'

export interface Route {
  view: ViewId
  /** Number of the item open in the side panel, if any */
  item: number | null
  /** Filter box text */
  q: string
}

const LAST_VIEW_KEY = 'fsai-board:last-view'

function readLastView(): ViewId {
  try {
    const stored = localStorage.getItem(LAST_VIEW_KEY)
    return viewById(stored)?.id ?? DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?', 2)
  const params = new URLSearchParams(query)
  const itemParam = Number(params.get('item'))
  return {
    view: viewById(path)?.id ?? readLastView(),
    item: Number.isInteger(itemParam) && itemParam > 0 ? itemParam : null,
    q: params.get('q') ?? '',
  }
}

export function formatHash(route: Route): string {
  const params = new URLSearchParams()
  if (route.item) params.set('item', String(route.item))
  if (route.q) params.set('q', route.q)
  const query = params.toString()
  return `#/${route.view}${query ? `?${query}` : ''}`
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

/** Current route; re-renders on hash changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getHash)
  return parseHash(hash)
}

/** Change part of the route. `replace` avoids adding a history entry (used while typing a filter). */
export function navigate(change: Partial<Route>, options: { replace?: boolean } = {}): void {
  const next = { ...parseHash(window.location.hash), ...change }
  try {
    localStorage.setItem(LAST_VIEW_KEY, next.view)
  } catch {
    // storage unavailable (private mode): the view just isn't remembered
  }
  const hash = formatHash(next)
  if (hash === window.location.hash) return
  if (options.replace) {
    history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}

export function openItem(number: number): void {
  navigate({ item: number })
}

export function closeItem(): void {
  navigate({ item: null })
}
