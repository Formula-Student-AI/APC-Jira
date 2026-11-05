// Light, dark, or match the device (Jira's three choices). Remembered on this device and applied as
// <html data-theme="light|dark">. index.html applies the saved choice before the first paint, so the page
// never flashes the wrong theme; keep its inline script in step with this file.

import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_KEY = 'fsai-board:theme'

const listeners = new Set<() => void>()
const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function readThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

let choice: ThemeChoice = readThemeChoice()

/** The theme a choice comes to now ('system' follows the device). */
export function resolveTheme(value: ThemeChoice, deviceIsDark: boolean): 'light' | 'dark' {
  return value === 'system' ? (deviceIsDark ? 'dark' : 'light') : value
}

/** Puts the current choice on the page (and the browser's toolbar colour). */
export function applyTheme(): void {
  const theme = resolveTheme(choice, darkQuery?.matches ?? false)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d2125' : '#ffffff')
}

function changed(): void {
  applyTheme()
  for (const listener of listeners) listener()
}

export function setThemeChoice(next: ThemeChoice): void {
  choice = next
  try {
    if (next === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, next)
  } catch {
    // Storage unavailable (private mode): the choice lasts until the page is closed.
  }
  changed()
}

if (typeof window !== 'undefined') {
  // Follow the device while on "match device", and choices made in another tab.
  darkQuery?.addEventListener('change', () => {
    if (choice === 'system') changed()
  })
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_KEY && event.key !== null) return
    choice = readThemeChoice()
    changed()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current choice; re-renders when it changes. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, () => choice, () => choice)
}
