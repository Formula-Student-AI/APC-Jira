# APC-Jira backups

Automatic backups of the [Bristol FSAI Board](https://formula-student-ai.github.io/APC-Jira/)
([code](https://github.com/Formula-Student-AI/APC-Jira)), made every 3 days by GitHub Actions.

**This repository is private because it holds team data** (names, university usernames and every task).
Keep it private and don't copy the backups anywhere public.

## What's here

`backups/<date>/` holds one snapshot of the board:

| File | Contents |
| --- | --- |
| `items.json` | The tasks, including archived ones |
| `activity.json` | The history of every task |
| `members.json` | Members, board admins and retired members |
| `field_options.json` | Statuses, subteams (with their leads) and priorities |
| `board_settings.json` | Login mode and the other board settings |
| `manifest.json` | When the snapshot was taken and how many rows each file has |

The newest 30 snapshots (about three months) stay in the folder. Older ones are still in the git
history: open an older commit on GitHub to browse them.

## How it works

[`.github/workflows/backup.yml`](.github/workflows/backup.yml) runs [`backup.sh`](backup.sh) at 04:23 UTC
on the 1st, 4th, 7th, … of each month. It runs [`export.sql`](export.sql) as `backup_reader`, a read-only
database login (defined in `board/supabase/schema.sql` in APC-Jira), so it can read the board but never
change it. Its connection string is stored in this repository's `BACKUP_DATABASE_URL` Actions secret.

- **Back up now:** Actions → Backup → Run workflow.
- **If a run fails,** GitHub emails whoever last changed the workflow file.

## Restoring

Use `board/scripts/restore-backup.mjs` in APC-Jira. It only adds rows that are missing (for example a
deleted task) and never changes or deletes existing ones. Without `--yes` it only shows what it would do.

```sh
# from APC-Jira/board, with board/.env.local filled in
node scripts/restore-backup.mjs ../../APC-Jira-backups/backups/2026-11-05            # dry run: everything missing
node scripts/restore-backup.mjs ../../APC-Jira-backups/backups/2026-11-05 --items 12 # just task #12
node scripts/restore-backup.mjs ../../APC-Jira-backups/backups/2026-11-05 --items 12 --yes
```

## Changing the backup password

If the secret might have leaked, run this from `APC-Jira/board`. It gives `backup_reader` a new
random password and updates the secret, without ever showing the password:

```sh
node scripts/setup-backups.mjs --password
```

By hand instead: in Supabase → SQL Editor run `alter role backup_reader with password '<new password>';`,
then set the `BACKUP_DATABASE_URL` secret (Settings → Secrets and variables → Actions) to
`postgresql://backup_reader.<project ref>:<new password>@<session pooler host>:5432/postgres?sslmode=require`
(the project ref and the session pooler host are under Supabase → Connect).
