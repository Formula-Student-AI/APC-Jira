#!/usr/bin/env node
// Put back what is missing from the live board, from a snapshot made by the scheduled backup
// (the private Formula-Student-AI/APC-Jira-backups repo, folder backups/<date>/).
// It only ADDS rows. Rows that exist are never changed or deleted.
//
//   Everything missing (default):
//     members        usernames that are gone (with their name, board-admin and active flags)
//     field_options  options that are gone (matched by id, or by field + name; a domain by its subteam's
//                    name + its name), with subteam leads. A domain joins the live subteam of that name.
//     items          tasks that are gone, with their old number (or a new one if it is taken), parents
//                    before their subtasks. A task whose domain was renamed since gets its new name; one
//                    whose domain no longer exists comes back without it, and a subtask whose parent
//                    task is gone comes back as a separate task.
//     activity       history, only for tasks that have no history at all (after a total loss;
//                    a deleted task keeps its history, so it is not needed then)
//     subteam_members who was in which subteam (matched by the subteam's name), for members on the
//                    board or coming back; backups from before Subteam members have none
//   --items 12,15    only those tasks (and their history if it is missing). Nothing else.
//
// board_settings are never changed; differences are printed. Restored tasks also get a "created" entry
// in their history for the restore itself.
//
// Shows what it would do and changes nothing unless you add --yes.
// Uses the secret key (SUPABASE_SERVICE_ROLE_KEY, sb_secret_...) from board/.env.local.
//
// Usage (from board/): node scripts/restore-backup.mjs <backup folder> [--items 12,15] [--yes]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnv, requireEnv } from './lib/env.mjs';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    items: { type: 'string' },
    yes: { type: 'boolean', default: false },
  },
});
if (positionals.length !== 1) {
  console.error('Usage: node scripts/restore-backup.mjs <backup folder> [--items 12,15] [--yes]');
  process.exit(1);
}
const folder = resolve(positionals[0]);
const onlyNumbers = args.items === undefined ? null : parseNumbers(args.items);

