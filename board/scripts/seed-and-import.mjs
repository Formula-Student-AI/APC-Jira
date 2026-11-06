#!/usr/bin/env node
// Seed Bristol FSAI Board's dropdown options (field_options). Safe to re-run.
//
// - A field with no options yet gets the options listed in supabase/field-options.json.
// - A field that already has options is left alone, so a board admin's renames, colours and
//   ordering survive a re-run. --reset-options adds any missing listed options and resets the
//   colour, order and description of the listed ones (it never deletes or renames options).
// - --admin <username> makes an existing member a board admin. They must have signed in once.
//   (Board admin is a permission. It has nothing to do with the "Admin" subteam.)
// - GitHub import: not used. The board started empty (decided at Checkpoint 2), so nothing is
//   imported; data/github-export/ is only kept for reference.
//
// Uses the secret key (SUPABASE_SERVICE_ROLE_KEY, sb_secret_...) from board/.env.local. It bypasses
// Row Level Security, so keep it out of the app and out of any GitHub workflow.
//
// Usage (from board/): node scripts/seed-and-import.mjs [--reset-options] [--admin xy12345]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BOARD_DIR, loadEnv, requireEnv } from './lib/env.mjs';

const { values: args } = parseArgs({
  options: {
    'reset-options': { type: 'boolean', default: false },
    admin: { type: 'string', multiple: true, default: [] },
  },
});

const env = loadEnv();
requireEnv(env, 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');

async function rest(method, path, { body, prefer } = {}) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} /rest/v1/${path} -> HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const seed = JSON.parse(readFileSync(join(BOARD_DIR, 'supabase', 'field-options.json'), 'utf8'));
const fields = Object.keys(seed).filter((key) => !key.startsWith('$'));

// (Subteam domains are not seeded: each subteam's leads add their own in the app.)
const existing = await rest('GET', 'field_options?select=field,name');
const countByField = new Map();
for (const row of existing) countByField.set(row.field, (countByField.get(row.field) ?? 0) + 1);

const report = { inserted: [], reset: [], kept: [], admins: [], problems: [] };

for (const field of fields) {
  const have = countByField.get(field) ?? 0;
  if (have > 0 && !args['reset-options']) {
    report.kept.push(`${field} (${have} options)`);
    continue;
  }
  const rows = seed[field].map((option, index) => ({
    field,
    name: option.name,
    color: option.color,
    description: option.description ?? null,
    sort_order: index + 1,
  }));
  if (have === 0) {
    const inserted = await rest('POST', 'field_options?on_conflict=field,parent_id,name', {
      body: rows,
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    report.inserted.push(`${field}: ${inserted.map((r) => r.name).join(', ')}`);
  } else {
    await rest('POST', 'field_options?on_conflict=field,parent_id,name', {
      body: rows,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    report.reset.push(`${field} (${rows.length} options)`);
  }
}

for (const raw of args.admin) {
  const username = raw.trim().toLowerCase();
  const updated = await rest('PATCH', `members?username=eq.${encodeURIComponent(username)}`, {
    body: { is_board_admin: true },
    prefer: 'return=representation',
  });
  if (updated.length) report.admins.push(`${username} (${updated[0].full_name})`);
  else report.problems.push(`--admin ${username}: no such member yet. They need to sign in to the board once first.`);
}

const line = (label, list) => console.log(`${label.padEnd(18)}${list.length ? list.join('\n' + ' '.repeat(18)) : '-'}`);
console.log('Bristol FSAI Board seed report');
line('Seeded options:', report.inserted);
line('Reset options:', report.reset);
line('Left unchanged:', report.kept);
line('Board admins set:', report.admins);
console.log(`${'GitHub import:'.padEnd(18)}not used (the board started empty), so 0 imported, 0 updated, 0 skipped`);
if (report.problems.length) {
  line('Problems:', report.problems);
  process.exit(1);
}
