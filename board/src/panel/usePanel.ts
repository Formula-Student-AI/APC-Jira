// Focus and Escape handling for the side panel.

import { useEffect, type RefObject } from 'react'
import { closeItem } from '../lib/router'
import { isTextEntry } from './dom'

/**
 * Moves focus into the panel when it opens or shows another item, and gives focus back to whatever
 * opened it (such as a card) when it closes, unless focus has meanwhile moved somewhere else.
 */
export function usePanelFocus(panelRef: RefObject<HTMLElement | null>, number: number): void {
  useEffect(() => {
    const panel = panelRef.current
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body && !panel?.contains(active) ? active : null
    return () => {
      const now = document.activeElement
      const lost = !now || now === document.body || (panel?.contains(now) ?? false)
      if (opener?.isConnected && lost) opener.focus()
    }
  }, [panelRef])

  useEffect(() => {
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
  }, [panelRef, number])
}

/**
 * Escape closes the panel. In one of the panel's text boxes the first Escape just leaves the box
 * (which saves it); text boxes elsewhere, such as the filter box, keep Escape for themselves.
 */
export function usePanelEscape(panelRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      // An open dialog (such as the delete confirmation) handles its own Escape.
      if (document.querySelector('dialog[open]')) return
      const panel = panelRef.current
      if (isTextEntry(event.target)) {
        if (panel?.contains(event.target)) {
          event.preventDefault()
          panel.focus({ preventScroll: true })
        }
        return
      }
      event.preventDefault()
      closeItem()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [panelRef])
}
