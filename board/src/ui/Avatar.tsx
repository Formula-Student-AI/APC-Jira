import { initials } from '../lib/format'
import { useBoard } from '../store/board'

function hue(username: string): number {
  let hash = 0
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % 360
}

interface AvatarProps {
  username: string
  size?: number
}

/** A member's initials in a circle (colour derived from the username). */
export function Avatar({ username, size = 20 }: AvatarProps) {
  const member = useBoard((s) => s.members[username])
  const name = member?.full_name ?? username
  return (
    <span
      className="avatar"
      title={`${name} (${username})`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        background: `hsl(${hue(username)} 45% 34%)`,
      }}
    >
      {initials(name)}
    </span>
  )
}

interface AvatarStackProps {
  usernames: string[]
  max?: number
  size?: number
}

/** Overlapping initials for several members, with "+N" for the rest. */
export function AvatarStack({ usernames, max = 3, size = 20 }: AvatarStackProps) {
  if (usernames.length === 0) return null
  const shown = usernames.slice(0, max)
  const rest = usernames.length - shown.length
  return (
    <span className="avatar-stack">
      {shown.map((u) => (
        <Avatar key={u} username={u} size={size} />
      ))}
      {rest > 0 && <span className="avatar-more">+{rest}</span>}
    </span>
  )
}
