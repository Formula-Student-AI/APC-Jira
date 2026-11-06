import { HistoryIcon } from '@primer/octicons-react'
import { useEffect } from 'react'
import { formatDateTime, timeAgo } from '../lib/format'
import { loadActivity, useBoard } from '../store/board'
import type { Activity, Item, Member } from '../types'
import { Avatar } from '../ui/Avatar'
import { describeActivity } from './describeChange'
import { useMinuteTick } from './useMinuteTick'

/** Who changed what, newest first. Loads when the item opens and updates live. */
export function History({ item }: { item: Item }) {
  const entries = useBoard((s) => s.activity[item.id])
  const members = useBoard((s) => s.members)
  const items = useBoard((s) => s.items)
  useMinuteTick()

  useEffect(() => {
    void loadActivity(item.id)
  }, [item.id])

  if (!entries) return <p className="muted ip-history-empty">Loading history…</p>
  if (entries.length === 0) return <p className="muted ip-history-empty">No history yet.</p>
  return (
    <ol className="ip-history">
      {entries.map((entry) => (
        <HistoryEntry key={entry.id} entry={entry} members={members} items={items} />
      ))}
    </ol>
  )
}

interface HistoryEntryProps {
  entry: Activity
  members: Record<string, Member>
  items: Record<string, Item>
}

function HistoryEntry({ entry, members, items }: HistoryEntryProps) {
  const who = entry.username ? (members[entry.username]?.full_name ?? entry.username) : 'A script'
  const lines = describeActivity(entry, members, items)
  return (
    <li className="ip-history-entry">
      {entry.username ? (
        <Avatar username={entry.username} size={20} />
      ) : (
        <span className="ip-history-bot" aria-hidden="true">
          <HistoryIcon size={12} />
        </span>
      )}
      <div className="ip-history-text">
        <p>
          <strong>{who}</strong> {lines[0]}
          <time className="ip-history-time" dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>
            {timeAgo(entry.created_at)}
          </time>
        </p>
        {lines.length > 1 && (
          <ul>
            {lines.slice(1).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
