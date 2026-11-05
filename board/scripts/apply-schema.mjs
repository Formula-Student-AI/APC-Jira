#!/usr/bin/env node
// Apply supabase/schema.sql to the Supabase project through the Supabase Management API
// (the same API the Supabase CLI and the SQL Editor use). The schema is safe to re-run.
//
// Needs SUPABASE_ACCESS_TOKEN (a personal access token, sbp_...) and SUPABASE_PROJECT_REF in
// board/.env.local. Without a token, paste supabase/schema.sql into Supabase > SQL Editor instead.
//
// Usage (from board/): node scripts/apply-schema.mjs [path/to/file.sql]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_DIR, loadEnv, requireEnv } from './lib/env.mjs';

const env = loadEnv();
requireEnv(env, 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF');

const file = process.argv[2] ?? join(BOARD_DIR, 'supabase', 'schema.sql');
const sql = readFileSync(file, 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`Failed to apply ${file} (HTTP ${res.status}):\n${body}`);
  process.exit(1);
}
console.log(`Applied ${file} to Supabase project ${env.SUPABASE_PROJECT_REF}.`);
