/** A milestone's diamond (in the accent colour unless --milestone is set). */
export function MilestoneIcon({ size = 12, label = 'Milestone' }: { size?: number; label?: string }) {
  return (
    <svg className="milestone-icon" width={size} height={size} viewBox="0 0 12 12" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M6 .7 11.3 6 6 11.3.7 6Z" />
    </svg>
  )
}
