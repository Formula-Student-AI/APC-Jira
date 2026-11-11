// Shown instead of the Export dialog when its code can't be loaded: after a redeploy (the old chunk is gone)
// or offline. The app has no error boundary, so a failed import that wasn't caught would take the whole app
// down. Part of the main bundle, so it imports nothing from the export's own chunk.

import { Modal } from '../../../ui/Modal'
import type { ExportDialogProps } from './ExportDialog'

/** Takes the dialog's props, so the Timeline can render it in the dialog's place. */
export function ExportUnavailable({ onClose }: ExportDialogProps) {
  return (
    <Modal
      title="Export timeline"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </>
      }
    >
      <p>Couldn't open Export. Reload the page and try again.</p>
    </Modal>
  )
}
