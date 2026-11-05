/** A phase: a period with brackets at both ends (in the accent colour unless --phase is set). */
export function PhaseIcon({ size = 12, label = 'Phase' }: { size?: number; label?: string }) {
  return (
    <svg className="phase-icon" width={size} height={size} viewBox="0 0 12 12" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M1 2.5h10v4.5H9.4L8.5 9.5 7.6 7H4.4L3.5 9.5 2.6 7H1Z" />
    </svg>
  )
}
