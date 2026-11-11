#!/usr/bin/env bash
# Exports the Bristol FSAI Board into backups/<YYYY-MM-DD>/ and keeps the newest $KEEP snapshots in
# that folder (older ones stay in the git history).
# Needs BACKUP_DATABASE_URL: the connection string of the read-only backup_reader login (see README.md).
set -euo pipefail

KEEP="${KEEP:-30}"
: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL (see README.md)}"

root="$(cd "$(dirname "$0")" && pwd)"
day="$(date -u +%F)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Retry a couple of times in case the connection pooler is busy.
for attempt in 1 2 3; do
  if (cd "$work" && PGCONNECT_TIMEOUT=20 psql "$BACKUP_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -f "$root/export.sql"); then
    break
  fi
  if [ "$attempt" = 3 ]; then
    echo "The export failed three times." >&2
    exit 1
  fi
  sleep $((attempt * 20))
done

# Every file must be JSON, and each table must have as many rows as the manifest counted.
for table in members field_options items activity subteam_members; do
  rows="$(jq length "$work/$table.json")"
  expected="$(jq ".counts.$table" "$work/manifest.json")"
  if [ "$rows" != "$expected" ]; then
    echo "$table.json has $rows rows but the manifest says $expected." >&2
    exit 1
  fi
done
jq -e 'length == 1' "$work/board_settings.json" > /dev/null

mkdir -p "$root/backups/$day"
cp "$work"/*.json "$root/backups/$day/"

# Keep the newest $KEEP snapshots here; git keeps the rest.
find "$root/backups" -mindepth 1 -maxdepth 1 -type d | sort | head -n "-$KEEP" | xargs -r rm -rf

echo "Saved backups/$day: $(jq -c .counts "$root/backups/$day/manifest.json")"
