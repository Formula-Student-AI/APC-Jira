// Keeps a fault in drawing the export's pages inside the Export dialog. The app has no error boundary, so an
// error thrown while rendering a page (in the preview or the print portal) would otherwise unmount the whole
// board. New pages (a new resetKey) try drawing again.

import { Component, type ReactNode } from 'react'

interface ExportDialogBoundaryProps {
  /** What to show instead, given the error's message */
  fallback: (message: string) => ReactNode
  /** When it changes (new pages), drawing is tried again */
  resetKey: unknown
  children: ReactNode
}

interface BoundaryState {
  error: string | null
  key: unknown
}

export class ExportDialogBoundary extends Component<ExportDialogBoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  static getDerivedStateFromProps(props: ExportDialogBoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    return props.resetKey === state.key ? null : { error: null, key: props.resetKey }
  }

  render() {
    return this.state.error === null ? this.props.children : this.props.fallback(this.state.error)
  }
}
