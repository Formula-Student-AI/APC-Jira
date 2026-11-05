import type { FieldOption, OptionColor } from '../types'

export function sortOptions(options: FieldOption[]): FieldOption[] {
  return [...options].sort(
    (a, b) => a.field.localeCompare(b.field) || a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
}

export function optionsFor(options: FieldOption[], field: string): FieldOption[] {
  return options.filter((o) => o.field === field)
}

export function optionColor(options: FieldOption[], field: string, name: string | null | undefined): OptionColor {
  if (!name) return 'GRAY'
  return options.find((o) => o.field === field && o.name === name)?.color ?? 'GRAY'
}

/** Usernames of a subteam's leads (set by board admins in Board settings). */
export function subteamLeads(options: FieldOption[], subteam: string | null | undefined): string[] {
  if (!subteam) return []
  return options.find((o) => o.field === 'subteam' && o.name === subteam)?.leads ?? []
}

/** CSS class that sets --opt-fg / --opt-bg / --opt-border / --opt-solid for a colour (see global.css). */
export function colorClass(color: OptionColor): string {
  return `opt-${color.toLowerCase()}`
}
