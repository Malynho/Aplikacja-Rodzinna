import { addDays, toDay } from './date'

// One event as returned by the Edge Function "calendar" (no description, attendees or e-mail addresses).
export interface CalendarEvent {
  id: string
  calendar_link_id: string
  title: string | null // null = private event of someone else (shown as "Private")
  start: string // all-day: YYYY-MM-DD, otherwise an ISO date-time
  end: string // all-day: the end date is exclusive (as in Google)
  all_day: boolean
  location: string | null
  private: boolean
}

const DAY_MS = 86_400_000
const parseDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

export const startOf = (e: CalendarEvent) => (e.all_day ? parseDay(e.start) : new Date(e.start))
export const endOf = (e: CalendarEvent) => (e.all_day ? parseDay(e.end) : new Date(e.end))

// Calendar days (YYYY-MM-DD) an event touches; one that ends exactly at midnight does not touch the next day.
export function daysOf(e: CalendarEvent): string[] {
  const start = startOf(e)
  const end = endOf(e)
  const first = midnight(start)
  let last = midnight(end)
  if (end > start && end.getTime() === last.getTime()) last = addDays(last, -1)
  if (last < first) last = first
  const days: string[] = []
  for (let d = first; d <= last && days.length < 62; d = addDays(d, 1)) days.push(toDay(d))
  return days
}

// Events that are not over yet, nearest first (an event in progress counts). An all-day event that has already
// started ranks after today's timed events, so a meeting in an hour is not hidden behind a birthday.
export function upcoming(events: CalendarEvent[], now: Date): CalendarEvent[] {
  const endOfToday = midnight(now).getTime() + DAY_MS - 1
  const rank = (e: CalendarEvent) => (e.all_day && startOf(e) <= now ? endOfToday : startOf(e).getTime())
  return events.filter((e) => endOf(e) > now).sort((a, b) => rank(a) - rank(b))
}

// When an event happens, relative to now (rendered by the translation files).
export type When =
  | { kind: 'now' | 'today' | 'tomorrow' }
  | { kind: 'in'; hours: number; minutes: number }
  | { kind: 'days'; days: number }

export function whenOf(e: CalendarEvent, now: Date): When {
  const start = startOf(e)
  const daysAway = Math.round((midnight(start).getTime() - midnight(now).getTime()) / DAY_MS)
  if (e.all_day) {
    return daysAway <= 0 ? { kind: 'today' } : daysAway === 1 ? { kind: 'tomorrow' } : { kind: 'days', days: daysAway }
  }
  if (start <= now) return { kind: 'now' }
  const minutes = Math.ceil((start.getTime() - now.getTime()) / 60_000)
  if (minutes < 24 * 60) return { kind: 'in', hours: Math.floor(minutes / 60), minutes: minutes % 60 }
  return daysAway === 1 ? { kind: 'tomorrow' } : { kind: 'days', days: daysAway }
}
