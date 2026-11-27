import { addDays, toDay } from '../../lib/date'

export type Visibility = 'private' | 'family'

// Rows as stored in the database (deleted_at = removed, done_at = done).
export interface Todo {
  id: string
  family_id: string
  owner_user_id: string
  visibility: Visibility
  title: string
  details: string | null
  due_date: string | null // YYYY-MM-DD
  priority: number // 0 none .. 3 high
  assignee_user_id: string | null
  done_at: string | null
  done_by: string | null
  sort: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// What the form edits (owner, ids and timestamps are set by the database).
export interface TodoValues {
  title: string
  details: string | null
  due_date: string | null
  priority: number
  assignee_user_id: string | null
  visibility: Visibility
}

export const VIEWS = ['today', 'week', 'all', 'done'] as const
export type View = (typeof VIEWS)[number]

export const PRIORITIES = [0, 1, 2, 3] as const

// Which view a to-do belongs to. Today and week include what is overdue; "done" shows what was ticked
// (the page loads the last 30 days).
export function inView(todo: Todo, view: View, today: Date): boolean {
  if (todo.deleted_at) return false
  if (view === 'done') return todo.done_at !== null
  if (todo.done_at) return false
  if (view === 'all') return true
  if (!todo.due_date) return false
  return todo.due_date <= toDay(view === 'today' ? today : addDays(today, 6))
}

// Open to-dos: due date first (none last), then priority, then oldest. Done ones: most recently ticked first.
export function compareTodos(a: Todo, b: Todo): number {
  if (a.done_at || b.done_at) return (b.done_at ?? '').localeCompare(a.done_at ?? '')
  if (a.due_date !== b.due_date) return a.due_date === null ? 1 : b.due_date === null ? -1 : a.due_date.localeCompare(b.due_date)
  return b.priority - a.priority || a.created_at.localeCompare(b.created_at)
}
