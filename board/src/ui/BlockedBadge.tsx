import { BlockedIcon } from '@primer/octicons-react'

/** Red "Blocked" badge shown on blocked items (status = Blocked). */
export function BlockedBadge({ reason }: { reason?: string | null }) {
  return (
    <span className="badge badge-blocked" title={reason ? `Blocked: ${reason}` : 'Blocked'}>
      <BlockedIcon size={12} />
      Blocked
    </span>
  )
}