const env = loadEnv();
requireEnv(env, 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');

function parseNumbers(text) {
  const numbers = text.split(',').map((part) => Number(part.trim().replace(/^#/, '')));
  if (!numbers.length || numbers.some((n) => !Number.isInteger(n) || n < 1)) {
    console.error(`--items needs task numbers like 12 or 12,15 (got "${text}")`);
    process.exit(1);
  }
  return new Set(numbers);
}

function readTable(name) {
  const file = join(folder, `${name}.json`);
  if (!existsSync(file)) {
    console.error(`${file} not found. Point at one snapshot folder, e.g. APC-Jira-backups/backups/2026-11-05`);
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`${file} is not a list of rows`);
  return rows;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** A copy of the row without one column (one the database fills in itself). */
function omit(row, column) {
  const copy = { ...row };
  delete copy[column];
  return copy;
}

async function rest(method, path, { body, prefer } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // Network hiccup: try again a few times. HTTP errors are reported straight away.
      if (attempt >= 4) throw error;
      await sleep(1000 * attempt);
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }
}

async function fetchAll(table, select, order) {
  const rows = [];
  // Page until a page comes back empty, so a lower "Max rows" API setting can't cut the list short.
  for (;;) {
    const page = await rest('GET', `${table}?select=${select}&order=${order}&limit=1000&offset=${rows.length}`);
    if (!page.length) return rows;
    rows.push(...page);
  }
}

/** fetchAll, or null when the board has no such table (its schema is older). Any other error stops the run. */
async function fetchAllIfThere(table, select, order) {
  try {
    return await fetchAll(table, select, order);
  } catch (error) {
    // PostgREST answers 404 with PGRST205 (42P01 before version 12) for a table it doesn't know.
    if (/^HTTP 404: .*"(PGRST205|42P01)"/s.test(error.message)) return null;
    throw error;
  }
}

// ------------------------------------------------------------------------------------- the plan

const backup = {
  members: readTable('members'),
  options: readTable('field_options'),
  items: readTable('items'),
  activity: readTable('activity'),
  settings: readTable('board_settings'),
  // null for a backup with no such file: taken before Subteam members, or by a backups repo whose
  // export.sql wasn't brought up to date (node scripts/setup-backups.mjs --update).
  subteamMembers: existsSync(join(folder, 'subteam_members.json')) ? readTable('subteam_members') : null,
};
const manifestFile = join(folder, 'manifest.json');
const takenAt = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')).taken_at : 'unknown time';

const live = {
  members: await fetchAll('members', 'username', 'username'),
  options: await fetchAll('field_options', 'id,field,name,parent_id', 'id'),
  items: await fetchAll('items', 'id,number', 'number'),
  activity: await fetchAll('activity', 'item_id', 'id'),
  settings: await fetchAll('board_settings', '*', 'id'),
  // null when the live board has no Subteam members yet (its schema is older than this script).
  // Paged in a unique order, like the rest, so no row can fall between two pages.
  subteamMembers: await fetchAllIfThere('subteam_members', 'subteam,username', 'subteam,username'),
};

// Domains belong to a subteam by id, but a subteam may have been deleted and added again since the backup
// (a new id), so domains are matched, and attached, by their subteam's name.
const subteamNameById = new Map(
  [...backup.options, ...live.options].filter((o) => o.field === 'subteam').map((o) => [o.id, o.name]),
);
const liveSubteamIdByName = new Map(
  live.options.filter((o) => o.field === 'subteam').map((o) => [o.name.toLowerCase(), o.id]),
);
const parentName = (o) => (o.parent_id ? (subteamNameById.get(o.parent_id) ?? o.parent_id) : '');
const optionKey = (o) => `${o.field}\u0000${parentName(o).toLowerCase()}\u0000${o.name.toLowerCase()}`;
const optionLabel = (o) => `${o.field}: ${o.parent_id ? `${parentName(o)} / ` : ''}${o.name}`;
const liveUsernames = new Set(live.members.map((m) => m.username));
const liveOptionIds = new Set(live.options.map((o) => o.id));
const liveOptionKeys = new Set(live.options.map(optionKey));
const liveItemIds = new Set(live.items.map((i) => i.id));
const liveNumbers = new Set(live.items.map((i) => i.number));
const itemsWithHistory = new Set(live.activity.map((a) => a.item_id));

// email is generated by the database, so it is never sent.
const members = onlyNumbers ? [] : backup.members.filter((m) => !liveUsernames.has(m.username)).map((m) => omit(m, 'email'));
const options = onlyNumbers
  ? []
  : backup.options
      .filter((o) => !liveOptionIds.has(o.id) && !liveOptionKeys.has(optionKey(o)))
      .map((o) =>
        o.parent_id ? { ...o, parent_id: liveSubteamIdByName.get(parentName(o).toLowerCase()) ?? o.parent_id } : o,
      )
      // Subteams before their domains (a stable sort keeps the rest in order).
      .sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id));

const notes = [];
let items = backup.items.filter((i) => !liveItemIds.has(i.id));
if (onlyNumbers) {
  const known = new Set(backup.items.map((i) => i.number));
  const unknown = [...onlyNumbers].filter((n) => !known.has(n));
  if (unknown.length) notes.push(`Not in this backup: ${unknown.map((n) => `#${n}`).join(', ')}`);
  const present = backup.items.filter((i) => onlyNumbers.has(i.number) && liveItemIds.has(i.id));
  if (present.length) notes.push(`Already on the board (left alone): ${present.map((i) => `#${i.number}`).join(', ')}`);
  items = items.filter((i) => onlyNumbers.has(i.number));
}
// A domain renamed since the backup keeps its id: restored tasks get its current name. (It is found through
// the backup's own subteam and domain rows, so a same-named domain of another subteam can't mix in.)
const backupSubteamNames = new Map(backup.options.filter((o) => o.field === 'subteam').map((o) => [o.id, o.name]));
const liveOptionsById = new Map(live.options.map((o) => [o.id, o]));
items = items.map((i) => {
  if (!i.domain) return i;
  const option = backup.options.find(
    (o) => o.field === 'domain' && o.name === i.domain && backupSubteamNames.get(o.parent_id) === i.subteam,
  );
  const now = option && liveOptionsById.get(option.id);
  if (!now || now.name === i.domain) return i;
  notes.push(`#${i.number} ${i.title}: its domain "${i.domain}" is called "${now.name}" now, so it gets that`);
  return { ...i, domain: now.name };
});
// Only members can be assignees. Someone deleted since the backup comes back with a full restore (above);
// with --items they don't, so their tasks come back without them.
const memberNames = new Set([...liveUsernames, ...members.map((m) => m.username)]);
items = items.map((i) => {
  const gone = (i.assignees ?? []).filter((u) => !memberNames.has(u));
  if (!gone.length) return i;
  notes.push(`#${i.number} ${i.title}: comes back without ${gone.join(', ')}, no longer a member`);
  return { ...i, assignees: i.assignees.filter((u) => memberNames.has(u)) };
});
// Who was in which subteam: by the subteam's name, as it may have been deleted and added again since (a new
// id), for members on the board or coming back. Only with a full restore.
const restoredOptionIds = new Set(options.map((o) => o.id));
const subteamIdNow = (id) => {
  const name = subteamNameById.get(id);
  return (name && liveSubteamIdByName.get(name.toLowerCase())) ?? (restoredOptionIds.has(id) ? id : null);
};
const membershipKey = (subteam, username) => `${subteam}\u0000${username}`;
const liveMemberships = new Set((live.subteamMembers ?? []).map((r) => membershipKey(r.subteam, r.username)));
const memberships = [];
if (!onlyNumbers && backup.subteamMembers && live.subteamMembers) {
  for (const row of backup.subteamMembers) {
    const subteam = subteamIdNow(row.subteam);
    if (!subteam || !memberNames.has(row.username) || liveMemberships.has(membershipKey(subteam, row.username))) continue;
    liveMemberships.add(membershipKey(subteam, row.username));
    memberships.push({ ...row, subteam });
  }
} else if (!onlyNumbers && live.subteamMembers) {
  notes.push(
    'This backup has no subteam_members.json, so who was in which subteam is left out. (It was taken before ' +
      'Subteam members, or before the backups repo was brought up to date: node scripts/setup-backups.mjs --update.)',
  );
} else if (!onlyNumbers && backup.subteamMembers?.length) {
  notes.push('The board has no Subteam members yet (its schema is older), so who was in which subteam is left out.');
}
const membershipLabel = (r) => `${r.username} in ${subteamNameById.get(r.subteam) ?? r.subteam}`;

// Parent tasks before their subtasks (a subtask points at its parent, so the parent must be there first).
items = items.sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id));
// A taken number means another task has it now: the restored task gets the next free number instead.
const renumbered = items.filter((i) => liveNumbers.has(i.number));
items = items.map((i) => (liveNumbers.has(i.number) ? { ...i, number: null } : i));

// History comes back only for tasks with none on the board (after a total loss, also for tasks deleted
// before the backup). With --items, only for those tasks.
const historyFor = new Set(
  (onlyNumbers ? items.map((i) => i.id) : backup.activity.map((a) => a.item_id)).filter((id) => !itemsWithHistory.has(id)),
);
// The id is generated by the database; history keeps its original times.
const activity = backup.activity.filter((a) => historyFor.has(a.item_id)).map((a) => omit(a, 'id'));

// ------------------------------------------------------------------------------------- report

console.log(`Backup: ${folder}`);
console.log(`Taken:  ${takenAt}`);
console.log(`Live:   ${live.members.length} members, ${live.options.length} options, ${live.items.length} tasks\n`);
for (const note of notes) console.log(note);

const settingsBefore = backup.settings[0] ?? {};
const settingsNow = live.settings[0] ?? {};
for (const key of ['auth_mode', 'trust_mode_admins', 'member_limit']) {
  if (key in settingsBefore && settingsBefore[key] !== settingsNow[key]) {
    console.log(`Note: board_settings.${key} was ${JSON.stringify(settingsBefore[key])}, now ${JSON.stringify(settingsNow[key])} (not changed).`);
  }
}

const list = (rows, label) => rows.map(label).join(', ');
console.log(`Members to add:  ${members.length}${members.length ? `  (${list(members, (m) => m.username)})` : ''}`);
console.log(`Options to add:  ${options.length}${options.length ? `  (${list(options, optionLabel)})` : ''}`);
console.log(`Tasks to add:    ${items.length}`);
for (const item of items) {
  const original = backup.items.find((i) => i.id === item.id);
  const note = item.number === null ? `  (#${original.number} is taken now: gets a new number)` : '';
  console.log(`  #${original.number} ${original.title}${original.archived ? ' [archived]' : ''}${note}`);
}
console.log(`History to add:  ${activity.length} entries for ${new Set(activity.map((a) => a.item_id)).size} task(s)`);
console.log(`Subteam members: ${memberships.length}${memberships.length ? `  (${list(memberships, membershipLabel)})` : ''}\n`);

if (!members.length && !options.length && !items.length && !activity.length && !memberships.length) {
  console.log('Nothing is missing. Nothing to do.');
} else if (!args.yes) {
  console.log('Dry run: nothing was changed. Add --yes to restore the rows above.');
} else {
  await restore();
}

// ------------------------------------------------------------------------------------- restore
// Order matters: members first (tasks, leads and subteam members refer to them), then options (tasks use
// their names; subteams before their domains), then who is in which subteam, then tasks, then history. One
// row at a time, so one bad row doesn't stop the rest.

async function restore() {
  let failures = 0;
  // `fallback(row, error)` may offer a changed row to try again (twice at most): { row, note }.
  const insertEach = async (table, rows, label, fallback) => {
    let added = 0;
    for (const original of rows) {
      let row = original;
      const changes = [];
      for (let attempt = 0; ; attempt++) {
        try {
          await rest('POST', table, { body: row, prefer: 'return=minimal' });
          added++;
          for (const note of changes) console.log(`  ${label(original)}: ${note}`);
          break;
        } catch (error) {
          const retry = attempt < 2 ? fallback?.(row, error) : null;
          if (!retry) {
            failures++;
            console.log(`  Couldn't add ${label(original)}: ${error.message}`);
            break;
          }
          row = retry.row;
          changes.push(retry.note);
        }
      }
    }
    console.log(`Added ${added} of ${rows.length} ${table}.`);
  };

  // A task comes back without what no longer fits, rather than not at all: a domain its subteam no
  // longer has, or a parent task that is gone (or has become a subtask itself).
  const itemFallback = (item, error) => {
    if (item.domain && /Unknown domain/.test(error.message)) {
      return {
        row: { ...item, domain: null },
        note: `added without its domain "${item.domain}", which ${item.subteam ?? 'its subteam'} no longer has`,
      };
    }
    if (item.parent_id && /items_parent_id_fkey|subtasks of its own|at most 100 subtasks/.test(error.message)) {
      return { row: { ...item, parent_id: null }, note: "added as a separate task: it can't go back under its parent task" };
    }
    return null;
  };

  await insertEach('members', members, (m) => `member ${m.username}`);
  await insertEach('field_options', options, optionLabel);
  // Who put them in, and when, are kept (the database only sets them for a member's own change).
  await insertEach('subteam_members', memberships, membershipLabel);
  await insertEach('items', items, (i) => `task "${i.title}"`, itemFallback);
  let historyAdded = 0;
  for (let start = 0; start < activity.length; start += 500) {
    const batch = activity.slice(start, start + 500);
    try {
      await rest('POST', 'activity', { body: batch, prefer: 'return=minimal' });
      historyAdded += batch.length;
    } catch (error) {
      failures++;
      console.log(`  Couldn't add ${batch.length} history entries: ${error.message}`);
    }
  }
  console.log(`Added ${historyAdded} of ${activity.length} history entries.`);
  if (renumbered.length) {
    console.log(`Renumbered (their old number was taken): ${renumbered.map((i) => `#${i.number} ${i.title}`).join('; ')}`);
  }
  console.log(failures ? `\n${failures} problem(s): see above.` : '\nDone.');
  process.exitCode = failures ? 1 : 0;
}
