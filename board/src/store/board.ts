// Board data: items, members, dropdown options and item history, kept live with Supabase Realtime.
//
// Items are shown as `base` (last server row) + `overlay` (local changes still being saved), so edits
// appear instantly, survive realtime echoes, and roll back with a message if the save fails.

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { create } from 'zustand'
import { errorMessage } from '../lib/format'
import { linkTypeProblem, withNumber, type LinkType } from '../lib/links'
import { sortOptions } from '../lib/options'
import { supabase } from '../lib/supabase'
import type { Activity, Attachment, FieldOption, Item, ItemExtra, ItemPatch, Member, NewItem, SubteamMember } from '../types'
import { currentUsername, refreshSession } from './auth'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'
export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'offline'
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface Toast {
  id: number
  kind: 'error' | 'info'
  message: string
}

export interface BoardState {
  /** Last row seen from the server, by item id */
  base: Record<string, Item>
  /** Local changes not yet confirmed by the server, by item id */
  overlay: Record<string, ItemPatch>
  /** What the UI shows (base + overlay), by item id */
  items: Record<string, Item>
  /** By username */
  members: Record<string, Member>
  /** Sorted by field, then sort_order */
  options: FieldOption[]
  /** History per item id, newest first. Loaded when an item panel opens (loadActivity). */
  activity: Record<string, Activity[]>
  /** Attachments (images) per item id, oldest first */
  attachments: Record<string, Attachment[]>
  /** Who is in which subteam (a record only: it changes no task), oldest first */
  subteamMembers: SubteamMember[]
  load: LoadState
  loadError: string | null
  live: LiveState
  saveState: Record<string, SaveState>
  toasts: Toast[]
}

const initialState: BoardState = {
  base: {},
  overlay: {},
  items: {},
  members: {},
  options: [],
  activity: {},
  attachments: {},
  subteamMembers: [],
  load: 'idle',
  loadError: null,
  live: 'connecting',
  saveState: {},
  toasts: [],
}

export const useBoard = create<BoardState>(() => ({ ...initialState }))

const set = useBoard.setState
const get = useBoard.getState

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastSeq = 0

export function pushToast(kind: Toast['kind'], message: string): void {
  const id = ++toastSeq
  set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
  setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000)
}

export function dismissToast(id: number): void {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

// ---------------------------------------------------------------------------
// Item state helpers
// ---------------------------------------------------------------------------

function merge(base: Item | undefined, overlay: ItemPatch | undefined): Item | undefined {
  if (!base) return undefined
  return overlay && Object.keys(overlay).length > 0 ? { ...base, ...overlay } : base
}

/** Replace an item's base and/or overlay (null removes it) and recompute what the UI shows. */
function setItem(id: string, change: { base?: Item | null; overlay?: ItemPatch | null }): void {
  set((s) => {
    const base = { ...s.base }
    const overlay = { ...s.overlay }
    const items = { ...s.items }
    if (change.base === null) delete base[id]
    else if (change.base) base[id] = change.base
    if (change.overlay === null || (change.overlay && Object.keys(change.overlay).length === 0)) delete overlay[id]
    else if (change.overlay) overlay[id] = change.overlay
    const shown = merge(base[id], overlay[id])
    if (shown) items[id] = shown
    else delete items[id]
    return { base, overlay, items }
  })
}

const time = (iso: string) => Date.parse(iso) || 0

/**
 * Apply a row from the server unless we already have a newer version of it. Rows are merged into
 * what we have, so a column missing from a realtime payload never blanks the field.
 */
function applyServerItem(row: Item, force = false): void {
  const current = get().base[row.id]
  if (!force && current && time(current.updated_at) > time(row.updated_at)) return
  setItem(row.id, { base: current && !pendingCreates.has(row.id) ? { ...current, ...row } : row })
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function setSaveState(id: string, state: SaveState): void {
  set((s) => ({ saveState: { ...s.saveState, [id]: state } }))
}

const inFlight: Record<string, number> = {}
const pendingCreates = new Set<string>()

function beginSave(id: string): void {
  inFlight[id] = (inFlight[id] ?? 0) + 1
  setSaveState(id, 'saving')
}

function endSave(id: string, ok: boolean): void {
  inFlight[id] = Math.max(0, (inFlight[id] ?? 1) - 1)
  if (!ok) setSaveState(id, 'error')
  else if (inFlight[id] === 0 && get().saveState[id] !== 'error') setSaveState(id, 'saved')
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function fetchAll<T>(table: string, orderBy: string): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderBy)
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < pageSize) return rows
  }
}

