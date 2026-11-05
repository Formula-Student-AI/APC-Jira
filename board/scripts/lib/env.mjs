// Reads board/.env.local (KEY=value lines) for the local scripts. Never prints values.
// Variables already set in the environment (SUPABASE_* and VITE_*) take precedence.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BOARD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadEnv(file = join(BOARD_DIR, '.env.local')) {
  const env = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) continue;
      const [, key, raw] = match;
      env[key] = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
    }
  }
  for (const [key, value] of Object.entries(process.env)) {
    if ((key.startsWith('SUPABASE_') || key.startsWith('VITE_')) && value) env[key] = value;
  }
  return env;
}

export function requireEnv(env, ...keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} in board/.env.local (see board/.env.example).`);
    process.exit(1);
  }
}
