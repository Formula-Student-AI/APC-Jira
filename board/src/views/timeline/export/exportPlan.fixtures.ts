// A sample board for the Timeline export's tests, as of 10 November 2026: five subteams (two with domains),
// tasks in every state, subtasks (one archived, one without dates), dependencies, key dates and phases of
// the whole team and of subteams, an archived task and key date, a task still being created, and an
// assignee who is no longer a member. Only *.test.ts files run, so this is never a test itself.

import type { FieldOption, Item, Member, OptionColor } from '../../../types'
import type { PlanInput } from './exportPlan'
import { defaultSettings } from './exportSettings'

/** The as-of date of the sample board */
export const SAMPLE_TODAY = '2026-11-10'
export const SAMPLE_EXPORTED_AT = '2026-11-10T14:32:00.000Z'

/** An item with every column filled in: a task of Mechanical with status Todo and no dates, unless patched. */
export function sampleItem(number: number, patch: Partial<Item> = {}): Item {
  return {
    id: `id-${number}`,
    number,
    title: `Item ${number}`,
    description: '',
    status: 'Todo',
    subteam: 'Mechanical',
    domain: null,
    assignees: [],
    legacy_assignees: [],
    labels: [],
    start_date: null,
    due_date: null,
    blocked_reason: null,
    blocked_by: [],
    related_to: [],
    is_milestone: false,
    is_phase: false,
    parent_id: null,
    extra: {},
    position: number,
    archived: false,
    github_item_id: null,
    github_url: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    ...patch,
  }
}

export function sampleOption(
  field: string,
  name: string,
  color: OptionColor,
  sortOrder: number,
  patch: Partial<FieldOption> = {},
): FieldOption {
  return {
    id: `${field}-${name.toLowerCase().replace(/\s+/g, '-')}`,
    field,
    name,
    color,
    description: null,
    sort_order: sortOrder,
    leads: [],
    parent_id: null,
    created_at: '',
    ...patch,
  }
}

export function sampleMember(username: string, fullName: string, patch: Partial<Member> = {}): Member {
  return {
    username,
    full_name: fullName,
    email: `${username}@bristol.ac.uk`,
    github_login: null,
    is_board_admin: false,
    active: true,
    created_at: '',
    ...patch,
  }
}

/** The board's options in board order: statuses as seeded, five subteams, and domains for two of them. */
export function sampleOptions(): FieldOption[] {
  const mechanical = sampleOption('subteam', 'Mechanical', 'BLUE', 0, { leads: ['js12345'] })
  const electrical = sampleOption('subteam', 'Electrical', 'GREEN', 2, { leads: ['ab12345', 'cd12345'] })
  const domain = (name: string, parent: FieldOption, sortOrder: number) =>
    sampleOption('domain', name, 'GRAY', sortOrder, { parent_id: parent.id })
  return [
    domain('Chassis', mechanical, 0),
    domain('Suspension', mechanical, 1),
    domain('Steering', mechanical, 2),
    domain('Accumulator', electrical, 0),
    domain('LV systems', electrical, 1),
    sampleOption('priority', 'High', 'RED', 0),
    sampleOption('status', 'Todo', 'GREEN', 0),
    sampleOption('status', 'In Progress', 'YELLOW', 1),
    sampleOption('status', 'In Review', 'BLUE', 2),
    sampleOption('status', 'Updates Needed', 'ORANGE', 3),
    sampleOption('status', 'Done', 'PURPLE', 4),
    sampleOption('status', 'Blocked', 'RED', 5),
    mechanical,
    sampleOption('subteam', 'Powertrain', 'PURPLE', 1),
    electrical,
    sampleOption('subteam', 'Braking System', 'RED', 3),
    sampleOption('subteam', 'Admin', 'ORANGE', 4),
  ]
}

/** Members by username; Eve Foster has retired but keeps her name. zz99999, who is assigned to #102, isn't one. */
export function sampleMembers(): Record<string, Member> {
  const members = [
    sampleMember('js12345', 'Jane Smith', { is_board_admin: true }),
    sampleMember('ab12345', 'Alexandra Brown'),
    sampleMember('cd12345', 'Chris Davies'),
    sampleMember('ef12345', 'Eve Foster', { active: false }),
  ]
  return Object.fromEntries(members.map((member) => [member.username, member]))
}