let loadSeq = 0
/**
 * Counts every change to who is in which subteam on this device: made here, saved, heard live or read. A read
 * of the list that began before the latest change may be out of date, so it isn't put in place (see
 * loadSubteamMembers).
 */
let membershipEdits = 0
/**
 * Changes to the list on their way to the database. A read made meanwhile may be from before they were saved,
 * so it is set aside, and the last of them to finish reads the list again (if one was set aside).
 */
let membershipSaves = 0
let membershipReadOwed = false

/** Fetch everything. Used at start-up and after every (re)connect so nothing missed offline is lost. */
export async function loadBoard(): Promise<void> {
  const seq = ++loadSeq
  const edits = membershipEdits
  if (get().load !== 'ready') set({ load: 'loading', loadError: null })
  try {
    const [items, members, options, attachments, subteamMembers] = await Promise.all([
      fetchAll<Item>('items', 'number'),
      fetchAll<Member>('members', 'username'),
      fetchAll<FieldOption>('field_options', 'sort_order'),
      fetchAll<Attachment>('attachments', 'created_at'),
      readSubteamMembers(),
    ])
    if (seq !== loadSeq) return // a newer load started meanwhile
    // This device is no longer signed in as a member (deleted, say, while it was offline): the database
    // shows it nothing, so go back to the login screen rather than show an empty board.
    const me = currentUsername()
    if (me && !members.some((m) => m.username === me)) {
      void refreshSession()
      return
    }
    // Who is in which subteam changed while this was read (a change made here, or heard live), or a change is
    // still being saved: keep the list as it is now and read it again, rather than put back what it was.
    const membershipRead = subteamMembers && membershipReadIsCurrent(edits) ? subteamMembers : null
    if (membershipRead) membershipEdits++
    else if (subteamMembers) readSubteamMembersAgain()
    set((s) => {
      const base: Record<string, Item> = {}
      for (const row of items) {
        const known = s.base[row.id]
        base[row.id] = known && time(known.updated_at) > time(row.updated_at) ? known : row
      }
      for (const id of pendingCreates) if (s.base[id]) base[id] = s.base[id]
      const overlay: Record<string, ItemPatch> = {}
      const shown: Record<string, Item> = {}
      for (const id of Object.keys(base)) {
        if (s.overlay[id]) overlay[id] = s.overlay[id]
        shown[id] = merge(base[id], overlay[id]) as Item
      }
      return {
        base,
        overlay,
        items: shown,
        members: Object.fromEntries(members.map((m) => [m.username, m])),
        options: sortOptions(options),
        attachments: groupAttachments(attachments),
        subteamMembers: membershipRead ?? s.subteamMembers,
        load: 'ready',
        loadError: null,
      }
    })
    for (const itemId of Object.keys(get().activity)) void loadActivity(itemId)
  } catch (error) {
    if (seq !== loadSeq) return
    set((s) => ({ load: s.load === 'ready' ? 'ready' : 'error', loadError: errorMessage(error) }))
    if (get().load === 'ready') pushToast('error', `Couldn't refresh the board: ${errorMessage(error)}`)
  }
}

/** Load an item's history (newest first). */
export async function loadActivity(itemId: string): Promise<void> {
  const { data, error } = await supabase
    .from('activity')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(200)
  if (error) {
    pushToast('error', `Couldn't load history: ${error.message}`)
    return
  }
  set((s) => ({ activity: { ...s.activity, [itemId]: (data ?? []) as Activity[] } }))
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

let channel: RealtimeChannel | null = null
let membershipChannel: RealtimeChannel | null = null
let hiddenSince: number | null = null

/** A `system` message on a channel: with extension 'postgres_changes', whether the server streams its changes. */
interface StreamStatus {
  extension?: string
  status?: string
  message?: string
}

function onItemChange(payload: RealtimePostgresChangesPayload<Item>): void {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as Partial<Item>).id
    if (id) setItem(id, { base: null, overlay: null })
    return
  }
  applyServerItem(payload.new as Item)
}

