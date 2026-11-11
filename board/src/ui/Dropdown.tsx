import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface DropdownProps {
  /** Content of the toggle button */
  label: ReactNode
  /** Accessible name when the label is only an icon */
  ariaLabel?: string
  buttonClassName?: string
  /** Which edge of the button the menu lines up with */
  align?: 'left' | 'right'
  /** Menu width in px (capped to the screen) */
  width?: number
  /** Menu content; call `close()` after an action */
  children: (close: () => void) => ReactNode
}

/** A button that opens a floating menu/panel. Closes on outside click and Escape. */
export function Dropdown({ label, ariaLabel, buttonClassName = 'btn', align = 'left', width = 260, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      // A dialog opened over the open menu (Ctrl/Cmd+P's Export, say) gets the Escape as well: the menu,
      // inert behind it, just closes, and its button can't take focus.
      const dialog = document.querySelector('dialog[open]')
      if (dialog && !dialog.contains(wrapperRef.current)) return
      // Close only this menu: not the dialog or panel it sits in.
      event.preventDefault()
      event.stopPropagation()
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div className="dropdown" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div
          id={menuId}
          className={`dropdown-menu dropdown-${align}`}
          style={{ width: `min(${width}px, calc(100vw - 16px))` }}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
