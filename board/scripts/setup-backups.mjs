#!/usr/bin/env node
// Sets up the automatic backups (every 3 days) of Bristol FSAI Board. Safe to re-run.
//
//   1. Creates the PRIVATE repo Formula-Student-AI/APC-Jira-backups with the files in board/backup-repo/
//      (skipped when the repo already has commits: --update brings its files up to date instead).
//   2. Gives backup_reader, the read-only database login from supabase/schema.sql, a new random password,
//      and stores its connection string as that repo's BACKUP_DATABASE_URL Actions secret.
//      The password is never shown or written to disk. Only the database stores a hash of it.
//   3. Starts the first backup.
//
// The repo runs its own copy of the files in board/backup-repo/. After changing them (say export.sql backs
// up a new table), commit, apply the schema (npm run db:apply), then run --update. It checks that
// backup_reader can read every table export.sql names, so the backups don't start failing, then commits the
// files that differ, as committed here, to the repo in one commit. It leaves the backups, and any file not in
// board/backup-repo/, alone.
//
// Needs: the GitHub CLI (gh) logged in with admin rights in the org, and SUPABASE_ACCESS_TOKEN and
// SUPABASE_PROJECT_REF in board/.env.local. Apply supabase/schema.sql first (it creates backup_reader).
//
// Usage (from board/): node scripts/setup-backups.mjs              set everything up
//                      node scripts/setup-backups.mjs --password   only give backup_reader a new password
//                      node scripts/setup-backups.mjs --update     only bring the repo's files up to date
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BOARD_DIR, loadEnv, requireEnv } from './lib/env.mjs';

const REPO = 'Formula-Student-AI/APC-Jira-backups';
const DESCRIPTION = 'Automatic backups of the Bristol FSAI Board (APC-Jira), every 3 days. Private: holds team data.';
const FILES_DIR = join(BOARD_DIR, 'backup-repo');

