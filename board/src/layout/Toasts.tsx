import { AlertIcon, InfoIcon, XIcon } from '@primer/octicons-react'
import { dismissToast, useBoard } from '../store/board'

/** Short messages (mostly "couldn't save … the change was undone"), bottom right. */
export function Toasts() {
  const toasts = useBoard((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.kind === 'error' ? <AlertIcon className="toast-icon" /> : <InfoIcon className="toast-icon" />}
          <p className="toast-text">{toast.message}</p>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <XIcon />
          </button>
        </div>
      ))}
    </div>
  )
}