function removeMember(username: string): void {
  if (!(username in get().members)) return // already gone (deleted here, then the realtime echo)
  set((s) => {
    const members = { ...s.members }
    delete members[username]
    return { members }
  })
  // The database takes them out of their subteams too.
  changeSubteamMembers((rows) => rows.filter((row) => row.username !== username))
}

function onMemberChange(payload: RealtimePostgresChangesPayload<Member>): void {
  if (payload.eventType === 'DELETE') {
    const username = (payload.old as Partial<Member>).username
    if (!username) return
    removeMember(username)
    // I've been deleted: this device is no longer signed in, so go back to the login screen.
    if (username === currentUsername()) void refreshSession()
    return
  }
  const member = payload.new as Member
  set((s) => ({ members: { ...s.members, [member.username]: member } }))
  // My own row changed (e.g. made a board admin): re-read what this session may do.
  if (member.username === currentUsername()) void refreshSession()
}

function putOption(option: FieldOption): void {
  set((s) => ({ options: sortOptions([...s.options.filter((o) => o.id !== option.id), option]) }))
}

function onOptionChange(payload: RealtimePostgresChangesPayload<FieldOption>): void {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as Partial<FieldOption>).id
    if (id) dropOption(id)
    return
  }
  putOption(payload.new as FieldOption)
}

function dropOption(id: string): void {
  set((s) => ({ options: s.options.filter((o) => o.id !== id) }))
  // A deleted subteam's members go with it, in the database as here.
  changeSubteamMembers((rows) => rows.filter((row) => row.subteam !== id))
}

// ---------------------------------------------------------------------------
// Subteam members: who is in which subteam (a record only: it changes no task)
// ---------------------------------------------------------------------------

const sameMembership = (row: SubteamMember, subteam: string, username: string) => row.subteam === subteam && row.username === username

/** Every change to the list of who is in which subteam goes through here (see membershipEdits). */
function changeSubteamMembers(change: (rows: SubteamMember[]) => SubteamMember[]): void {
  membershipEdits++
  set((s) => ({ subteamMembers: change(s.subteamMembers) }))
}

function putSubteamMember(row: SubteamMember): void {
  changeSubteamMembers((rows) => [...rows.filter((r) => !sameMembership(r, row.subteam, row.username)), row])
}

function dropSubteamMember(subteam: string, username: string): void {
  changeSubteamMembers((rows) => rows.filter((r) => !sameMembership(r, subteam, username)))
}

function onSubteamMemberChange(payload: RealtimePostgresChangesPayload<SubteamMember>): void {
  if (payload.eventType === 'DELETE') {
    const old = payload.old as Partial<SubteamMember>
    if (old.subteam && old.username) dropSubteamMember(old.subteam, old.username)
    return
  }
  putSubteamMember(payload.new as SubteamMember)
}

/**
 * The whole list, or null if it can't be read. It is only a record, which nothing else on the board needs,
 * so the board still loads without it (say the database is a step behind this page), keeping the list it had.
 */
function readSubteamMembers(): Promise<SubteamMember[] | null> {
  return fetchAll<SubteamMember>('subteam_members', 'added_at').catch((error: unknown) => {
    console.warn(`Couldn't read the subteam members: ${errorMessage(error)}`)
    return null
  })
}

/** Whether a read of the list that began at `edits` can be shown: nothing changed since, and nothing is being saved. */
function membershipReadIsCurrent(edits: number): boolean {
  return edits === membershipEdits && membershipSaves === 0
}

/** Read the list again: now, or (while changes are being saved) once the last of them is. */
function readSubteamMembersAgain(): void {
  if (membershipSaves > 0) membershipReadOwed = true
  else void loadSubteamMembers()
}

/** Read who is in which subteam again (only that), and show it unless it changed meanwhile: then read again. */
async function loadSubteamMembers(): Promise<void> {
  const seq = loadSeq
  const edits = membershipEdits
  const rows = await readSubteamMembers()
  // Signed out, or a full load started meanwhile (it reads the list too); or the list couldn't be read.
  if (seq !== loadSeq || !rows) return
  if (!membershipReadIsCurrent(edits)) return readSubteamMembersAgain()
  changeSubteamMembers(() => rows)
}

