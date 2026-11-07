import type { FieldOption, Item, ItemPatch, Member, OptionColor } from '../types'

export function sortOptions(options: FieldOption[]): FieldOption[] {
  return [...options].sort(
    (a, b) => a.field.localeCompare(b.field) || a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
}

export function optionsFor(options: FieldOption[], field: string): FieldOption[] {
  return options.filter((o) => o.field === field)
}

/** An option's colour. Not for domains: two subteams can have a domain of the same name (use findDomain). */
export function optionColor(options: FieldOption[], field: string, name: string | null | undefined): OptionColor {
  if (!name) return 'GRAY'
  return options.find((o) => o.field === field && o.name === name)?.color ?? 'GRAY'
}

/** The subteam option called `name`, if there is one. */
export function subteamOption(options: FieldOption[], name: string | null | undefined): FieldOption | undefined {
  if (!name) return undefined
  return options.find((o) => o.field === 'subteam' && o.name === name)
}

/** Usernames of a subteam's leads (set by board admins in Board settings). */
export function subteamLeads(options: FieldOption[], subteam: string | null | undefined): string[] {
  return subteamOption(options, subteam)?.leads ?? []
}

/** A subteam's domains, in order (none when there is no subteam). */
export function domainsOf(options: FieldOption[], subteam: string | null | undefined): FieldOption[] {
  const parent = subteamOption(options, subteam)
  return parent ? options.filter((o) => o.field === 'domain' && o.parent_id === parent.id) : []
}

/** The domain called `name` in that subteam, if it has one. */
export function findDomain(
  options: FieldOption[],
  subteam: string | null | undefined,
  name: string | null | undefined,
): FieldOption | undefined {
  if (!name) return undefined
  return domainsOf(options, subteam).find((o) => o.name === name)
}

/**
 * What to save when an item moves to `subteam`. As the database does, the item's domain is cleared unless
 * the new subteam has a domain of the same name.
 */
export function subteamChange(options: FieldOption[], item: Pick<Item, 'domain'>, subteam: string | null): ItemPatch {
  return item.domain && !findDomain(options, subteam, item.domain) ? { subteam, domain: null } : { subteam }
}

/** What this session may do (see AuthState). */
export interface Access {
  adminActive: boolean
  sessionTrusted: boolean
}

/**
 * May this member add, rename, reorder and delete the subteam's domains? Board admins may for every
 * subteam; a subteam's leads for theirs. Lead powers need a trusted session, like board-admin powers.
 */
export function canManageDomains(
  subteam: FieldOption | undefined,
  me: Pick<Member, 'username' | 'active'> | null,
  access: Access,
): boolean {
  if (!subteam || subteam.field !== 'subteam') return false
  if (access.adminActive) return true
  return access.sessionTrusted && !!me && me.active && subteam.leads.includes(me.username)
}

const DOMAIN_COLORS: OptionColor[] = ['BLUE', 'GREEN', 'PURPLE', 'ORANGE', 'PINK', 'YELLOW', 'RED', 'GRAY']

/**
 * A colour for a subteam's next domain: the first one its domains don't use yet. Never the subteam's own
 * colour, since a card shows its domain's tag right beside its subteam's.
 */
export function nextDomainColor(domains: FieldOption[], subteamColor: OptionColor): OptionColor {
  const used = new Set(domains.map((d) => d.color))
  const colors = DOMAIN_COLORS.filter((color) => color !== subteamColor)
  return colors.find((color) => !used.has(color)) ?? colors[domains.length % colors.length]
}

/** CSS class that sets --opt-fg / --opt-bg / --opt-border / --opt-solid for a colour (see global.css). */
export function colorClass(color: OptionColor): string {
  return `opt-${color.toLowerCase()}`
}
