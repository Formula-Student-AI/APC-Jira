// The store's record of who is in which subteam, against a fake Supabase (a small in-memory database behind
// the query-builder chains the store uses): saving, failures (explained and put back), a full reload that
// overlaps a change, and the list's own realtime channel.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FieldOption, Member, SubteamMember } from '../types'

type Row = Record<string, unknown>
interface Request {
  table: string
  /** The chain after .from(table), e.g. [['delete', []], ['eq', ['subteam', 'mech']], ...] */
  ops: [string, unknown[]][]
}
interface Reply {
  data: unknown
  error: { message: string; code?: string } | null
}
interface FakeChannel {
  name: string
  bindings: { type: string; filter: Row; callback: (payload: unknown) => void }[]
  status?: (status: string) => void
}

const fake = vi.hoisted(() => {
  const db = {
    tables: {} as Record<string, Row[]>,
    /**
     * Requests wait for these before they are answered (and, for a change, before it is made): by table, to
     * hold a load in flight, or by table and first step ('subteam_members:insert'), to hold one kind only.
     */
    holds: {} as Record<string, Promise<void> | undefined>,
    /** Answers a request differently in one test (undefined: the database answers). */
    override: null as ((request: Request) => Reply | undefined) | null,
    channels: [] as FakeChannel[],
  }

  // A read is a snapshot of the table when the request is sent, as a database read would be.
  async function answer(request: Request): Promise<Reply> {
    const hold = db.holds[request.table] ?? db.holds[`${request.table}:${request.ops[0]?.[0]}`]
    if (hold) await hold
    const custom = db.override?.(request)
    if (custom) return custom
    const rows = db.tables[request.table] ?? []
    const eqs = request.ops.filter(([name]) => name === 'eq').map(([, args]) => args as [string, unknown])
    const matches = (row: Row) => eqs.every(([column, value]) => row[column] === value)
    const [first] = request.ops
    if (first?.[0] === 'insert') {
      const row = first[1][0] as Row
      if (rows.some((r) => r.subteam === row.subteam && r.username === row.username)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
      }
      db.tables[request.table] = [...rows, { ...row, added_by: 'ad11111', added_at: '2026-11-11T12:00:00Z' }]
      return { data: null, error: null }
    }
    if (first?.[0] === 'delete') {
      db.tables[request.table] = rows.filter((row) => !matches(row))
      return { data: rows.filter(matches), error: null }
    }
    const range = request.ops.find(([name]) => name === 'range')?.[1] as [number, number] | undefined
    const found = rows.filter(matches)
    return { data: range ? found.slice(range[0], range[1] + 1) : found, error: null }
  }

  function from(table: string) {
    const request: Request = { table, ops: [] }
    const builder: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            const reply = answer(request)
            return reply.then.bind(reply)
          }
          return (...args: unknown[]) => {
            request.ops.push([String(prop), args])
            return builder
          }
        },
      },
    )
    return builder
  }

  function channel(name: string) {
    const record: FakeChannel = { name, bindings: [] }
    db.channels.push(record)
    const api = {
      on(type: string, filter: Row, callback: (payload: unknown) => void) {
        record.bindings.push({ type, filter, callback })
        return api
      },
      subscribe(callback?: (status: string) => void) {
        record.status = callback
        return api
      },
    }
    return api
  }

  return { db, supabase: { from, channel, removeChannel: async () => 'ok' } }
})

vi.mock('../lib/supabase', () => ({ supabase: fake.supabase }))
vi.mock('./auth', () => ({ currentUsername: () => 'ad11111', refreshSession: vi.fn() }))

const { loadBoard, setSubteamMember, startBoard, stopBoard, useBoard } = await import('./board')

const member = (username: string, fullName: string, admin = false): Member => ({
  username,
  full_name: fullName,
  email: '',
  github_login: null,
  is_board_admin: admin,
  active: true,
  created_at: '',
})
const MECHANICAL: FieldOption = {
  id: 'mech',
  field: 'subteam',
  name: 'Mechanical',
  color: 'BLUE',
  description: null,
  sort_order: 0,
  leads: [],
  parent_id: null,
  created_at: '',
}
const row = (subteam: string, username: string): SubteamMember => ({ subteam, username, added_by: null, added_at: '2026-11-01T00:00:00Z' })
/** Sets who is in which subteam in the database itself (as if changed elsewhere). */
const inDatabase = (...rows: SubteamMember[]) => {
  fake.db.tables.subteam_members = rows.map((r) => ({ ...r }))
}

/** Who is in which subteam on this device, as "subteam/username". */
const shown = () => useBoard.getState().subteamMembers.map((r) => `${r.subteam}/${r.username}`)
/** Lets every pending reply and follow-up read finish. */
const settle = () => new Promise((done) => setTimeout(done, 0))
const ok: Reply = { data: [], error: null }