/**
 * Puts a member in a subteam (`subteam` is its option id), or takes them out: the record of who is in which
 * subteam, which board admins and the subteam's leads keep. It changes no task, assignee or lead. Shown at
 * once, and put back if the database refuses. Returns why it couldn't be saved (to show beside the list:
 * a toast would be hidden behind the dialog it is in), or null once it is.
 */
export async function setSubteamMember(subteam: string, username: string, inSubteam: boolean): Promise<string | null> {
  const had = get().subteamMembers.find((row) => sameMembership(row, subteam, username))
  if (inSubteam === !!had) return null
  const name = get().members[username]?.full_name ?? username
  const team = get().options.find((option) => option.id === subteam)?.name ?? 'the subteam'
  if (inSubteam) putSubteamMember({ subteam, username, added_by: currentUsername(), added_at: new Date().toISOString() })
  else dropSubteamMember(subteam, username)
  membershipSaves++
  const problem = await (inSubteam ? insertMembership(subteam, username) : deleteMembership(subteam, username)).finally(() => {
    membershipSaves--
    // A read of the list that began while this was on its way may be from before it was saved.
    membershipEdits++
  })
  if (problem) {
    if (inSubteam) dropSubteamMember(subteam, username)
    else if (had) putSubteamMember(had)
  }
  if (membershipSaves === 0 && membershipReadOwed) {
    membershipReadOwed = false
    void loadSubteamMembers()
  }
  if (!problem) return null
  return inSubteam ? `Couldn't add ${name} to ${team}: ${problem}` : `Couldn't take ${name} out of ${team}: ${problem}`
}

const NOT_ALLOWED = 'only board admins and its leads can.'

async function insertMembership(subteam: string, username: string): Promise<string | null> {
  const { error } = await supabase.from('subteam_members').insert({ subteam, username })
  // 23505: someone else put them in at the same moment, which is what was wanted.
  if (!error || error.code === '23505') return null
  return error.code === '42501' ? NOT_ALLOWED : errorMessage(error)
}

async function deleteMembership(subteam: string, username: string): Promise<string | null> {
  const { data, error } = await supabase.from('subteam_members').delete().eq('subteam', subteam).eq('username', username).select('username')
  if (error) return errorMessage(error)
  if (data.length > 0) return null
  // Nothing was deleted: either someone else took them out already, or this session may not. Look again.
  const { data: still, error: lookError } = await supabase
    .from('subteam_members')
    .select('username')
    .eq('subteam', subteam)
    .eq('username', username)
  if (lookError) return errorMessage(lookError)
  return still.length === 0 ? null : NOT_ALLOWED
}

// ---------------------------------------------------------------------------
// Attachments (uploads and deletes are in store/attachments.ts)
// ---------------------------------------------------------------------------

function groupAttachments(rows: Attachment[]): Record<string, Attachment[]> {
  const byItem: Record<string, Attachment[]> = {}
  for (const row of rows) (byItem[row.item_id] ??= []).push(row)
  return byItem
}

/** Show an attachment (once), after an upload or from realtime. */
export function putAttachment(row: Attachment): void {
  set((s) => {
    const list = s.attachments[row.item_id] ?? []
    if (list.some((a) => a.id === row.id)) return {}
    const next = [...list, row].sort((a, b) => a.created_at.localeCompare(b.created_at))
    return { attachments: { ...s.attachments, [row.item_id]: next } }
  })
}

/** Stop showing an attachment (deleted here or elsewhere). */
export function dropAttachment(id: string): void {
  set((s) => {
    for (const [itemId, list] of Object.entries(s.attachments)) {
      if (list.some((a) => a.id === id)) {
        return { attachments: { ...s.attachments, [itemId]: list.filter((a) => a.id !== id) } }
      }
    }
    return {}
  })
}

function onAttachmentChange(payload: RealtimePostgresChangesPayload<Attachment>): void {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as Partial<Attachment>).id
    if (id) dropAttachment(id)
  } else if (payload.eventType === 'INSERT') {
    putAttachment(payload.new as Attachment)
  }
}

function onActivityInsert(payload: RealtimePostgresChangesPayload<Activity>): void {
  const entry = payload.new as Activity
  set((s) => {
    const list = s.activity[entry.item_id]
    if (!list || list.some((a) => a.id === entry.id)) return {}
    return { activity: { ...s.activity, [entry.item_id]: [entry, ...list] } }
  })
}

function onOnline(): void {
  if (get().live === 'offline') set({ live: 'reconnecting' })
}