const { values: args } = parseArgs({
  options: {
    password: { type: 'boolean', default: false },
    update: { type: 'boolean', default: false },
  },
});
if (args.password && args.update) {
  console.error('Use --password or --update, not both.');
  process.exit(1);
}
const env = loadEnv();
requireEnv(env, 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF');

/** Runs a command; returns its trimmed output, or throws with its error output. */
function run(command, commandArgs, { input, cwd, quiet = false } = {}) {
  const result = spawnSync(command, commandArgs, { input, cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  if (!quiet && result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout.trim();
}

const succeeds = (command, commandArgs) => spawnSync(command, commandArgs, { encoding: 'utf8' }).status === 0;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function managementApi(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Supabase API ${path}: HTTP ${res.status}: ${text}`);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (attempt >= 4 || /HTTP 4\d\d/.test(error.message)) throw error;
      await sleep(1500 * attempt);
    }
  }
}

/** The hash Postgres keeps for a password (SCRAM-SHA-256), so the password itself never reaches it. */
function scramVerifier(password) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const storedKey = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

// ------------------------------------------------------------------------------------- 1. the repo

function createRepo() {
  if (succeeds('gh', ['repo', 'view', REPO, '--json', 'name'])) {
    const visibility = run('gh', ['repo', 'view', REPO, '--json', 'visibility', '--jq', '.visibility'], { quiet: true });
    if (visibility !== 'PRIVATE') throw new Error(`${REPO} exists but is ${visibility}. It must be private.`);
    console.log(`${REPO} already exists (private).`);
  } else {
    run('gh', ['repo', 'create', REPO, '--private', '--description', DESCRIPTION, '--disable-wiki', '--disable-issues']);
  }

  const branches = run('gh', ['api', `repos/${REPO}/branches`, '--jq', 'length'], { quiet: true });
  if (branches !== '0') {
    console.log('The repo already has commits: its files are left as they are (--update brings them up to date).');
    return;
  }
  const [id, login] = run('gh', ['api', 'user', '--jq', '"\\(.id) \\(.login)"'], { quiet: true }).split(' ');
  const dir = mkdtempSync(join(tmpdir(), 'apc-jira-backups-'));
  try {
    cpSync(FILES_DIR, dir, { recursive: true });
    const git = (...gitArgs) => run('git', gitArgs, { cwd: dir, quiet: true });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('update-index', '--chmod=+x', 'backup.sh');
    git('-c', `user.name=${login}`, '-c', `user.email=${id}+${login}@users.noreply.github.com`, 'commit', '-q', '-m', 'Set up automatic backups every 3 days');
    git('push', '-q', `https://github.com/${REPO}.git`, 'main');
    console.log(`Pushed the backup workflow to ${REPO}.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------------------------- 2. the password

async function newPassword() {
  const poolers = await managementApi('/config/database/pooler');
  const host = [].concat(poolers).find((p) => p.database_type === 'PRIMARY')?.db_host;
  if (!host) throw new Error('Could not find the database connection pooler host.');
  const roles = await managementApi('/database/query', {
    method: 'POST',
    body: JSON.stringify({ query: "select count(*)::int as n from pg_roles where rolname = 'backup_reader'" }),
  });
  if (roles?.[0]?.n !== 1) throw new Error('backup_reader does not exist yet: run node scripts/apply-schema.mjs first.');

  // URL-safe characters only, so the connection string needs no escaping.
  const password = randomBytes(32).toString('base64url');
  const url = `postgresql://backup_reader.${env.SUPABASE_PROJECT_REF}:${password}@${host}:5432/postgres?sslmode=require`;
  // Secret first: if the database step then fails, re-running replaces both.
  run('gh', ['secret', 'set', 'BACKUP_DATABASE_URL', '--repo', REPO], { input: url, quiet: true });
  await managementApi('/database/query', {
    method: 'POST',
    body: JSON.stringify({ query: `alter role backup_reader with password '${scramVerifier(password)}'` }),
  });
  console.log('backup_reader has a new password, saved as the BACKUP_DATABASE_URL secret.');
}

// ------------------------------------------------------------------------------------- 3. first backup

async function firstBackup() {
  // A just-pushed workflow can take a few seconds to be registered.
  for (let attempt = 1; attempt <= 6; attempt++) {
    if (succeeds('gh', ['workflow', 'run', 'backup.yml', '--repo', REPO, '--ref', 'main'])) {
      console.log(`Started the first backup: https://github.com/${REPO}/actions`);
      return;
    }
    await sleep(5000);
  }
  console.log(`Couldn't start the first backup. Start it in https://github.com/${REPO}/actions (Backup > Run workflow).`);
}

// ------------------------------------------------------------------------------------- --update

/**
 * The files of board/backup-repo/ as committed here (HEAD): path in the repo ('/' between folders), mode and git
 * blob id. Only committed files, so neither an unfinished edit nor a stray file in the folder (a OneDrive
 * conflict copy, say) can reach the backups repo.
 */
function committedFiles() {
  const uncommitted = run('git', ['status', '--porcelain', '--untracked-files=no', '--', '.'], { cwd: FILES_DIR, quiet: true });
  if (uncommitted) {
    throw new Error(`Commit the changes in board/backup-repo/ first (the backups repo gets the committed files):\n${uncommitted}`);
  }
  return run('git', ['ls-tree', '-r', '-z', 'HEAD', '--', '.'], { cwd: FILES_DIR, quiet: true })
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const [info, path] = entry.split('\t');
      const [mode, type, sha] = info.split(' ');
      // backup.sh stays runnable there, as the first setup made it (it is committed here without the flag).
      return { path, type, sha, mode: path === 'backup.sh' ? '100755' : mode };
    })
    .filter((file) => file.type === 'blob');
}

/** A committed file's exact bytes. */
function committedBytes(sha) {
  const result = spawnSync('git', ['cat-file', 'blob', sha], { cwd: FILES_DIR });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git cat-file failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

/** `gh api`, sending `body` (if any) as JSON; returns the parsed answer. */
function github(path, body, method = 'POST') {
  const ghArgs = body ? ['api', '--method', method, path, '--input', '-'] : ['api', path];
  return JSON.parse(run('gh', ghArgs, { input: body && JSON.stringify(body), quiet: true }));
}

/** Stops unless backup_reader can read every table export.sql reads: otherwise every backup would fail. */
async function checkTablesReadable(exportSql) {
  const tables = [...new Set([...exportSql.matchAll(/\bpublic\.(\w+)/g)].map((match) => match[1]))];
  if (!tables.length) throw new Error('board/backup-repo/export.sql reads no public tables: is it the right file?');
  const rows = await managementApi('/database/query', {
    method: 'POST',
    body: JSON.stringify({
      // to_regclass is null for a table the database doesn't have yet, and has_table_privilege null then.
      query:
        "select t as name, coalesce(has_table_privilege('backup_reader', to_regclass('public.' || t), 'select'), false) as readable " +
        `from unnest(array[${tables.map((t) => `'${t}'`).join(', ')}]::text[]) as t`,
    }),
  });
  const unreadable = rows.filter((row) => !row.readable).map((row) => row.name);
  if (unreadable.length) {
    throw new Error(
      `backup_reader can't read ${unreadable.join(', ')} yet, so backups would fail. ` +
        'Apply the schema first (npm run db:apply), then run this again.',
    );
  }
}

/** Commits the files of board/backup-repo/ (as committed here) that differ from the repo's own, in one commit. */
async function updateRepo() {
  const files = committedFiles();
  const exportSql = files.find((file) => file.path === 'export.sql');
  if (!exportSql) throw new Error('board/backup-repo/export.sql is not committed.');
  await checkTablesReadable(committedBytes(exportSql.sha).toString('utf8'));
  const head = github(`repos/${REPO}/git/ref/heads/main`).object.sha;
  const baseTree = github(`repos/${REPO}/git/commits/${head}`).tree.sha;
  const theirs = new Map(github(`repos/${REPO}/git/trees/${baseTree}?recursive=1`).tree.map((entry) => [entry.path, entry]));
  const changed = files.filter((file) => theirs.get(file.path)?.sha !== file.sha || theirs.get(file.path)?.mode !== file.mode);
  if (!changed.length) {
    console.log(`${REPO} already has the committed files of board/backup-repo/. Nothing to do.`);
    return;
  }
  const paths = changed.map((file) => file.path).join(', ');
  console.log(`Sending ${paths} to ${REPO}...`);
  for (const file of changed) {
    // The exact bytes, so GitHub's id for them must be git's here.
    const blob = github(`repos/${REPO}/git/blobs`, { content: committedBytes(file.sha).toString('base64'), encoding: 'base64' });
    if (blob.sha !== file.sha) throw new Error(`GitHub stored ${file.path} as ${blob.sha}, not ${file.sha}. Nothing was committed.`);
  }
  const tree = github(`repos/${REPO}/git/trees`, {
    base_tree: baseTree,
    tree: changed.map(({ path, mode, sha }) => ({ path, mode, type: 'blob', sha })),
  }).sha;
  if (tree === baseTree) {
    console.log(`${REPO} already has these files. Nothing to do.`);
    return;
  }
  const commit = github(`repos/${REPO}/git/commits`, {
    message: `Update ${paths} from APC-Jira (board/backup-repo)`,
    tree,
    parents: [head],
  }).sha;
  // Not forced: if a backup was committed meanwhile, this fails and running it again works.
  github(`repos/${REPO}/git/refs/heads/main`, { sha: commit, force: false }, 'PATCH');
  console.log(`Updated ${paths} in ${REPO}. The next backup uses them.`);
}

if (args.update) {
  await updateRepo();
} else {
  if (!args.password) createRepo();
  await newPassword();
  if (!args.password) await firstBackup();
}
