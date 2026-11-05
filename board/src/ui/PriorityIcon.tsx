// Jira-style priority icons: chevrons up (Highest, High), "=" (Medium), chevrons down (Low, Lowest).

import { OptionDot } from './OptionChip'

const RED = '#f15c43'
const ORANGE = '#f79232'
const BLUE = '#5b9bff'

const SHAPES = new Map<string, { color: string; paths: string[] }>([
  ['highest', { color: RED, paths: ['M3.5 8 8 3.5 12.5 8', 'M3.5 12.5 8 8 12.5 12.5'] }],
  ['high', { color: RED, paths: ['M3.5 10.5 8 6 12.5 10.5'] }],
  ['medium', { color: ORANGE, paths: ['M3 6h10', 'M3 10h10'] }],
  ['low', { color: BLUE, paths: ['M3.5 5.5 8 10 12.5 5.5'] }],
  ['lowest', { color: BLUE, paths: ['M3.5 3.5 8 8 12.5 3.5', 'M3.5 8 8 12.5 12.5 8'] }],
])

/**
 * The icon for a priority. A priority without a Jira icon (one added in Board settings) shows its
 * colour dot instead; an empty one shows nothing.
 */
export function PriorityIcon({ name, size = 16 }: { name: string | null | undefined; size?: number }) {
  if (!name) return null
  const shape = SHAPES.get(name.toLowerCase())
  if (!shape) return <OptionDot field="priority" name={name} />
  return (
    <svg
      className="priority-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={`${name} priority`}
      fill="none"
      stroke={shape.color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{`${name} priority`}</title>
      {shape.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