function onOffline(): void {
  set({ live: 'offline' })
}

function onVisibility(): void {
  if (document.visibilityState === 'hidden') {
    hiddenSince = Date.now()
    return
  }
  // Long background tabs can miss events while the browser throttles them: refetch to be safe.
  if (hiddenSince !== null && Date.now() - hiddenSince > 60_000) void loadBoard()
  hiddenSince = null
}

/** Load the board and subscribe to live changes. Call once the member is signed in. */
export function startBoard(): void {
  if (channel) return
  set({ live: navigator.onLine ? 'connecting' : 'offline' })
  void loadBoard()
  channel = supabase
    .channel('board-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onItemChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, onMemberChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'field_options' }, onOptionChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, onActivityInsert)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments' }, onAttachmentChange)
    .on('system', {}, (payload: StreamStatus) => {
      if (payload?.extension !== 'postgres_changes') return
      if (payload.status === 'ok') {
        // Sent once the server really streams database changes for this channel (just after SUBSCRIBED, or
        // when a failed try below succeeds). Refetch then, so nothing changed before this moment is missed.
        set({ live: 'live' })
        void loadBoard()
      } else if (payload.status === 'error') {
        // Joined, but the server can't stream the changes (it tries again shortly): this board isn't live.
        console.warn(`Live updates stopped: ${payload.message ?? 'no reason given'}`)
        set({ live: navigator.onLine ? 'reconnecting' : 'offline' })
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const reconnected = get().live !== 'connecting'
        set({ live: 'live' })
        // On a reconnect, refetch so changes made while we were disconnected aren't lost.
        if (reconnected) void loadBoard()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (channel) set({ live: navigator.onLine ? 'reconnecting' : 'offline' })
      }
    })
  // Who is in which subteam has a channel of its own, so that if its table can't be streamed (say the
  // database is a step behind this page) the rest of the board stays live. It reconnects with the socket.
  membershipChannel = supabase
    .channel('subteam-members-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subteam_members' }, onSubteamMemberChange)
    .on('system', {}, (payload: StreamStatus) => {
      if (payload?.extension !== 'postgres_changes') return
      // Streaming now: read the list again so nothing changed before this moment is missed.
      if (payload.status === 'ok') void loadSubteamMembers()
      else if (payload.status === 'error') console.warn(`Live updates of the subteam members stopped: ${payload.message ?? 'no reason given'}`)
    })
    .subscribe()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibility)
}

/** Unsubscribe and clear everything (used when switching user). */
export function stopBoard(): void {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  document.removeEventListener('visibilitychange', onVisibility)
  for (const current of [channel, membershipChannel]) if (current) void supabase.removeChannel(current)
  channel = null
  membershipChannel = null
  loadSeq++
  pendingCreates.clear()
  for (const key of Object.keys(inFlight)) delete inFlight[key]
  set({ ...initialState })
}

// ---------------------------------------------------------------------------
// Changes (optimistic, with rollback)
// ---------------------------------------------------------------------------

type SaveResult = { data: unknown; error: { message: string } | null }

/**
 * Show `optimistic` immediately, run `request`, then apply the server's row. If the save fails the
 * change is undone and a message is shown. `what` names the change in that message.
 */
async function saveItem(id: string, optimistic: ItemPatch, request: () => PromiseLike<SaveResult>, what: string): Promise<boolean> {
  if (!get().items[id]) return false
  setItem(id, { overlay: { ...get().overlay[id], ...optimistic } })
  beginSave(id)

  const { data, error } = await request()
  const ok = !error && !!data

  // Drop the overlay keys we set, unless a newer local change replaced them in the meantime.
  const overlay: ItemPatch = { ...get().overlay[id] }
  for (const key of Object.keys(optimistic) as (keyof ItemPatch)[]) {
    if (sameValue(overlay[key], optimistic[key])) delete overlay[key]
  }
  if (ok) applyServerItem(data as Item)
  setItem(id, { overlay })
  endSave(id, ok)

  if (!ok) {
    const reason = error?.message ?? 'the item no longer exists or you are not allowed to change it'
    pushToast('error', `Couldn't save ${what}: ${reason}. The change was undone.`)
  }
  return ok
}

