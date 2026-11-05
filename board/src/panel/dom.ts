// Small DOM helpers for keyboard use in the panel.

import type { KeyboardEvent } from 'react'

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** Text boxes, where Escape should first just leave the box. */
export function isTextEntry(target: EventTarget | null): target is HTMLElement {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type)
  return target instanceof HTMLElement && target.isContentEditable
}

/** Move focus to the panel itself, leaving any text box (which saves it). */
export function focusPanel(from: Element): void {
  from.closest<HTMLElement>('.ip-panel')?.focus({ preventScroll: true })
}

/** Close a <Dropdown> from inside its menu and give focus back to its toggle button. */
export function closeMenu(close: () => void, from: Element): void {
  const toggle = from.closest('.dropdown')?.querySelector<HTMLButtonElement>(':scope > button')
  close()
  toggle?.focus()
}

const FOCUSABLE = 'input:not(:disabled), button:not(:disabled), a[href]'

/** onKeyDown for a menu: the up and down arrows move focus between its controls. */
export function arrowKeyFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (controls.length === 0) return
  event.preventDefault()
  const index = controls.indexOf(document.activeElement as HTMLElement)
  const step = event.key === 'ArrowDown' ? 1 : -1
  const next = index === -1 ? (step === 1 ? 0 : controls.length - 1) : (index + step + controls.length) % controls.length
  controls[next].focus()
}
