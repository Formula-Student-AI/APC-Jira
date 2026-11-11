// App settings, read from VITE_* variables at build time (see .env.example).

export const APP_NAME = 'Bristol FSAI Board'
export const ORG_NAME = 'Bristol FSAI'
/** The society's full name, for documents read outside the team (the Timeline export). */
export const ORG_LONG_NAME = 'Bristol Formula Student AI'
export const PLAN_LABEL = '2026–27 Plan'
/** The plan year, whole days inclusive. The Timeline always shows it; update all three for 2027–28. */
export const PLAN_START = '2026-09-01'
export const PLAN_END = '2027-08-31'
/**
 * The subteam that stands for the whole team (it is a section of its own only for convenience). On the
 * Timeline its milestones and phases run across every subteam, as the whole team's do; any other
 * subteam's stay in its own section. Matched whatever its case: update it if the subteam is renamed.
 */
export const WHOLE_TEAM_SUBTEAM = 'Admin'
export const EMAIL_DOMAIN = 'bristol.ac.uk'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

const DEFAULT_USERNAME_PATTERN = '^[a-z]{2}[0-9]{5}$'

function compilePattern(source: string | undefined): RegExp {
  try {
    return new RegExp(source || DEFAULT_USERNAME_PATTERN)
  } catch {
    return new RegExp(DEFAULT_USERNAME_PATTERN)
  }
}

/** University usernames such as xy12345. Must match public.username_pattern() in the database. */
export const USERNAME_PATTERN = compilePattern(import.meta.env.VITE_USERNAME_PATTERN)

export type AuthMode = 'trust' | 'email_code'

/** 'trust' = username only (default). 'email_code' = 6-digit code emailed to username@bristol.ac.uk. */
export const AUTH_MODE: AuthMode = import.meta.env.VITE_AUTH_MODE === 'email_code' ? 'email_code' : 'trust'

/** Set when the build is missing its Supabase settings, so the app can explain instead of crashing. */
export const CONFIG_ERROR =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'This build has no Supabase settings. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README).'
    : null

export function emailFor(username: string): string {
  return `${username}@${EMAIL_DOMAIN}`
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/@.*$/, '')
}