/**
 * Save a change to an item's columns. The UI updates immediately; if the save fails the change is
 * undone and a message is shown. `what` names the change in that message, e.g. "the title".
 * For custom fields use updateExtraField; for adding/removing assignees or labels use updateItemList.
 */
export function updateItem(id: string, patch: ItemPatch, what = 'your change'): Promise<boolean> {
  return saveItem(id, patch, () => supabase.from('items').update(patch).eq('id', id).select().maybeSingle(), what)
}

/**
 * Set (or clear, with null/'') one custom field stored in items.extra. Only that field is sent, so
 * someone else editing another field at the same moment keeps their change.
 */
export function updateExtraField(id: string, key: string, value: string | null, what?: string): Promise<boolean> {
  const item = get().items[id]
  if (!item) return Promise.resolve(false)
  const extra: ItemExtra = { ...item.extra }
  if (value === null || value === '') delete extra[key]
  else extra[key] = value
  return saveItem(
    id,
    { extra },
    () => supabase.rpc('patch_item_extra', { p_id: id, p_changes: { [key]: value || null } }),
    what ?? 'the field',
  )
}

/**
 * Add and/or remove assignees or labels. Only the change is sent, so two people assigning
 * themselves at the same moment both stay assigned.
 */
export function updateItemList(
  id: string,
  field: 'assignees' | 'labels',
  change: { add?: string[]; remove?: string[] },
  what?: string,
): Promise<boolean> {
  const item = get().items[id]
  if (!item) return Promise.resolve(false)
  const add = (change.add ?? []).map((v) => (field === 'assignees' ? v.trim().toLowerCase() : v.trim())).filter(Boolean)
  const remove = new Set((change.remove ?? []).map((v) => v.trim().toLowerCase()))
  const next = [...item[field], ...add].filter(
    (value, index, all) =>
      !remove.has(value.toLowerCase()) && all.findIndex((v) => v.toLowerCase() === value.toLowerCase()) === index,
  )
  return saveItem(
    id,
    { [field]: next },
    () => supabase.rpc('patch_item_list', { p_id: id, p_field: field, p_add: add, p_remove: [...remove] }),
    what ?? (field === 'assignees' ? 'the assignees' : 'the labels'),
  )
}

function firstStatus(): string {
  return get().options.find((o) => o.field === 'status')?.name ?? 'Todo'
}

/** Create an item. It appears immediately (number shows once the server assigns it). */
export async function createItem(input: NewItem): Promise<Item | null> {
  const id = crypto.randomUUID()
  const me = currentUsername()
  const now = new Date().toISOString()
  const title = input.title.trim()
  const optimistic: Item = {
    id,
    number: 0,
    description: '',
    status: firstStatus(),
    subteam: null,
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
    position: Date.now() / 1000,
    archived: false,
    github_item_id: null,
    github_url: null,
    created_by: me,
    updated_by: me,
    created_at: now,
    // An old timestamp so the server's version always wins.
    updated_at: '1970-01-01T00:00:00Z',
    ...input,
    title,
  }
  pendingCreates.add(id)
  setItem(id, { base: optimistic })
  beginSave(id)

  const { data, error } = await supabase
    .from('items')
    .insert({ id, ...input, title })
    .select()
    .single()

  pendingCreates.delete(id)
  if (error || !data) {
    setItem(id, { base: null, overlay: null })
    endSave(id, false)
    pushToast('error', `Couldn't create "${title}": ${error?.message ?? 'unknown error'}`)
    return null
  }
  applyServerItem(data as Item, true)
  endSave(id, true)
  return data as Item
}

/** Add a subtask (a step) under `parent`, in the parent's subteam and domain. It goes last in its list. */
export function addSubtask(parent: Item, title: string): Promise<Item | null> {
  return createItem({ title, parent_id: parent.id, subteam: parent.subteam, domain: parent.domain })
}

/** Make `item` a subtask of `parent`, move it to another parent, or (null) make it a separate task again. */
export function setParent(item: Item, parent: Item | null): Promise<boolean> {
  return updateItem(item.id, { parent_id: parent?.id ?? null }, parent ? 'the parent task' : 'making it a separate task')
}

export function archiveItem(id: string): Promise<boolean> {
  return updateItem(id, { archived: true }, 'archiving the item')
}

export function restoreItem(id: string): Promise<boolean> {
  return updateItem(id, { archived: false }, 'restoring the item')
}

