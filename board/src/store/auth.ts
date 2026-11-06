// Login. No passwords: a device signs in to Supabase (anonymously in "trust" mode, or with an emailed
// 6-digit code in "email_code" mode) and then claims a member by university username. The database
// links that session to the member (claim_member), so every change is attributed server-side.

import { create } from 'zustand'
import { AUTH_MODE, emailFor, normalizeUsername, USERNAME_PATTERN } from '../config'
import { errorMessage } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Member } from '../types'

export type AuthPhase = 'checking' | 'signed_out' | 'signed_in'

export interface AuthState {
  phase: AuthPhase
  member: Member | null
  /**
   * Board-admin powers the database will actually honour for this session. A board admin signed in by
   * username only gets them only when the board owner allows it (board_settings.trust_mode_admins).
   */
  adminActive: boolean
  /**
   * May this session use board-admin and subteam-lead powers at all (a verified sign-in, or the board
   * owner allows username-only ones)? Subteam leads look after their subteam's domains only when it is.
   */
  sessionTrusted: boolean
  /** Problem reaching Supabase during start-up (shown on the login screen) */
  error: string | null
}

export const useAuth = create<AuthState>(() => ({
  phase: 'checking',
  member: null,
  adminActive: false,
  sessionTrusted: false,
  error: null,
}))

const set = useAuth.setState

export function currentUsername(): string | null {
  return useAuth.getState().member?.username ?? null
}

interface SessionInfo {
  member: Member
  board_admin_active: boolean
  session_trusted?: boolean
}

function signedIn(info: SessionInfo): Partial<AuthState> {
  return {
    phase: 'signed_in',
    member: info.member,
    adminActive: info.board_admin_active,
    sessionTrusted: info.session_trusted ?? info.board_admin_active,
    error: null,
  }
}

const signedOut: Partial<AuthState> = { phase: 'signed_out', member: null, adminActive: false, sessionTrusted: false }

export class LoginError extends Error {}

/** Lowercase, strip any "@bristol.ac.uk" and check the pattern. Throws LoginError if invalid. */
export function validateUsername(input: string): string {
  const username = normalizeUsername(input)
  if (!USERNAME_PATTERN.test(username)) {
    throw new LoginError('Enter your university username, e.g. xy12345.')
  }
  return username
}

let listening = false
let lastFocusCheck = 0

function listenForOtherTabs(): void {
  if (listening) return
  listening = true
  // Another tab signed out ("Switch user"): this tab follows.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && useAuth.getState().phase === 'signed_in') set({ ...signedOut, error: null })
  })
  // Coming back to the tab: make sure this device is still logged in as the same member.
  window.addEventListener('focus', () => {
    if (useAuth.getState().phase !== 'signed_in' || Date.now() - lastFocusCheck < 30_000) return
    lastFocusCheck = Date.now()
    void refreshSession()
  })
}

/** On start-up: is this device already signed in as a member? */
export async function bootstrapAuth(): Promise<void> {
  listenForOtherTabs()
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      set({ ...signedOut, error: null })
      return
    }
    const { data: info, error } = await supabase.rpc('whoami')
    if (error) throw error
    set(info ? signedIn(info as SessionInfo) : { ...signedOut, error: null })
  } catch (error) {
    set({ ...signedOut, error: `Couldn't reach the board: ${errorMessage(error)}` })
  }
}

/**
 * Re-read who this device is logged in as (e.g. after the member row changed, or when the tab regains
 * focus). If another tab switched user, this tab shows the new member or goes back to the login screen.
 */
export async function refreshSession(): Promise<void> {
  const { data: info, error } = await supabase.rpc('whoami')
  if (error) return // offline: keep the current state
  if (!info) {
    set({ ...signedOut, error: null })
    return
  }
  set(signedIn(info as SessionInfo))
}

export type ClaimResult = { status: 'ok'; member: Member } | { status: 'needs_name' }

/**
 * Log in as `username`. Signs the device in anonymously first if needed (trust mode).
 * Returns needs_name for a new member: call again with their full name.
 */
export async function claimMember(usernameInput: string, fullName?: string): Promise<ClaimResult> {
  const username = validateUsername(usernameInput)
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    if (AUTH_MODE === 'email_code') throw new LoginError('Enter the code from your email first.')
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw new LoginError(`Couldn't start a session: ${error.message}`)
  }
  const name = fullName?.trim().replace(/\s+/g, ' ')
  const { data, error } = await supabase.rpc('claim_member', { p_username: username, p_full_name: name || null })
  if (error) throw new LoginError(error.message)
  const result = data as ({ status: 'ok' } & SessionInfo) | { status: 'needs_name'; username: string }
  if (result.status === 'needs_name') return { status: 'needs_name' }
  set(signedIn(result))
  return { status: 'ok', member: result.member }
}

/** email_code mode: send a 6-digit code to username@bristol.ac.uk. */
export async function sendEmailCode(usernameInput: string): Promise<void> {
  const username = validateUsername(usernameInput)
  // A session for a different address must not be reused.
  const { data } = await supabase.auth.getSession()
  if (data.session) await supabase.auth.signOut({ scope: 'local' })
  const { error } = await supabase.auth.signInWithOtp({ email: emailFor(username), options: { shouldCreateUser: true } })
  if (error) throw new LoginError(`Couldn't send the code: ${error.message}`)
}

/** email_code mode: check the code; on success the device has a session for that email address. */
export async function verifyEmailCode(usernameInput: string, code: string): Promise<void> {
  const username = validateUsername(usernameInput)
  const token = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(token)) throw new LoginError('Enter the 6-digit code from the email.')
  const { error } = await supabase.auth.verifyOtp({ email: emailFor(username), token, type: 'email' })
  if (error) throw new LoginError(`That code didn't work: ${error.message}`)
}

/**
 * "Switch user": unlink this device from the member and go back to the login screen. The session is
 * signed out too, so the next person starts fresh (the database lets each session register only one
 * new member). Other open tabs follow automatically.
 */
export async function switchUser(): Promise<void> {
  try {
    await supabase.rpc('release_member')
  } catch {
    // Offline or already unlinked: signing out below is enough.
  } finally {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    set({ ...signedOut, error: null })
  }
}

/** Correct your own full name. */
export async function setMyName(fullName: string): Promise<void> {
  const { data, error } = await supabase.rpc('set_my_name', { p_full_name: fullName })
  if (error) throw new LoginError(error.message)
  set({ member: data as Member })
}

export function errorText(error: unknown): string {
  return error instanceof LoginError ? error.message : `Something went wrong: ${errorMessage(error)}`
}