/** Every item on the board, archived ones included. */
export function sampleItems(): Item[] {
  const mechanical = (number: number, patch: Partial<Item>) => sampleItem(number, { subteam: 'Mechanical', ...patch })
  const electrical = (number: number, patch: Partial<Item>) => sampleItem(number, { subteam: 'Electrical', ...patch })
  const powertrain = (number: number, patch: Partial<Item>) => sampleItem(number, { subteam: 'Powertrain', ...patch })
  const team = (number: number, patch: Partial<Item>) => sampleItem(number, { subteam: null, ...patch })
  const days = (start: string | null, due: string | null) => ({ start_date: start, due_date: due })
  const keyDate = (due: string) => ({ is_milestone: true, due_date: due })
  const phase = (start: string, due: string) => ({ is_phase: true, start_date: start, due_date: due })
  return [
    // Mechanical
    mechanical(101, {
      title: 'Chassis concept design', status: 'Done', domain: 'Chassis', assignees: ['js12345'],
      ...days('2026-09-07', '2026-10-16'),
    }),
    mechanical(102, {
      title: 'Chassis detailed design', status: 'In Progress', domain: 'Chassis',
      assignees: ['js12345', 'zz99999', 'ab12345'], ...days('2026-10-12', '2026-12-18'),
    }),
    mechanical(103, {
      title: 'Frame tube sizing', status: 'Done', domain: 'Chassis', parent_id: 'id-102',
      ...days('2026-10-12', '2026-10-30'),
    }),
    // Overdue, but rolled into #102 unless Subtasks is ticked.
    mechanical(104, {
      title: 'Jig drawings', domain: 'Chassis', parent_id: 'id-102', ...days('2026-10-26', '2026-11-06'),
    }),
    mechanical(105, { title: 'Old frame idea', status: 'Done', parent_id: 'id-102', archived: true }),
    mechanical(106, {
      title: 'Suspension geometry', domain: 'Suspension', blocked_by: [102], ...days('2026-11-16', '2027-01-22'),
    }),
    mechanical(107, {
      title: 'Steering rack bracket', status: 'Blocked', domain: 'Steering', ...days('2026-10-05', '2026-11-06'),
    }),
    mechanical(108, { title: 'Wheel hub machining', ...days(null, '2027-02-26') }),
    mechanical(109, { title: 'Old bracket', archived: true, ...days('2026-10-01', '2026-10-10') }),
    // Electrical
    electrical(201, {
      title: 'Accumulator cell testing', status: 'In Review', domain: 'Accumulator', assignees: ['cd12345'],
      ...days('2026-10-01', '2026-11-20'),
    }),
    electrical(202, {
      title: 'LV wiring loom', status: 'Updates Needed', domain: 'LV systems', assignees: ['ab12345', 'ef12345'],
      ...days('2026-11-02', '2027-01-15'),
    }),
    electrical(203, {
      title: 'Battery management firmware', domain: 'Accumulator', blocked_by: [107],
      ...days('2026-12-01', '2027-03-31'),
    }),
    electrical(204, { title: 'Order connectors', domain: 'LV systems', parent_id: 'id-202' }),
    // Powertrain
    powertrain(301, { title: 'Motor selection', status: 'Done', ...days('2026-09-14', '2026-10-09') }),
    powertrain(302, { title: 'Gearbox design', status: 'In Progress', ...days('2026-10-19', '2027-02-12') }),
    // The whole team
    team(401, { title: 'Sponsor pack', status: 'In Progress', ...days('2026-10-01', '2026-11-06') }),
    team(402, { title: 'Recruitment drive' }),
    // Key dates
    team(501, { title: 'Design freeze', blocked_by: [102], ...keyDate('2026-12-15') }),
    mechanical(502, { title: 'Chassis sign-off', ...keyDate('2026-11-02') }),
    team(503, { title: 'Kick-off', status: 'Done', ...keyDate('2026-09-05') }),
    team(504, { title: 'FS UK competition', ...keyDate('2027-07-15') }),
    electrical(505, { title: 'Battery review', ...keyDate('2027-01-20') }),
    sampleItem(506, { title: 'Retired review', subteam: 'Admin', archived: true, ...keyDate('2027-02-01') }),
    sampleItem(507, { title: 'Brake test day', subteam: 'Braking System', ...keyDate('2027-03-10') }),
    // Phases
    team(601, { title: 'Concept', ...phase('2026-09-01', '2026-10-16') }),
    team(602, { title: 'Detailed design', ...phase('2026-10-19', '2026-12-20') }),
    team(603, { title: 'Manufacture', ...phase('2027-01-04', '2027-04-30') }),
    electrical(604, { title: 'Electrical test', ...phase('2027-03-01', '2027-05-28') }),
    // Still being created: no number yet.
    sampleItem(0, { id: 'new-item', title: 'Brand new task', position: 0.5, ...days('2026-11-12', '2026-11-20') }),
  ]
}

export function byId(items: Item[]): Record<string, Item> {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

/** What the Timeline shows with no filter: the unarchived items in manual order (as useViewItems gives them). */
export function timelineItems(items: Item[]): Item[] {
  return items.filter((item) => !item.archived).sort((a, b) => a.position - b.position || a.number - b.number)
}

/** The plan input for the sample board as the Timeline shows it (all subteams, no filter), with the PDF's defaults. */
export function sampleInput(patch: Partial<PlanInput> = {}): PlanInput {
  const items = sampleItems()
  const members = sampleMembers()
  return {
    items: timelineItems(items),
    allItems: byId(items),
    options: sampleOptions(),
    members,
    me: members.js12345,
    shownTeams: [],
    query: '',
    today: SAMPLE_TODAY,
    exportedAt: SAMPLE_EXPORTED_AT,
    connected: true,
    settings: defaultSettings(),
    format: 'pdf',
    note: '',
    ...patch,
  }
}