/** Permanently delete an item (board admins only; everyone else archives). */
export async function deleteItem(id: string): Promise<boolean> {
  const { base, overlay } = get()
  const previousBase = base[id]
  const previousOverlay = overlay[id]
  if (!previousBase) return false
  setItem(id, { base: null, overlay: null })

  // The item's attachment rows go with it (cascade); their files are removed afterwards.
  const files = (get().attachments[id] ?? []).flatMap((a) => [a.path, a.thumb_path])
  const { data, error } = await supabase.from('items').delete().eq('id', id).select('id')
  if (error || !data || data.length === 0) {
    setItem(id, { base: previousBase, overlay: previousOverlay ?? null })
    pushToast('error', `Couldn't delete the item: ${error?.message ?? 'only board admins can delete items'}`)
    return false
  }
  if (files.length) {
    set((s) => {
      const rest = { ...s.attachments }
      delete rest[id]
      return { attachments: rest }
    })
    void supabase.storage.from('attachments').remove(files)
  }
  return true
}

// ---------------------------------------------------------------------------
// Dropdown options and board admins. Board admins manage every option; a subteam's leads manage its
// domains. The database refuses everything else. Changes arrive back through realtime, so the options
// list updates for everyone.
// ---------------------------------------------------------------------------

export type OptionPatch = Partial<Pick<FieldOption, 'name' | 'color' | 'description' | 'sort_order' | 'leads'>>

/** Options listed together: the same field (and, for domains, the same subteam). */
function siblingsOf(field: string, parentId: string | null): FieldOption[] {
  return get().options.filter((o) => o.field === field && (o.parent_id ?? null) === parentId)
}

/** Rename, recolour, describe or reorder an option. Renaming updates every item that uses it. */
export async function updateOption(id: string, patch: OptionPatch): Promise<boolean> {
  const { data, error } = await supabase.from('field_options').update(patch).eq('id', id).select()
  if (error || !data?.length) {
    pushToast('error', `Couldn't save the option: ${error?.message ?? "you're not allowed to change it, or it no longer exists"}`)
    return false
  }
  // Show the saved row straight away (realtime brings the same row a moment later), so a quick
  // second change, such as adding another subteam lead, starts from this one.
  putOption(data[0] as FieldOption)
  return true
}

/**
 * Add an option at the end of its field (a domain: at the end of its subteam's domains, `parentId` being
 * the subteam option's id). Returns the saved option, or null if it couldn't be added.
 */
export async function addOption(
  field: string,
  name: string,
  color: FieldOption['color'] = 'GRAY',
  parentId: string | null = null,
): Promise<FieldOption | null> {
  const siblings = siblingsOf(field, parentId)
  const sort_order = siblings.length ? Math.max(...siblings.map((o) => o.sort_order)) + 1 : 1
  const { data, error } = await supabase
    .from('field_options')
    .insert({ field, name: name.trim(), color, sort_order, parent_id: parentId })
    .select()
    .single()
  if (error || !data) {
    pushToast('error', `Couldn't add "${name.trim()}": ${error?.message ?? 'unknown error'}`)
    return null
  }
  putOption(data as FieldOption)
  return data as FieldOption
}

/** Delete an option. The database refuses while items still use it. */
export async function deleteOption(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('field_options').delete().eq('id', id).select('id')
  if (error || !data?.length) {
    pushToast('error', `Couldn't delete the option: ${error?.message ?? "you're not allowed to delete it, or it no longer exists"}`)
    return false
  }
  dropOption(id)
  return true
}

/** Move an option one place up (-1) or down (+1) within its field (a domain: within its subteam). */
export async function moveOption(id: string, direction: -1 | 1): Promise<void> {
  const option = get().options.find((o) => o.id === id)
  if (!option) return
  const siblings = siblingsOf(option.field, option.parent_id ?? null)
  const other = siblings[siblings.findIndex((o) => o.id === id) + direction]
  if (!other) return
  const [mine, theirs] =
    option.sort_order === other.sort_order
      ? [other.sort_order + direction * 0.5, option.sort_order]
      : [other.sort_order, option.sort_order]
  await updateOption(option.id, { sort_order: mine })
  await updateOption(other.id, { sort_order: theirs })
}

