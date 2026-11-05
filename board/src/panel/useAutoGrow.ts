// Grow a textarea to fit its text (its `rows` attribute is the minimum height).

import { useEffect, useLayoutEffect, type RefObject } from 'react'

function fit(el: HTMLTextAreaElement): void {
  // Collapsing the box for a moment can make scrolled ancestors jump: remember where they were.
  const scrolled: [HTMLElement, number][] = []
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node.scrollTop > 0) scrolled.push([node, node.scrollTop])
  }
  const style = getComputedStyle(el)
  const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + borders}px`
  for (const [node, top] of scrolled) node.scrollTop = top
}

export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    if (ref.current) fit(ref.current)
  }, [ref, value])

  // Wrapping changes when the width does (panel resized, phone rotated).
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.offsetWidth
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === width) return
      width = el.offsetWidth
      fit(el)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
}