beforeEach(() => {
  fake.db.tables = {
    members: [member('ad11111', 'Ada Admin', true), member('ab12345', 'Alice Bell')] as unknown as Row[],
    field_options: [MECHANICAL] as unknown as Row[],
    items: [],
    attachments: [],
    subteam_members: [],
  }
  fake.db.holds = {}
  fake.db.override = null
  fake.db.channels = []
})

describe('setSubteamMember', () => {
  it('saves an addition and a removal', async () => {
    await loadBoard()
    expect(await setSubteamMember('mech', 'ab12345', true)).toBeNull()
    expect(shown()).toEqual(['mech/ab12345'])
    expect(fake.db.tables.subteam_members).toHaveLength(1)
    expect(await setSubteamMember('mech', 'ab12345', false)).toBeNull()
    expect(shown()).toEqual([])
    expect(fake.db.tables.subteam_members).toHaveLength(0)
  })

  it('says why an addition was refused, and takes it back', async () => {
    await loadBoard()
    fake.db.override = (request) =>
      request.ops[0]?.[0] === 'insert'
        ? { data: null, error: { message: 'new row violates row-level security policy for table "subteam_members"', code: '42501' } }
        : undefined
    expect(await setSubteamMember('mech', 'ab12345', true)).toBe("Couldn't add Alice Bell to Mechanical: only board admins and its leads can.")
    expect(shown()).toEqual([])
  })

  it('puts back a removal the database refused (nothing deleted, and still there)', async () => {
    inDatabase(row('mech', 'ab12345'))
    await loadBoard()
    fake.db.override = (request) => (request.ops[0]?.[0] === 'delete' ? ok : undefined)
    expect(await setSubteamMember('mech', 'ab12345', false)).toBe("Couldn't take Alice Bell out of Mechanical: only board admins and its leads can.")
    expect(shown()).toEqual(['mech/ab12345'])
  })

  it("doesn't count a removal as done when the check after it fails", async () => {
    inDatabase(row('mech', 'ab12345'))
    await loadBoard()
    fake.db.override = (request) => {
      if (request.ops[0]?.[0] === 'delete') return ok
      if (request.ops.some(([name]) => name === 'eq')) return { data: null, error: { message: 'TypeError: Failed to fetch' } }
      return undefined
    }
    expect(await setSubteamMember('mech', 'ab12345', false)).toBe("Couldn't take Alice Bell out of Mechanical: TypeError: Failed to fetch")
    expect(shown()).toEqual(['mech/ab12345'])
  })

  it('counts an addition or removal someone else made first as done', async () => {
    await loadBoard()
    inDatabase(row('mech', 'ab12345')) // added elsewhere; not heard here yet
    expect(await setSubteamMember('mech', 'ab12345', true)).toBeNull()
    expect(shown()).toEqual(['mech/ab12345'])
    inDatabase() // and taken out elsewhere
    expect(await setSubteamMember('mech', 'ab12345', false)).toBeNull()
    expect(shown()).toEqual([])
  })
})

describe('a full reload that overlaps a change', () => {
  it('keeps an addition made while the reload is on its way, rather than the older list it read', async () => {
    await loadBoard()
    let release = () => {}
    fake.db.holds.items = new Promise<void>((done) => (release = done))
    const reload = loadBoard() // reads the (still empty) list now; the tasks are held back
    expect(await setSubteamMember('mech', 'ab12345', true)).toBeNull()
    fake.db.holds.items = undefined
    release()
    await reload
    expect(shown()).toEqual(['mech/ab12345'])
    await settle() // the list is read again
    expect(shown()).toEqual(['mech/ab12345'])
  })

  it('keeps a removal made while the reload is on its way', async () => {
    inDatabase(row('mech', 'ab12345'))
    await loadBoard()
    let release = () => {}
    fake.db.holds.items = new Promise<void>((done) => (release = done))
    const reload = loadBoard()
    expect(await setSubteamMember('mech', 'ab12345', false)).toBeNull()
    fake.db.holds.items = undefined
    release()
    await reload
    await settle()
    expect(shown()).toEqual([])
  })

  it('still puts a reload in place when nothing changed meanwhile', async () => {
    await loadBoard()
    inDatabase(row('mech', 'ab12345')) // added elsewhere, while this device wasn't listening
    await loadBoard()
    expect(shown()).toEqual(['mech/ab12345'])
  })
})

