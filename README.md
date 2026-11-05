# Bristol FSAI Board

Bristol FSAI's live planning board for the 2026–27 plan: a Jira-style board where every subteam
tracks its work. Any change someone makes (a new item, a card dragged to another column, a date
moved on the timeline) shows up for everyone else within about a second, without refreshing.

- **Live site:** https://formula-student-ai.github.io/APC-Jira/
- **Built with:** React + TypeScript (Vite) on GitHub Pages; Supabase (Postgres, Realtime, Auth) for data and live updates.

The structure (statuses, fields and views) is copied from the GitHub Project used for
HyPower-Bristol's BSEP plan. The board itself started empty.

## Contents

- [Using the board](#using-the-board)
- [What's in this repository](#whats-in-this-repository)
- [Setting up a copy](#setting-up-a-copy)
- [Environment variables](#environment-variables)
- [Deploying (GitHub Pages)](#deploying-github-pages)
- [Subteams and other dropdown options](#subteams-and-other-dropdown-options)
- [Board admins](#board-admins)
- [How login works, and its limits](#how-login-works-and-its-limits)
- [Re-running the seed or the GitHub export](#re-running-the-seed-or-the-github-export)
- [Backups](#backups)
- [Free-tier limits](#free-tier-limits)
- [Moving to another organisation](#moving-to-another-organisation)
- [Development](#development)
- [Next steps](#next-steps)

## Using the board

1. Open the site and enter your **university username** (for example `xy12345`). The first time,
   you also enter your full name. There is no password.
2. Pick a view from the tabs:

   | View | What it shows |
   | --- | --- |
   | **Self Kanban** | Your items, in columns by Status |
   | **Kanban** | Everything, in columns by Status, grouped into rows by subteam |
   | **Timeline** | A roadmap: bars from start date to due date, coloured by subteam (zoom Month / Quarter / Year) |
   | **Subteam Board** | One column per subteam (Mechanical, Powertrain, Electrical, Braking System, Admin), grouped by Status |
   | **Blocked** | A table of everything whose Status is Blocked, with the reason |

3. Drag cards between columns or rows to change their Status or subteam, and up or down to reorder.
   On a phone, press and hold a card to pick it up. On the Timeline, drag a bar to move it, or
   drag its ends to change the start or due date.
4. Click a card or row to open it in the side panel. Every change saves as you go ("Saved" appears
   at the top). If a save fails, the change is undone and a message explains why.
5. Use **+ Add item** at the bottom of a column, or **+ New item** in the header. A new item gets
   whatever the current view implies, so it shows up where you are. For example, on Self Kanban it
   is assigned to you.
6. **Archive** an item to hide it (from the ⋯ menu in the panel). Type `is:archived` in the filter
   to find archived items and restore them. Only board admins can delete items permanently.

**Filter box:** type words to search titles and descriptions, `#12` to find item 12, or use fields:

| Example | Meaning |
| --- | --- |
| `assignee:@me` | assigned to you |
| `status:"In Progress"` | quotes for values with spaces |
| `subteam:"Braking System"` | one subteam |
| `label:urgent` | has this label |
| `priority:"Critical path"` | any dropdown field works: `size:M`, `difficulty:D2`, `domain:Drawings` … |
| `-status:Done` | a minus means *not* |
| `status:Todo,Blocked` | a comma means *either* |
| `no:assignee` / `has:label` | field is empty / not empty |
| `is:blocked` / `is:archived` | blocked items / archived items |

The filter is part of the address (`?q=…`), so you can share a filtered view as a link.

## What's in this repository

| Path | What it is |
| --- | --- |
| `board/` | The app, its database schema (`board/supabase/`) and scripts (`board/scripts/`) |
| `.github/workflows/deploy.yml` | Builds `board/` and publishes it to GitHub Pages on every push to `main` |

This repository is public, so GitHub Pages works on the free plan. It holds no secrets: secrets
and team data are never committed. `board/.env.local` (keys and tokens) and `board/data/` (exported
GitHub data) are in `board/.gitignore`, and the board's data lives in Supabase behind Row Level
Security.

## Setting up a copy

You need Node.js 20.19 or newer (22 recommended), a free Supabase project and this repository.

1. **Install:** `cd board && npm ci`
2. **Settings:** copy `board/.env.example` to `board/.env.local` and fill it in (see
   [Environment variables](#environment-variables)).
3. **Database:** run `npm run db:apply`. This applies `board/supabase/schema.sql` through the
   Supabase Management API and needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. Without a
   token, paste the file into Supabase > **SQL Editor** and run it. The schema is safe to re-run.
4. **Dropdown options:** run `npm run db:seed`.
5. **Supabase Auth settings** (in the Supabase dashboard):
   - **Authentication > Sign In / Providers > User Signups:** turn on **Allow anonymous sign-ins**, then **Save changes**.
   - **Authentication > Rate Limits:** raise the anonymous sign-in limit. The default is 30 per hour per IP address, and people registering together on eduroam share one. This board uses 150.
6. **Run it:** `npm run dev`, then open http://localhost:5173.
7. **Make yourself a board admin:** sign in once, then run `npm run db:seed -- --admin xy12345`
   (with your username).

## Environment variables

| Variable | Used by | What it is |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | app | Supabase project URL, e.g. `https://abcd….supabase.co` (Supabase > **Connect**) |
| `VITE_SUPABASE_ANON_KEY` | app | The **publishable** key (`sb_publishable_…`), Supabase's new name for the anon key. It is meant to be public: the database's Row Level Security protects the data. |
| `VITE_USERNAME_PATTERN` | app (optional) | Allowed usernames. Default `^[a-z]{2}[0-9]{5}$`. If you change it, change `public.username_pattern()` in `schema.sql` to match. |
| `VITE_AUTH_MODE` | app (optional) | `trust` (username only, the default) or `email_code`. See [How login works](#how-login-works-and-its-limits). |
| `SUPABASE_SERVICE_ROLE_KEY` | local scripts only | The **secret** key (`sb_secret_…`), Supabase's new name for the service-role key. It bypasses all security: keep it in `.env.local`, never in the app, a workflow or a commit. |
| `SUPABASE_ACCESS_TOKEN` | local scripts only | A Supabase personal access token (`sbp_…`), used by `npm run db:apply` and the setup scripts. Revoke it under Account > Access Tokens when you don't need it. |
| `SUPABASE_PROJECT_REF` | local scripts only | The project's reference (the part before `.supabase.co`). |

Locally these live in `board/.env.local`. For the live site, the four `VITE_*` values are
repository **Actions variables** (see below).

## Deploying (GitHub Pages)

Every push to `main` that changes `board/` runs `.github/workflows/deploy.yml`. It lints, tests and
builds the app, then publishes it with GitHub's official Pages actions. The site's path follows the
repository name automatically.

One-time setup (already done for this repository):

```sh
# Actions variables the build reads (the publishable key is public by design)
gh variable set VITE_SUPABASE_URL --body "https://<ref>.supabase.co"
gh variable set VITE_SUPABASE_ANON_KEY --body "sb_publishable_..."
gh variable set VITE_USERNAME_PATTERN --body '^[a-z]{2}[0-9]{5}$'
gh variable set VITE_AUTH_MODE --body trust

# Turn on Pages with GitHub Actions as the source
gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow
```

GitHub Pages from a **private** repository needs a paid plan, such as GitHub Pro (free with the
GitHub Student Developer Pack). Public repositories, like this one, can use Pages on any plan.

## Subteams and other dropdown options

The subteams are **Mechanical, Powertrain, Electrical, Braking System and Admin**, in that order.
"Admin" is a subteam like the others. It is not the [board admin](#board-admins) permission.

Every dropdown (Status, Subteam, Priority, Domain, Difficulty level, Size, Task force, Safety
related) gets its options from the `field_options` table. A board admin changes them in the app:
**user menu > Board settings > Dropdown options**. There you can:

- **Add** an option. It goes at the end; move it with the arrows.
- **Rename** an option. Every item that uses it is updated automatically.
- **Recolour** or **reorder** options. The order is the order of board columns.
- **Delete** an option, but only while no item uses it (archived items count too).

The **Blocked** status can't be renamed or deleted, because the Blocked view depends on it.

Without the app, the same can be done in Supabase > **Table Editor** > `field_options`.

## Board admins

A board admin can manage the dropdown options, add, rename and retire members, make other people
board admins, and delete items permanently. Everyone else archives instead of deleting. **Board
admin is a permission. It has nothing to do with the Admin subteam.**

To make someone a board admin, use any of these:

- In the app: **Board settings > Members**, then tick **Board admin**.
- From `board/`: `npm run db:seed -- --admin <username>` (they must have signed in once).
- In the SQL Editor: `update public.members set is_board_admin = true where username = 'ab12345';`

The board always keeps at least one board admin.

**Important:** with username-only login (trust mode), anyone can sign in as any username,
including a board admin's. The setting `board_settings.trust_mode_admins` decides what happens then:

- `false` (the schema's default): board-admin powers only work from a verified (email-code)
  sign-in. In trust mode, board admins do admin work in the Supabase dashboard instead.
- `true`: board-admin powers also work from a username-only sign-in. Only choose this if you
  accept that anyone who signs in with an admin's username gets those powers.

Change it in the SQL Editor:

```sql
update public.board_settings set trust_mode_admins = false;  -- or true
```

## How login works, and its limits

**Trust mode (the default).** You type your university username, and your full name the first
time. There is no password. Behind the scenes, the device signs in to Supabase anonymously, and the
database links that session to your member record (`claim_member`). From then on, every change
from that device is recorded under your name by the database itself, never by anything the browser
claims. The device stays logged in. **Switch user** (in the user menu) signs it out.

Limits you should know about:

- Anyone who knows a username can sign in as that person. Their changes are recorded under that
  person's name.
- Anyone with the link can register (one new member per sign-in, up to a limit of 300) and read
  the board.
- The history on each item (and the `activity` table) shows who changed what, and when, under the
  name each person signed in as.
- Whether a username-only sign-in as a board admin gets board-admin powers depends on a setting (see [Board admins](#board-admins)).

**Email codes (built in, switched off).** In `email_code` mode, people get a 6-digit code at
`username@bristol.ac.uk`. Only a session that has verified that address counts as that member. To
switch it on:

1. Set up **custom SMTP** in Supabase (Authentication > Emails > SMTP settings). Supabase's built-in
   email only sends a handful of messages and only to the project's own team. A free tier from an
   email provider is enough.
2. In Authentication > Emails > Templates, make the **Magic link** email show the code: `{{ .Token }}`.
3. Keep **Confirm email** on (Authentication > Sign In / Providers).
4. Set the Actions variable `VITE_AUTH_MODE` to `email_code` and push, so the site is rebuilt.
5. In the SQL Editor, run `update public.board_settings set auth_mode = 'email_code';`. Anonymous
   sessions then stop counting as members. You can also turn off anonymous sign-ins.

## Re-running the seed or the GitHub export

- `npm run db:seed` is safe to re-run. It only adds options to fields that have none, so a board
  admin's renames and colours survive. `--reset-options` re-applies the colours, order and
  descriptions from `board/supabase/field-options.json`. It never deletes or renames anything.
- **GitHub import:** not used. The board started empty, so `seed-and-import.mjs` imports nothing.
- `npm run export:github` re-exports the original GitHub Project (HyPower-Bristol #13) to
  `board/data/github-export/` for reference. It is read-only and needs `gh` with the
  `read:project` scope. Add `--csv` to also write the login-mapping file used for an import.

## Backups

Supabase's free plan doesn't give you downloadable backups, so export regularly, especially before
big changes:

- **Quick:** Supabase > Table Editor > for each of `items`, `members`, `field_options` and
  `activity`: **Export > Export table as CSV**.
- **Complete:** a full dump with the database connection string (Supabase > **Connect**, which
  needs the database password):
  `npx supabase db dump --db-url "postgresql://…" -f backup.sql` (add `--data-only` for just the data).

The `activity` table also keeps a full copy of every permanently deleted item.

## Free-tier limits

These were the limits at the time of writing (November 2026); check the
[Supabase pricing page](https://supabase.com/pricing) for current ones.

- **Supabase pauses a free project after about a week with no activity.** The site then can't
  load. Restore it from the Supabase dashboard (open the project and choose **Restore**). It takes
  a few minutes, and nothing is lost.
- The database is limited to about 500 MB, which is plenty for a planning board. Realtime has a
  limit on concurrent connections and monthly messages that a society board won't come near.
- Without custom SMTP, Supabase sends very few emails (see email codes above).
- **GitHub:** Pages from a private repository needs GitHub Pro. Actions minutes for private
  repositories are limited (each deploy takes about a minute).

## Moving to another organisation

1. Either transfer the repository (Settings > General > Transfer ownership), or push it to a new
   repository in the organisation.
2. Check the four Actions variables in the new repository (Settings > Secrets and variables >
   Actions > Variables), and set them with `gh variable set` if they're missing.
3. Turn on Pages with GitHub Actions as the source (Settings > Pages, or the `gh api` command
   above), then push to `main` or run the workflow by hand.
4. On GitHub's free organisation plan, Pages needs a **public** repository, as here. That's fine:
   the code holds no secrets, `board/data/` and `.env.local` are never committed, and the
   publishable key is meant to be public.
5. In Supabase > Authentication > URL Configuration, update the **Site URL** to the new address.
   This matters only for email codes.

## Development

From `board/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Run locally at http://localhost:5173 |
| `npm run build` | Typecheck and build to `board/dist/` |
| `npm test` | Unit tests (Vitest): filter parser, item ordering, login inputs, table columns |
| `npm run lint` | ESLint |
| `npm run db:apply` / `npm run db:seed` | Apply the schema / seed the options |

Code layout: `src/store/` (data, live updates, login), `src/lib/` (filter, routing, dates),
`src/views/` (the board, timeline and table views and their config), `src/panel/` (the item side
panel), `src/layout/` (header, toasts), `src/settings/` (board settings) and `src/ui/` (shared
pieces). Security lives in the database (`board/supabase/schema.sql`): Row Level Security and
triggers decide who may do what and record every change.

## Next steps

Not built yet:

- comments on items
- notifications
- attachments
- switching on email-code login (see above)
- two-way sync back to GitHub
- the GitHub views left out on purpose: Review queue, Unassigned and Assigned
