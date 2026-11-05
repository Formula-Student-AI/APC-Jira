// Rows as stored in Supabase (see supabase/schema.sql).

export type OptionColor = 'GRAY' | 'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'PINK' | 'PURPLE'

export interface Member {
  username: string
  full_name: string
  email: string
  github_login: string | null
  /** Permission to manage the board. Unrelated to the "Admin" subteam. */
  is_board_admin: boolean
  /** Retired members (false) are hidden from pickers but kept for history. */
  active: boolean
  created_at: string
}

export interface FieldOption {
  id: string
  /** Field key: status, subteam, priority, domain, difficulty, size, task_force, safety_related */
  field: string
  name: string
  color: OptionColor
  description: string | null
  sort_order: number
  created_at: string
}

/** Custom fields stored in items.extra (keys are field keys from fields.ts). */
export interface ItemExtra {
  [key: string]: string | undefined
}

export interface Item {
  id: string
  number: number
  title: string
  /** Markdown */
  description: string
  status: string
  subteam: string | null
  /** Member usernames */
  assignees: string[]
  legacy_assignees: string[]
  labels: string[]
  /** 'YYYY-MM-DD' */
  start_date: string | null
  /** 'YYYY-MM-DD' */
  due_date: string | null
  blocked_reason: string | null
  /** Numbers of the items this one waits on */
  blocked_by: number[]
  extra: ItemExtra
  /** Order within a board column (ascending) */
  position: number
  archived: boolean
  github_item_id: string | null
  github_url: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/** Columns the app may change. The database sets everything else (number, who, when). */
export type ItemPatch = Partial<
  Pick<
    Item,
    | 'title'
    | 'description'
    | 'status'
    | 'subteam'
    | 'assignees'
    | 'labels'
    | 'start_date'
    | 'due_date'
    | 'blocked_reason'
    | 'blocked_by'
    | 'extra'
    | 'position'
    | 'archived'
  >
>

export type NewItem = { title: string } & ItemPatch

export type ActivityAction = 'created' | 'updated' | 'archived' | 'restored' | 'deleted'

export interface Activity {
  id: number
  item_id: string
  item_number: number | null
  /** null when changed by a script or the SQL editor */
  username: string | null
  action: ActivityAction
  /** Changed fields: column names, or custom field keys from extra */
  changes: Record<string, { old: unknown; new: unknown }>
  created_at: string
}