describe('a read of the list while a change is being saved', () => {
  /** Holds every `step` (insert or delete) of the list until the returned function is called. */
  const hold = (step: string) => {
    let release = () => {}
    fake.db.holds[`subteam_members:${step}`] = new Promise<void>((done) => (release = done))
    return () => {
      fake.db.holds[`subteam_members:${step}`] = undefined
      release()
    }
  }

  it('is set aside, and the list read again once the addition is saved', async () => {
    await loadBoard()
    const release = hold('insert')
    const saving = setSubteamMember('mech', 'ab12345', true)
    expect(shown()).toEqual(['mech/ab12345'])
    await loadBoard() // reads the list from before the addition: it mustn't take Alice out again
    expect(shown()).toEqual(['mech/ab12345'])
    release()
    expect(await saving).toBeNull()
    await settle()
    expect(shown()).toEqual(['mech/ab12345'])
  })

  it('is set aside while a removal is being saved', async () => {
    inDatabase(row('mech', 'ab12345'))
    await loadBoard()
    const release = hold('delete')
    const saving = setSubteamMember('mech', 'ab12345', false)
    await loadBoard() // reads the list from before the removal: it mustn't put Alice back
    expect(shown()).toEqual([])
    release()
    expect(await saving).toBeNull()
    await settle()
    expect(shown()).toEqual([])
  })

  it('is set aside for a reload that began before the change and ends while it is saved', async () => {
    await loadBoard()
    let releaseItems = () => {}
    fake.db.holds.items = new Promise<void>((done) => (releaseItems = done))
    const reload = loadBoard() // reads the (empty) list now
    const release = hold('insert')
    const saving = setSubteamMember('mech', 'ab12345', true)
    fake.db.holds.items = undefined
    releaseItems()
    await reload
    await settle()
    expect(shown()).toEqual(['mech/ab12345'])
    release()
    expect(await saving).toBeNull()
    await settle()
    expect(shown()).toEqual(['mech/ab12345'])
  })

  it('still shows a refused addition as taken back, after the read again', async () => {
    await loadBoard()
    const release = hold('insert')
    fake.db.override = (request) =>
      request.ops[0]?.[0] === 'insert' ? { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } } : undefined
    const saving = setSubteamMember('mech', 'ab12345', true)
    await loadBoard()
    release()
    expect(await saving).toBe("Couldn't add Alice Bell to Mechanical: only board admins and its leads can.")
    await settle()
    expect(shown()).toEqual([])
  })
})

describe('live updates', () => {
  const channelNamed = (name: string) => {
    const found = fake.db.channels.find((c) => c.name === name)
    if (!found) throw new Error(`no channel ${name}`)
    return found
  }
  const tablesOf = (channel: FakeChannel) =>
    channel.bindings.filter((b) => b.type === 'postgres_changes').map((b) => b.filter.table)
  const send = (channel: FakeChannel, type: string, payload: unknown) => {
    for (const binding of channel.bindings) if (binding.type === type) binding.callback(payload)
  }

  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    stopBoard()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('streams the list on a channel of its own, so the board stays live if it fails', async () => {
    startBoard()
    await settle()
    const board = channelNamed('board-changes')
    const memberships = channelNamed('subteam-members-changes')
    expect(tablesOf(board)).not.toContain('subteam_members')
    expect(tablesOf(memberships)).toEqual(['subteam_members'])

    board.status?.('SUBSCRIBED')
    expect(useBoard.getState().live).toBe('live')
    send(memberships, 'system', { extension: 'postgres_changes', status: 'error', message: 'relation does not exist' })
    expect(useBoard.getState().live).toBe('live')
  })

  it("doesn't show the board as live while the server can't stream its changes", async () => {
    startBoard()
    await settle()
    const board = channelNamed('board-changes')
    board.status?.('SUBSCRIBED')
    send(board, 'system', { extension: 'postgres_changes', status: 'error', message: 'Unable to subscribe' })
    expect(useBoard.getState().live).toBe('reconnecting')
    send(board, 'system', { extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL' })
    expect(useBoard.getState().live).toBe('live')
  })

  it('hears additions and removals made elsewhere', async () => {
    startBoard()
    await settle()
    const memberships = channelNamed('subteam-members-changes')
    send(memberships, 'postgres_changes', { eventType: 'INSERT', new: row('mech', 'ab12345'), old: {} })
    expect(shown()).toEqual(['mech/ab12345'])
    send(memberships, 'postgres_changes', { eventType: 'DELETE', new: {}, old: { subteam: 'mech', username: 'ab12345' } })
    expect(shown()).toEqual([])
  })

  it('reads the list again once its stream starts, so nothing changed before then is missed', async () => {
    startBoard()
    await settle()
    inDatabase(row('mech', 'ab12345')) // changed after the first read, before the stream
    send(channelNamed('subteam-members-changes'), 'system', { extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL' })
    await settle()
    expect(shown()).toEqual(['mech/ab12345'])
  })
})
