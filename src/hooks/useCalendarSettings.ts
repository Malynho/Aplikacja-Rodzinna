import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNames } from './useNames'

export interface CalendarLink {
  id: string
  label: string
  owner_user_id: string // whose Google token reads it
  shared: boolean // the family calendar, registered by an admin
}

export interface CalendarGroup {
  key: string // 'shared', 'mine' or the owner's user id
  label: string | null // null = translated by the caller (shared / mine)
  links: CalendarLink[]
  on: boolean
}

// The calendars this user may see, which of them are switched on (saved in the profile, so phone and computer
// agree) and a color per calendar. Default without a saved choice: shared + own calendars.
export function useCalendarSettings(familyId: string, userId: string) {
  const [links, setLinks] = useState<CalendarLink[]>([])
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('calendar_links').select('id, label, owner_user_id, shared').eq('family_id', familyId),
      supabase.from('profiles').select('calendar_filter').eq('id', userId).maybeSingle(),
    ]).then(([l, p]) => {
      if (cancelled) return
      const rows = (l.data ?? []) as CalendarLink[]
      const saved = Array.isArray(p.data?.calendar_filter) ? new Set<string>(p.data.calendar_filter) : null
      setLinks(rows)
      setEnabled(new Set(rows.filter((r) => (saved ? saved.has(r.id) : r.shared || r.owner_user_id === userId)).map((r) => r.id)))
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [familyId, userId])

  const owners = [...new Set(links.filter((l) => !l.shared).map((l) => l.owner_user_id))].sort()
  const names = useNames(owners.filter((o) => o !== userId))

  const groups = useMemo<CalendarGroup[]>(() => {
    const keyOf = (l: CalendarLink) => (l.shared ? 'shared' : l.owner_user_id === userId ? 'mine' : l.owner_user_id)
    const map = new Map<string, CalendarLink[]>()
    for (const l of links) map.set(keyOf(l), [...(map.get(keyOf(l)) ?? []), l])
    const order = (k: string) => (k === 'shared' ? 0 : k === 'mine' ? 1 : 2)
    return [...map.entries()]
      .sort(([a], [b]) => order(a) - order(b) || (names.get(a) ?? '').localeCompare(names.get(b) ?? ''))
      .map(([key, ls]) => ({
        key,
        label: key === 'shared' || key === 'mine' ? null : names.get(key) || '?',
        links: ls,
        on: ls.every((l) => enabled.has(l.id)),
      }))
  }, [links, enabled, names, userId])

  function toggle(group: CalendarGroup) {
    const next = new Set(enabled)
    for (const l of group.links) {
      if (group.on) next.delete(l.id)
      else next.add(l.id)
    }
    setEnabled(next)
    supabase.from('profiles').update({ calendar_filter: [...next] }).eq('id', userId).then()
  }

  // Color of a calendar: shared = accent, people = the person tokens in the order of their ids.
  const colorOf = (linkId: string) => {
    const link = links.find((l) => l.id === linkId)
    return link && !link.shared ? `var(--person-${(owners.indexOf(link.owner_user_id) % 3) + 1}-text)` : 'var(--accent)'
  }

  return {
    loaded,
    links,
    groups,
    toggle,
    colorOf,
    isOn: (linkId: string) => enabled.has(linkId),
    labelOf: (linkId: string) => links.find((l) => l.id === linkId)?.label ?? '',
  }
}

export type CalendarSettings = ReturnType<typeof useCalendarSettings>