async function updateMember(username: string, patch: Partial<Pick<Member, 'full_name' | 'is_board_admin' | 'active'>>, what: string): Promise<boolean> {
  const { data, error } = await supabase.from('members').update(patch).eq('username', username).select()
  if (error || !data?.length) {
    pushToast('error', `Couldn't ${what}: ${error?.message ?? 'only board admins can do that'}`)
    return false
  }
  return true
}

/** Make a member a board admin, or remove the permission. (Unrelated to the Admin subteam.) */
export function setBoardAdmin(username: string, isBoardAdmin: boolean): Promise<boolean> {
  return updateMember(username, { is_board_admin: isBoardAdmin }, 'change board admin')
}

/** Retire a member (hidden from pickers, kept in history) or bring them back. */
export function setMemberActive(username: string, active: boolean): Promise<boolean> {
  return updateMember(username, { active }, active ? 'restore the member' : 'retire the member')
}

/** Correct a member's full name. */
export function renameMember(username: string, fullName: string): Promise<boolean> {
  return updateMember(username, { full_name: fullName }, 'rename the member')
}

/** Add a member before they've logged in (so they can be assigned straight away). */
export async function addMember(username: string, fullName: string): Promise<boolean> {
  const { error } = await supabase.from('members').insert({ username: username.trim().toLowerCase(), full_name: fullName.trim() })
  if (error) {
    pushToast('error', `Couldn't add ${username}: ${error.message}`)
    return false
  }
  return true
}

/**
 * Delete a member (board admins only, and not yourself). The database takes them off the items they're
 * assigned to and the subteams they lead (those changes arrive through realtime) and signs out their
 * devices. "Created by" and the history keep their username.
 *
 * Returns null once deleted, or why it couldn't be. Unlike the other writes it shows no toast: it is
 * used in Board settings, whose dialog would hide one, so the dialog shows the reason itself.
 */
export async function deleteMember(username: string): Promise<string | null> {
  const { data, error } = await supabase.from('members').delete().eq('username', username).select('username')
  if (error || !data?.length) return error?.message ?? 'Only board admins can delete members.'
  removeMember(username)
  return null
}

// ---------------------------------------------------------------------------
// Links between items (Jira's "is blocked by", "blocks" and "relates to"; see lib/links.ts)
// ---------------------------------------------------------------------------

function byNumberMap(): Map<number, Item> {
  return new Map(Object.values(get().items).map((other) => [other.number, other]))
}

/**
 * Link item `itemId` to item number `other` with a link of `type`. Checked against the latest board
 * first: self-links, repeats and loops are explained instead of saved. Returns whether it was saved.
 */
export function addLink(itemId: string, type: LinkType, other: number): boolean {
  const item = get().items[itemId]
  if (!item) return false
  const byNumber = byNumberMap()
  const problem = linkTypeProblem(byNumber, item, type, other)
  if (problem) {
    pushToast('info', problem)
    return false
  }
  const target = byNumber.get(other)
  if (type === 'blocked_by') {
    void updateItem(itemId, { blocked_by: withNumber(item.blocked_by, other) }, 'the link')
  } else if (type === 'blocks' && target) {
    void updateItem(target.id, { blocked_by: withNumber(target.blocked_by, item.number) }, 'the link')
  } else if (type === 'relates') {
    void updateItem(itemId, { related_to: withNumber(item.related_to, other) }, 'the link')
  }
  return true
}

/** Remove the link of `type` between item `itemId` and item number `other` (a relation from either side). */
export function removeLink(itemId: string, type: LinkType, other: number): void {
  const item = get().items[itemId]
  if (!item) return
  const target = byNumberMap().get(other)
  const without = (list: number[], number: number) => list.filter((n) => n !== number)
  if (type === 'blocked_by' && item.blocked_by.includes(other)) {
    void updateItem(itemId, { blocked_by: without(item.blocked_by, other) }, 'the link')
  } else if (type === 'blocks' && target?.blocked_by.includes(item.number)) {
    void updateItem(target.id, { blocked_by: without(target.blocked_by, item.number) }, 'the link')
  } else if (type === 'relates') {
    if (item.related_to.includes(other)) void updateItem(itemId, { related_to: without(item.related_to, other) }, 'the link')
    if (target?.related_to.includes(item.number)) {
      void updateItem(target.id, { related_to: without(target.related_to, item.number) }, 'the link')
    }
  }
}
