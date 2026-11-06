import { XIcon } from '@primer/octicons-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Buttons shown at the bottom right */
  footer?: ReactNode
  width?: number
}

/** Accessible modal built on <dialog>: focus is trapped, Escape and the backdrop close it. */
export function Modal({ title, onClose, children, footer, width = 480 }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    // React's autoFocus runs before the dialog opens, when nothing in it can take focus; showModal() then
    // focuses the first button (Close). So the box to type in is marked data-autofocus and focused here.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onCancel = (event: Event) => {
      event.preventDefault()
      onCloseRef.current()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      style={{ width: `min(${width}px, calc(100vw - 24px))` }}
      onMouseDown={(event) => {
        // A press on the backdrop (outside the content box) closes the dialog.
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={onClose}>
            <XIcon />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </dialog>
  )
}
