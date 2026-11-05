import { useBoard, type LiveState } from '../store/board'

const TEXT: Record<LiveState, [label: string, hint: string]> = {
  live: ['Live', 'Changes from everyone appear here instantly.'],
  connecting: ['Connecting…', 'Connecting to live updates.'],
  reconnecting: ['Reconnecting…', 'The live connection dropped. The board catches up as soon as it is back.'],
  offline: ['Offline', "No internet connection. Changes can't be saved until you're back online."],
}

/** Live-connection status: a coloured dot, with a label on wider screens. */
export function LiveIndicator() {
  const live = useBoard((s) => s.live)
  const [label, hint] = TEXT[live]
  return (
    <span className={`hdr-live hdr-live-${live}`} title={hint} role="status" aria-label={`${label}. ${hint}`}>
      <span className="hdr-live-dot" aria-hidden="true" />
      <span className="hdr-live-label" aria-hidden="true">
        {label}
      </span>
    </span>
  )
}
