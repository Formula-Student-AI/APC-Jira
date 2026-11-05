#!/usr/bin/env node
// Export a GitHub Project (v2) to data/github-export/ for Bristol FSAI Board.
//
// Read-only: it only runs GraphQL queries through your `gh` login (needs the read:project scope).
// Writes project.json, views.json and items.json and prints a summary. With --csv it also adds
// any new assignee logins to data/github-to-uni.csv (for an import), never overwriting what
// you've filled in.
//
// Usage (from board/):
//   node scripts/export-github-project.mjs [--owner HyPower-Bristol] [--number 13] [--repo BSEP_Plan_26-27] [--csv]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    owner: { type: 'string', default: 'HyPower-Bristol' },
    number: { type: 'string', default: '13' },
    repo: { type: 'string', default: 'BSEP_Plan_26-27' },
    csv: { type: 'boolean', default: false },
  },
});
const OWNER = args.owner;
const NUMBER = Number(args.number);
const REPO = args.repo;
const BOARD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(BOARD_DIR, 'data');
const OUT_DIR = join(DATA_DIR, 'github-export');
const CSV_PATH = join(DATA_DIR, 'github-to-uni.csv');

function gql(query, variables = {}) {
  let stdout;
  try {
    stdout = execFileSync('gh', ['api', 'graphql', '--input', '-'], {
      input: JSON.stringify({ query, variables }),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`gh api graphql failed: ${error.stderr || error.stdout || error.message}`, { cause: error });
  }
  const json = JSON.parse(stdout);
  if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// GitHub rejects fragments a query doesn't use, so each query includes only what it needs.
const FIELD_REF = `
  fragment FieldRef on ProjectV2FieldConfiguration {
    ... on ProjectV2FieldCommon { id name dataType }
  }
`;

const FIELD_CONFIG = `
  fragment FieldConfig on ProjectV2FieldConfiguration {
    __typename
    ... on ProjectV2Field { id name dataType }
    ... on ProjectV2SingleSelectField { id name dataType options { id name color description } }
    ... on ProjectV2MultiSelectField { id name dataType multiSelectOptions { id name color description } }
    ... on ProjectV2IterationField {
      id name dataType
      configuration {
        duration startDay
        iterations { id title startDate duration }
        completedIterations { id title startDate duration }
      }
    }
  }
`;

const PROJECT_QUERY = `
  ${FIELD_REF}
  ${FIELD_CONFIG}
  query($owner: String!, $number: Int!, $repo: String!) {
    organization(login: $owner) {
      projectV2(number: $number) {
        id number title url shortDescription readme public closed createdAt updatedAt
        repositories(first: 20) { nodes { nameWithOwner } }
        fields(first: 100) { totalCount nodes { ...FieldConfig } }
        views(first: 50) {
          totalCount
          nodes {
            id number name layout filter createdAt updatedAt
            fields(first: 100) { nodes { ...FieldRef } }
            configuration { visibleFields(first: 100) { nodes { ...FieldRef } } }
            groupByFields(first: 20) { nodes { ...FieldRef } }
            verticalGroupByFields(first: 20) { nodes { ...FieldRef } }
            sortByFields(first: 20) { nodes { direction field { ...FieldRef } } }
          }
        }
      }
    }
    repository(owner: $owner, name: $repo) {
      labels(first: 100) { totalCount nodes { name color description } }
    }
  }
`;

const ITEMS_QUERY = `
  ${FIELD_REF}
  query($id: ID!, $after: String) {
    node(id: $id) {
      ... on ProjectV2 {
        items(first: 50, after: $after) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id fullDatabaseId type isArchived createdAt updatedAt
            creator { login }
            content {
              __typename
              ... on DraftIssue {
                id title body createdAt updatedAt
                creator { login }
                assignees(first: 20) { nodes { login name } }
              }
              ... on Issue {
                id number title body url state stateReason createdAt updatedAt closedAt
                repository { nameWithOwner }
                author { login }
                issueType { name }
                milestone { title dueOn }
                labels(first: 50) { nodes { name color } }
                assignees(first: 20) { nodes { login name } }
                parent { number title url }
                subIssuesSummary { total completed percentCompleted }
                issueDependenciesSummary { blockedBy totalBlockedBy blocking totalBlocking }
                blockedBy(first: 20) { nodes { number title url state repository { nameWithOwner } } }
                blocking(first: 20) { nodes { number title url state repository { nameWithOwner } } }
              }
              ... on PullRequest {
                id number title body url state createdAt updatedAt closedAt mergedAt isDraft
                repository { nameWithOwner }
                author { login }
                labels(first: 50) { nodes { name color } }
                assignees(first: 20) { nodes { login name } }
              }
            }
            fieldValues(first: 50) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldTextValue { text field { ...FieldRef } }
                ... on ProjectV2ItemFieldNumberValue { number field { ...FieldRef } }
                ... on ProjectV2ItemFieldDateValue { date field { ...FieldRef } }
                ... on ProjectV2ItemFieldSingleSelectValue { name optionId field { ...FieldRef } }
                ... on ProjectV2ItemFieldMultiSelectValue { value options { id name } field { ...FieldRef } }
                ... on ProjectV2ItemFieldIterationValue { title iterationId startDate duration field { ...FieldRef } }
                ... on ProjectV2ItemFieldUserValue { users(first: 20) { nodes { login name } } field { ...FieldRef } }
                ... on ProjectV2ItemFieldLabelValue { labels(first: 50) { nodes { name } } field { ...FieldRef } }
                ... on ProjectV2ItemFieldMilestoneValue { milestone { title } field { ...FieldRef } }
                ... on ProjectV2ItemFieldRepositoryValue { repository { nameWithOwner } field { ...FieldRef } }
                ... on ProjectV2ItemFieldPullRequestValue { pullRequests(first: 10) { nodes { number url } } field { ...FieldRef } }
                ... on ProjectV2ItemFieldReviewerValue {
                  reviewers(first: 10) { nodes { __typename ... on User { login } ... on Team { name } } }
                  field { ...FieldRef }
                }
                ... on ProjectV2ItemIssueFieldValue { field { ...FieldRef } }
              }
            }
          }
        }
      }
    }
  }
`;

const ref = (f) => (f ? { id: f.id, name: f.name, dataType: f.dataType } : null);

function normalizeField(f) {
  const base = { id: f.id, name: f.name, dataType: f.dataType, kind: f.__typename };
  if (f.options) base.options = f.options.map((o, order) => ({ ...o, order }));
  if (f.multiSelectOptions) base.options = f.multiSelectOptions.map((o, order) => ({ ...o, order }));
  if (f.configuration) base.iteration = f.configuration;
  return base;
}

function fieldValue(v) {
  switch (v.__typename) {
    case 'ProjectV2ItemFieldTextValue':
      return v.text;
    case 'ProjectV2ItemFieldNumberValue':
      return v.number;
    case 'ProjectV2ItemFieldDateValue':
      return v.date;
    case 'ProjectV2ItemFieldSingleSelectValue':
      return v.name;
    case 'ProjectV2ItemFieldMultiSelectValue':
      return (Array.isArray(v.options) ? v.options : v.options ? [v.options] : []).map((o) => o.name);
    case 'ProjectV2ItemFieldIterationValue':
      return { title: v.title, iterationId: v.iterationId, startDate: v.startDate, duration: v.duration };
    case 'ProjectV2ItemFieldUserValue':
      return v.users.nodes.map((u) => u.login);
    case 'ProjectV2ItemFieldLabelValue':
      return v.labels.nodes.map((l) => l.name);
    case 'ProjectV2ItemFieldMilestoneValue':
      return v.milestone?.title ?? null;
    case 'ProjectV2ItemFieldRepositoryValue':
      return v.repository?.nameWithOwner ?? null;
    case 'ProjectV2ItemFieldPullRequestValue':
      return v.pullRequests.nodes.map((p) => p.url);
    case 'ProjectV2ItemFieldReviewerValue':
      return v.reviewers.nodes.map((r) => r.login ?? r.name);
    default:
      return { unsupported: v.__typename };
  }
}

function normalizeItem(n) {
  const c = n.content ?? {};
  const fields = {};
  for (const v of n.fieldValues.nodes) {
    if (v.field?.name) fields[v.field.name] = fieldValue(v);
  }
  return {
    id: n.id,
    databaseId: n.fullDatabaseId,
    type: n.type,
    isArchived: n.isArchived,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    addedBy: n.creator?.login ?? null,
    contentType: c.__typename ?? null,
    number: c.number ?? null,
    title: c.title ?? null,
    body: c.body ?? null,
    url: c.url ?? null,
    repository: c.repository?.nameWithOwner ?? null,
    state: c.state ?? null,
    stateReason: c.stateReason ?? null,
    contentCreatedAt: c.createdAt ?? null,
    closedAt: c.closedAt ?? null,
    mergedAt: c.mergedAt ?? null,
    author: c.author?.login ?? c.creator?.login ?? null,
    issueType: c.issueType?.name ?? null,
    milestone: c.milestone ?? null,
    labels: (c.labels?.nodes ?? []).map((l) => l.name),
    assignees: (c.assignees?.nodes ?? []).map((a) => ({ login: a.login, name: a.name || null })),
    parent: c.parent ?? null,
    subIssuesSummary: c.subIssuesSummary ?? null,
    dependencies: c.issueDependenciesSummary ?? null,
    blockedBy: c.blockedBy?.nodes ?? [],
    blocking: c.blocking?.nodes ?? [],
    fields,
    rawFieldValues: n.fieldValues.nodes,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const exportedAt = new Date().toISOString();

const pdata = gql(PROJECT_QUERY, { owner: OWNER, number: NUMBER, repo: REPO });
const p = pdata.organization?.projectV2;
if (!p) throw new Error(`Project ${OWNER} #${NUMBER} not found (or no read:project access).`);
if (p.fields.totalCount > p.fields.nodes.length) throw new Error('More than 100 fields: add pagination.');
if (p.views.totalCount > p.views.nodes.length) throw new Error('More than 50 views: add pagination.');

const project = {
  exportedAt,
  source: { owner: OWNER, number: NUMBER, repository: `${OWNER}/${REPO}`, url: p.url },
  id: p.id,
  title: p.title,
  shortDescription: p.shortDescription,
  readme: p.readme,
  public: p.public,
  closed: p.closed,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  linkedRepositories: p.repositories.nodes.map((r) => r.nameWithOwner),
  fields: p.fields.nodes.map(normalizeField),
  repoLabels: pdata.repository?.labels?.nodes ?? [],
};

const views = p.views.nodes.map((v) => ({
  id: v.id,
  number: v.number,
  name: v.name,
  layout: v.layout,
  filter: v.filter,
  groupBy: v.groupByFields.nodes.map(ref),
  verticalGroupBy: v.verticalGroupByFields.nodes.map(ref),
  sortBy: v.sortByFields.nodes.map((s) => ({ field: ref(s.field), direction: s.direction })),
  visibleFields: v.fields.nodes.map(ref),
  configurationVisibleFields: (v.configuration?.visibleFields?.nodes ?? []).map(ref),
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
}));

const rawItems = [];
let after = null;
let totalCount;
do {
  const page = gql(ITEMS_QUERY, { id: p.id, after }).node.items;
  totalCount = page.totalCount;
  rawItems.push(...page.nodes);
  after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  process.stdout.write(`  fetched ${rawItems.length}/${totalCount} items\r`);
} while (after);
process.stdout.write('\n');
const items = rawItems.map(normalizeItem);
if (items.length !== totalCount) throw new Error(`Fetched ${items.length} items but the project reports ${totalCount}.`);

writeFileSync(join(OUT_DIR, 'project.json'), JSON.stringify(project, null, 2));
writeFileSync(join(OUT_DIR, 'views.json'), JSON.stringify({ exportedAt, views }, null, 2));
writeFileSync(join(OUT_DIR, 'items.json'), JSON.stringify({ exportedAt, totalCount, items }, null, 2));

// ---------------------------------------------------------------------------
// github-to-uni.csv: add every assignee login, keep anything already filled in
// ---------------------------------------------------------------------------
const csvEscape = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).filter((l) => l.trim())) {
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const assigneeNames = new Map(); // login -> name (or '')
for (const it of items) {
  for (const a of it.assignees) assigneeNames.set(a.login, assigneeNames.get(a.login) || a.name || '');
  for (const v of it.rawFieldValues) {
    if (v.__typename === 'ProjectV2ItemFieldUserValue') {
      for (const u of v.users.nodes) assigneeNames.set(u.login, assigneeNames.get(u.login) || u.name || '');
    }
  }
}
const existing = new Map();
if (args.csv && existsSync(CSV_PATH)) {
  const [, ...rows] = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  for (const [login, uni = '', full = ''] of rows) if (login) existing.set(login, { uni, full });
}
const logins = [...new Set([...existing.keys(), ...assigneeNames.keys()])].sort((a, b) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' }),
);
const csvLines = ['github_login,uni_username,full_name'];
let added = 0;
for (const login of logins) {
  const prev = existing.get(login);
  if (!prev) added++;
  const uni = prev?.uni ?? '';
  const full = prev?.full || assigneeNames.get(login) || '';
  csvLines.push([login, uni, full].map(csvEscape).join(','));
}
if (args.csv) writeFileSync(CSV_PATH, csvLines.join('\n') + '\n');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const count = (arr, key) => arr.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map());
const show = (m) => [...m].map(([k, v]) => `${k ?? '(none)'}: ${v}`).join(', ');

console.log(`\nExported "${project.title}" (${p.url})`);
console.log(`  to ${OUT_DIR}`);
console.log(`Items: ${items.length} (archived: ${items.filter((i) => i.isArchived).length})`);
console.log(`  by type: ${show(count(items, (i) => i.type))}`);
console.log(`  by issue state: ${show(count(items, (i) => i.state))}`);
console.log(`Fields (${project.fields.length}):`);
for (const f of project.fields) {
  const opts = f.options ? ` -> ${f.options.map((o) => `${o.name} [${o.color}]`).join(' | ')}` : '';
  const iter = f.iteration ? ` -> ${f.iteration.iterations.length} iterations, ${f.iteration.duration} days` : '';
  console.log(`  - ${f.name} (${f.dataType})${opts}${iter}`);
}
for (const f of project.fields.filter((x) => x.options)) {
  const used = count(items, (i) => (Array.isArray(i.fields[f.name]) ? i.fields[f.name].join('+') : i.fields[f.name]));
  console.log(`Values of "${f.name}": ${show(used)}`);
}
console.log(`Views (${views.length}):`);
for (const v of views) {
  console.log(`  - #${v.number} "${v.name}" ${v.layout}`);
  console.log(`      filter: ${v.filter || '(none)'}`);
  console.log(`      group by: ${v.groupBy.map((f) => f?.name).join(', ') || '(none)'}; vertical group by: ${v.verticalGroupBy.map((f) => f?.name).join(', ') || '(none)'}`);
  console.log(`      sort: ${v.sortBy.map((s) => `${s.field?.name} ${s.direction}`).join(', ') || '(none)'}`);
  console.log(`      visible fields: ${v.visibleFields.map((f) => f?.name).join(', ')}`);
}
console.log(`Date fields (candidates for the Timeline): ${project.fields.filter((f) => f.dataType === 'DATE').map((f) => f.name).join(', ') || '(none)'}`);
console.log(`Repo labels: ${project.repoLabels.map((l) => l.name).join(', ') || '(none)'}`);
console.log(
  `Assignee logins: ${assigneeNames.size}` +
    (args.csv ? ` (${added} new rows added to ${CSV_PATH})` : ' (run with --csv to write data/github-to-uni.csv)'),
);
const unsupported = items.flatMap((i) => Object.entries(i.fields).filter(([, v]) => v && v.unsupported));
if (unsupported.length) console.log(`WARNING: ${unsupported.length} field values of unsupported types: ${[...new Set(unsupported.map(([k, v]) => `${k}:${v.unsupported}`))].join(', ')}`);
