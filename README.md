# Bristol FSAI Board

Bristol FSAI's live planning board for the 2026–27 plan: a Jira-style board where every subteam
tracks its work. Any change someone makes (a new item, a card dragged to another column, a date
moved on the timeline) shows up for everyone else within about a second, without refreshing.

- **Live site:** https://formula-student-ai.github.io/APC-Jira/
- **Built with:** React + TypeScript (Vite) on GitHub Pages; Supabase (Postgres, Realtime, Auth) for data and live updates.
- **Look:** soft, Jira-like light and dark themes in Bristol FSAI red, with the Geist and Geist Mono
  fonts used on the [society's website](https://fsai.cssbristol.co.uk/) (bundled with the app, so no font requests to Google).

The structure (statuses, fields and views) is copied from the GitHub Project used for
HyPower-Bristol's BSEP plan. The board itself started empty.

## Contents

- [Using the board](#using-the-board)
- [What's in this repository](#whats-in-this-repository)
- [Setting up a copy](#setting-up-a-copy)
- [Environment variables](#environment-variables)
- [Deploying (GitHub Pages)](#deploying-github-pages)
- [Subteams, subteam leads, domains and dropdown options](#subteams-subteam-leads-domains-and-dropdown-options)
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

   The **Subteam Board** has a row of subteam buttons: pick one subteam to see just its board
   (its items in Status columns), or **All subteams**. On the **Timeline** the same buttons show one
   or several subteams at a time. The choice is part of the address (`?team=Mechanical`), so a
   subteam's board can be shared as a link, and new items you add there join that subteam.
3. Drag cards between columns or rows to change their Status or subteam, and up or down to reorder.
   On a phone, press and hold a card to pick it up. On the Timeline, drag a bar to move it, or
   drag its ends to change the start or due date.
4. Click a card or row to open it in the side panel. Every change saves as you go ("Saved" appears
   at the top). If a save fails, the change is undone and a message explains why. The panel shows
   the item's Status, Priority, Subteam, Domain and that subteam's lead(s), Assignees, Labels and
   dates. Priorities are Jira's: Highest, High, Medium, Low and Lowest, each with its Jira icon.
   **Domain** is one of the subteam's own domains (for example LV systems or Accumulator for
   Electrical; see [Subteam domains](#subteam-domains)). It shows as a tag next to the subteam's on
   the task's card. A subteam's leads can add one straight from the panel with the **+** next to
   Domain.
   Dates can be picked from the calendar or typed. A typed date saves when you leave the box, press
   Enter or close the panel (a picked one, a moment after you pick it). A start date after the due
   date is shown as an error and saved once the order is put right; a half-typed date is never saved.
   **Linked tasks**, as in Jira: in the panel, **Linked tasks** > **+**, pick the link type
   (**is blocked by**, **blocks** or **relates to**), search for the task and press **Link**.
   Links are listed by type on both tasks. Loops of blocking links are refused.
   The Timeline draws every link as a line from the end of the blocking task's bar to the start of
   the blocked one's, in red when the blocked task starts before the blocking one ends. To link on
   the Timeline, hover a bar and drag the round handle at its end onto another task (from its
   start, it's the other way round).
   **Milestones** (key dates such as a design freeze or the competition): on the Timeline, press
   **◆ Milestone**, give it a name and a date. It shows as a diamond on its date, with a dashed line
   down the Timeline: a whole-team milestone (or one of Admin's, as Admin stands for the whole team)
   runs across every subteam shown, and a subteam's runs down that subteam's section only, named in its
   heading (`WHOLE_TEAM_SUBTEAM` in `board/src/config.ts` names Admin). Names that would overlap step
   down a line each, a cascade, so none covers another. Any task can be made a milestone with the
   **Milestone** switch in its panel. Link tasks to a milestone ("blocks") to see in red when they
   would finish too late. `is:milestone` in the filter box lists them.
   **Phases** (periods such as concept design, manufacturing or testing) work the same way: on the
   Timeline press **Phase**, give it a name, a start and an end date. Its dates are shaded with its name
   at the top, across every subteam or down its own subteam's section in the same way, and it has a bar
   in its row you can drag or resize.
   In an item's panel, **Type** switches between Task, Milestone and Phase. `is:phase` lists them.
   **Subtasks** (the steps of a bigger task, as in Jira): in the task's panel press **+** next to
   **Subtasks**, type a step and press Enter. The box stays open for the next step. Each subtask is a
   task of its own (status, assignees, dates), starting in the parent's subteam and domain; tick its
   box when it's done. The parent shows a progress bar, cards show "2/5" on the parent and the parent's
   number on each subtask. On the Timeline a subtask sits indented under its parent when both are in
   the same list (the same subteam with dates, or both under No dates); elsewhere it shows "↳ #12",
   its parent's number. Steps stay in the order they were added. To make an
   existing task a subtask, move one to another task, or make one a separate task again, use the
   **⋯** menu in its panel. One level only: a subtask can't have subtasks, and milestones and phases
   can't be subtasks.
   **Images** (Attachments in the panel): add them with **+**, drop them on the section, or paste
   one anywhere in the open item. They are shrunk in your browser first (longest side 1600 px, about
   0.2-0.4 MB for a phone photo) and shown as thumbnails; click one to see it full size, download
   or remove it. Cards show a paperclip with the number of images.
5. Use **+ Add item** at the bottom of a column, or **+ New item** in the header. A new item gets
   whatever the current view implies, so it shows up where you are. For example, on Self Kanban it
   is assigned to you.
6. **Light or dark:** the board opens in light mode the first time. Switch with the sun/moon toggle
   at the top right of the sign-in page, or later in user menu > **Theme** (Light, Dark, or Auto to
   follow your device). The choice is remembered on each device.
7. **Archive** an item to hide it (from the ⋯ menu in the panel). Type `is:archived` in the filter
   to find archived items and restore them. Only board admins can delete items permanently.

**Filter box:** type words to search titles and descriptions, `#12` to find item 12, or use fields:

| Example | Meaning |
| --- | --- |
| `assignee:@me` | assigned to you |
| `status:"In Progress"` | quotes for values with spaces |
| `subteam:"Braking System"` | one subteam |
| `domain:"LV systems"` | one domain (in any subteam that has it; add `subteam:` for one) |
| `label:urgent` | has this label |
| `priority:High,Highest` | High or Highest priority |
| `lead:@me` | items in the subteams you lead (`lead:xy12345` for someone else's) |
| `-status:Done` | a minus means *not* |
| `status:Todo,Blocked` | a comma means *either* |
| `no:assignee` / `has:label` | field is empty / not empty |
| `is:blocked` / `is:archived` | blocked items / archived items |
| `is:subtask` / `parent:12` | subtasks / the subtasks of #12 (`-is:subtask` hides subtasks) |

The filter is part of the address (`?q=…`), so you can share a filtered view as a link.

### Exporting the timeline

On the **Timeline**, **Export** (or Ctrl+P, ⌘P on a Mac) makes a plan for people outside the team, from
exactly what the Timeline shows: the subteams picked and the filter (change those on the Timeline first;
collapsed subteams are included). Ctrl+P opens Export only on the Timeline and only when no other dialog
is open. The preview on the right is drawn by the same code as the export, so what you see is what you send.

- **PDF**, to email or print: A4, A3 or A2 landscape (A2 for a wall chart: the whole plan, usually on one
  page), each labelled with its page count. Press **Print or save
  as PDF…**, then in the print window choose **Save as PDF** (or a printer) and leave **Margins** on
  **Default**. In Firefox and Safari, also untick **Print headers and footers**. The PDF is named like
  `Bristol FSAI 2026-27 Plan - Timeline - 2026-11-10`. On a phone, choose Save as PDF or Save to Files in
  the print screen. With the dialog open, Ctrl+P (or File > Print) prints what the preview shows too (with
  Image chosen, its slides on 16:9 pages), or, while the export can't be printed yet, a page saying why.
- **Image (PNG)**, for slides: a 16:9 image, 3840 × 2160 px, that fills a widescreen slide in PowerPoint,
  Google Slides or Keynote. **Download PNG**, or **Copy image** and paste it into the slide (Copy isn't
  offered where the browser can't copy images). Rows that don't fit one slide make several images, each
  with its own Copy and Download; **One row per domain** fits the whole plan on one. Several slides download
  as separate files, and Chrome and Edge ask once before letting the site download more than one. **Copy alt
  text** gives a description of the slide to paste into the picture's alt text.

Every page has the logo, the title, what it covers, "Status as of" and the next key date, the phases and key
dates lanes, a legend of only what is used, and "Page n of N", so any page can be forwarded on its own. A
subteam is never split across pages when it fits on one: a big subteam (more rows than a page holds) starts
a page of its own and runs on, and the smaller ones are packed together to fill pages, so the PDF is as short
as it can be; Not yet scheduled always comes last. Colour always means subteam. Status is shown by how full a bar is (hollow: not
started; tinted: in progress; solid: done), with a red hatch for Blocked, a red trail for Overdue (due before
the as-of date and not done) and an amber triangle for At risk (waits on work that is blocked, overdue, or
due after it starts), and always in words as well, so a greyscale print loses nothing. Slipped work is never
left out: a task that was due before the period and isn't done is still a row, its red trail coming in from
the left edge, and key dates missed earlier are pointed out before you send.

**Options:** Rows (every task, or one row per domain: each subteam with its domains under it), Period (the
whole plan, the next 3 or 6 months, or months you choose), Columns (#, Owner, Dates, Status), subtasks,
tasks without dates and dependency lines, then the title, a note for page 1 and Prepared by. The defaults
give a sponsor-ready A4 PDF in two clicks: the whole plan, every task, no subtasks. Your choices are
remembered on each device, except the note, which starts empty every time so an old one can't go out by
mistake. Notes above the preview point out anything to check before sending (overdue key dates, tasks left
out, a very long PDF), often with a one-click fix.

**Never included:** archived items, items still being created, descriptions, labels, priorities, blocked
reasons, images, usernames, email addresses, filter wording and the board's address. Owners and leads appear
by full name: untick Owner for a copy without names, and check names before sending outside the team.
Everything is made in your browser, and nothing is uploaded. To check printing in each browser before a
release, see [Checking the Timeline export by hand](#checking-the-timeline-export-by-hand).

## What's in this repository

| Path | What it is |
| --- | --- |
| `board/` | The app, its database schema (`board/supabase/`) and scripts (`board/scripts/`) |
| `board/backup-repo/` | The files of the private backups repository (scripts only, no data); see [Backups](#backups) |
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

## Subteams, subteam leads, domains and dropdown options

The subteams are **Mechanical, Powertrain, Electrical, Braking System and Admin**, in that order.
"Admin" is a subteam like the others. It is not the [board admin](#board-admins) permission.

**Subteam leads.** A board admin chooses each subteam's leads (one or more members) in
**user menu > Board settings > Subteam leads**. Every item then shows its subteam's leads: in the
side panel, in the Blocked table and in the subteam chip's tooltip on cards. When someone becomes
or stops being a lead, every item of that subteam follows. `lead:@me` in the filter box shows the
items of the subteams you lead. Leads also look after their subteam's domains and members (below).

### Subteam members

A record of **who is in which subteam**, for keeping track of the team. It changes no task by itself: who is
assigned to what, and who leads a subteam, stay as they are. Someone can be in more than one subteam. A
subteam's leads are shown under its name, not counted as members (they are set in **Subteam leads**): making
someone a lead takes them off that subteam's member list, and someone who stops leading is put back in it by
hand if they stay.

- **Who can change it:** the board admins, for every subteam, in **Board settings > Subteam members**, which
  also lists the active members who neither lead nor are in a subteam yet; and each subteam's leads, for their
  own, in **user menu > Subteam members**. Press **Add members** to tick people in or out, or the **×** beside
  a name.
- **Assigning a task:** in **New item**, once a subteam is chosen, its people (its leads, then its members)
  are there to tick, and **Someone else** opens the whole list. A task's **Assignees** menu lists its subteam's
  people first too, then everyone else. Anyone can still be assigned.
- Board admins see and change every subteam's list, and each subteam's leads their own; everyone sees a
  subteam's people when assigning one of its tasks. The database lets any signed-in member read it. Deleting a
  member takes them out of their subteams; deleting a subteam takes its list with it. Renaming a subteam keeps it.
- As for domains, a lead's powers need a verified sign-in, or the board owner's permission for username-only
  sign-ins (`board_settings.trust_mode_admins`). The database enforces it (`subteam_members` in `schema.sql`).

### Subteam domains

Each subteam has its own list of **domains**, for example LV systems, Accumulator and Software for
Electrical. A task can have one of its subteam's domains: **Domain** in the task's panel. Its card
shows the domain as a tag in the domain's colour, next to the subteam's tag.

- **Who can change them:** the subteam's leads and the board admins. Leads use **user menu >
  Subteam domains**; board admins use **Board settings > Domains**, which has every subteam. There
  they can add, rename, recolour, reorder and delete domains, as for the other dropdowns below.
  A new domain starts in a colour none of the subteam's domains use yet (once all seven others are
  taken, colours repeat), and never in the subteam's own colour.
- **Quick add:** in a task's panel, a lead (or board admin) can press **+** next to Domain, type a
  name and press **Add**. The domain joins the subteam's list and is set on that task.
- Renaming a domain updates its tasks. A domain still used by a task (archived ones count) can't be
  deleted. Two subteams can each have a domain of the same name. A subteam can have up to 50 domains.
- A task moved to another subteam loses its domain, unless that subteam has one with the same name.
- Like board-admin powers, a lead's powers need a verified sign-in, or the board owner's permission
  for username-only sign-ins (`board_settings.trust_mode_admins`).

The database enforces all of this (Row Level Security and triggers in `schema.sql`), not just the app.

### Dropdown options

The Status, Subteam and Priority dropdowns get their options from the `field_options` table (as do
the domains). A board admin changes them in the app: **user menu > Board settings > Dropdown options**.
There you can:

- **Add** an option. It goes at the end; move it with the arrows.
- **Rename** an option. Every item that uses it is updated automatically.
- **Recolour** or **reorder** options. The order is the order of board columns.
- **Delete** an option, but only while no item uses it (archived items count too).

The **Blocked** and **Done** statuses can't be renamed or deleted (they can be recoloured and
moved): the Blocked view depends on Blocked, and Done marks finished tasks (ticked subtasks, and
due dates that no longer count as overdue).

Without the app, the same can be done in Supabase > **Table Editor** > `field_options`.

## Board admins

A board admin can choose subteam leads, manage the dropdown options and every subteam's domains, add, rename,
retire and delete members, make other people board admins, and delete items permanently. Everyone else archives
instead of deleting. **Board admin is a permission. It has nothing to do with the Admin subteam.**

To make someone a board admin, use any of these:

- In the app: **Board settings > Members**, then tick **Board admin**.
- From `board/`: `npm run db:seed -- --admin <username>` (they must have signed in once).
- In the SQL Editor: `update public.members set is_board_admin = true where username = 'ab12345';`

The board always keeps at least one working (active) board admin: the last one can't be unticked, retired or
deleted.

**Retiring or deleting a member** (Board settings > Members):

- **Retire** (untick **Active**): hidden from the pickers, but still a member. Tick it again to bring them back.
- **Delete** (the bin, then **Delete member**): removes them from the board. They're taken off every task
  they're assigned to (each task's history records it under your name, so "Last changed by" shows you), they stop
  leading any subteams, they're taken out of the subteams they're in, and any device signed in as them is
  signed out. "Created by" and the history keep their
  username. Only board admins can delete members, one at a time, and you can't delete yourself. Deleting isn't a
  ban: if they sign in again, they come back as a new member.
- **Undo a deletion:** add them again (**Add member**), re-assign their tasks, put them back in their subteams
  (**Subteam members**), and make them a subteam lead or board admin again if they were one. A full restore from a
  backup also brings them back, in their subteams (see [Backups](#backups)).

**Important:** with username-only login (trust mode), anyone can sign in as any username,
including a board admin's or a subteam lead's. The setting `board_settings.trust_mode_admins`
decides what happens then:

- `false` (the schema's default): board-admin powers, and subteam leads' powers over their
  subteam's domains, only work from a verified (email-code) sign-in. In trust mode, board admins
  do admin work in the Supabase dashboard instead.
- `true`: those powers also work from a username-only sign-in. Only choose this if you accept
  that anyone who signs in with an admin's or a lead's username gets their powers.

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
- Whether a username-only sign-in as a board admin or a subteam lead gets their powers depends on a setting (see [Board admins](#board-admins)).

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

Supabase's free plan has no downloadable backups, so the board backs itself up **every 3 days**
(04:23 UTC on the 1st, 4th, 7th, … of each month) into the **private** repository
`Formula-Student-AI/APC-Jira-backups`. Each backup is a folder `backups/<date>/` with the items,
their history, members, dropdown options (with subteam leads and domains), who is in which subteam and
settings as JSON. The newest 30 stay in the folder; older ones remain in that repository's git history.

The backup logs in as `backup_reader`, a **read-only** database login defined in `schema.sql`. It
can read the board's tables and change nothing, so the backup never holds a key that could alter
the board. Its password exists only as that repository's `BACKUP_DATABASE_URL` Actions secret.

**One-time setup** (needs `gh` logged in as an org admin, and the access token in `.env.local`):

```sh
cd board
npm run db:apply                       # creates backup_reader (if not done yet)
node scripts/setup-backups.mjs         # creates the private repo, sets the password and secret, runs the first backup
```

`node scripts/setup-backups.mjs --password` gives `backup_reader` a new password (and updates the
secret) if it might have leaked. To back up immediately: backups repo > Actions > Backup > Run workflow.
If a scheduled backup fails, GitHub emails whoever last changed its workflow.

**Changing what is backed up.** The backups repository runs its own copy of the files in
`board/backup-repo/`, so a change to them (say `export.sql` backs up a new table) reaches it only when you
send it, and only after the schema is applied. In the other order every backup fails until the schema
catches up, so `--update` checks that `backup_reader` can read every table `export.sql` reads, and stops if not.
It sends the files as committed, so commit the change first:

```sh
cd board
npm run db:apply                          # the database first
node scripts/setup-backups.mjs --update   # then commits the changed files to the backups repository
```

**Restoring.** `board/scripts/restore-backup.mjs` puts back what is **missing** (for example an item
deleted by mistake, or everything after a total loss). It never changes or deletes existing rows.
Without `--yes` it only shows what it would do:

```sh
cd board
node scripts/restore-backup.mjs ../../APC-Jira-backups/backups/2026-11-05             # everything missing
node scripts/restore-backup.mjs ../../APC-Jira-backups/backups/2026-11-05 --items 12  # only item #12
node scripts/restore-backup.mjs ../../APC-Jira-backups/backups/2026-11-05 --items 12 --yes
```

A restored item keeps its number unless another item has taken it, in which case it gets a new
one. If its domain was renamed since the backup, it gets the new name; if its subteam no longer has
that domain, it comes back without one (the script says so). A subtask whose parent task is gone
comes back as a separate task. A deleted parent's subtasks stay on the board as separate tasks, and
restoring the parent doesn't put them back under it: use **⋯ > Make a subtask of…** on each. A member deleted since the
backup comes back with a full restore, with their board-admin tick, but not on the tasks still on the board that
they were assigned to, and not as a subteam lead. With `--items` members aren't restored, so a task comes back
without any assignees deleted since the backup (the script says which). To undo an *edit* rather than a
deletion, look up the old values in the item's History or in
the backup's `items.json`. The `activity` table also keeps a full copy of every permanently deleted
item.

## Free-tier limits

These were the limits at the time of writing (November 2026); check the
[Supabase pricing page](https://supabase.com/pricing) for current ones.

- **Supabase pauses a free project after about a week with no activity.** The site then can't
  load. Restore it from the Supabase dashboard (open the project and choose **Restore**). It takes
  a few minutes, and nothing is lost.
- **Tasks:** the database is limited to 500 MB. The board used 12 MB when it started (most of that
  is Supabase's own tables), and a task with its history takes roughly 5-10 KB, so there is room for
  tens of thousands of tasks. Per task: a 300-character title, a 50,000-character description,
  30 assignees, 30 labels and 50 links of each type. Members: up to 300 (`board_settings.member_limit`).
- **Images:** Supabase Free has 1 GB of file storage. Images are shrunk before upload, so a photo
  takes about 0.2-0.4 MB (plus a 15-30 KB thumbnail): roughly 3,000-4,500 photos. The database
  enforces 2 MB per image, 20 images per task and 900 MB in all; Board settings shows how much is
  used. Removing an image frees its space. Images are not part of the backups (only the tasks are).
- **Realtime:** about 200 people can have the board open at once.
- Without custom SMTP, Supabase sends very few emails (see email codes above).
- **GitHub:** Pages from a private repository needs GitHub Pro. Actions minutes for private
  repositories are limited (2,000 a month on the free plan). The private backups use about
  10 minutes a month; deploys run in this public repository and don't count.

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
6. Move or recreate the private backups repository too. Its name is set at the top of
   `board/scripts/setup-backups.mjs`; change it there and re-run the script.

## Development

From `board/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Run locally at http://localhost:5173 |
| `npm run build` | Typecheck and build to `board/dist/` |
| `npm test` | Unit tests (Vitest): the filter, item ordering, login inputs, table columns, links, subtasks, dates, domains, images and more |
| `npm run lint` | ESLint |
| `npm run db:apply` / `npm run db:seed` | Apply the schema / seed the options |

Code layout: `src/store/` (data, live updates, login), `src/lib/` (filter, routing, dates),
`src/views/` (the board, timeline and table views and their config), `src/panel/` (the item side
panel), `src/layout/` (header, toasts), `src/settings/` (board settings, subteam domains) and `src/ui/` (shared
pieces). Security lives in the database (`board/supabase/schema.sql`): Row Level Security and
triggers decide who may do what and record every change.

**Changing the database.** Apply `schema.sql` (`npm run db:apply`) before pushing code that uses the
change: the site goes live as soon as `main` is built, and until the database catches up, whatever needs the
change fails. Usually the board shows an error; Subteam members instead looks empty and refuses changes. If
`board/backup-repo/` changed too, update the backups repository after that (see [Backups](#backups)).

### Checking the Timeline export by hand

The export's layout is tested in node, but printing and saving images can only be checked in real
browsers. Before a release that changes the export (`board/src/views/timeline/export/`), check it in
**Chrome and Edge on Windows, Chrome and Safari on macOS, Firefox, Safari on iOS and Chrome on Android**:

- [ ] **A4, A3 and A2**, saved as PDF: exactly the page count the dialog shows, landscape at the right size, no
      blank page at the end, and no row cut across a page break.
- [ ] No header or footer from the browser (title, date or the board's address); in Firefox and Safari,
      once Print headers and footers is unticked.
- [ ] The PDF is offered as `Bristol FSAI 2026-27 Plan - Timeline - <date>.pdf`, and the tab's title
      comes back after printing.
- [ ] The text can be selected and searched, colours print with Background graphics switched off, and the
      pages are white in dark mode too.
- [ ] Ctrl+P (⌘P) on the Timeline opens Export, and closing Export puts focus back where it was; inside it,
      Ctrl+P and File > Print print the export (with Image chosen, the slides on 16:9 pages).
- [ ] **Long and non-Latin titles**: an 80-character title of W's, and titles and names in Chinese, Arabic,
      Cyrillic and Vietnamese and with emoji. Nothing runs past its cell, in the preview at 100% or on paper.
- [ ] **Download PNG** and **Copy image** with the dialog open: a 3840 × 2160 image that pastes into
      PowerPoint or Google Slides at slide size; with several slides, each slide's own buttons.
- [ ] On the phones, the print screen opens from Print or save as PDF…, and Save as PDF or Save to Files works.

## Next steps

Not built yet:

- comments on items
- notifications
- attachments other than images
- switching on email-code login (see above)
- two-way sync back to GitHub
- the GitHub views left out on purpose: Review queue, Unassigned and Assigned
