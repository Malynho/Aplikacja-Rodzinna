import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNames } from './useNames'

export interface CalendarLink {
  id: string
  label: string
  owner_user_id: string // whose Google token reads it
  shared: boolean // the family calendar, registered by an admin
  visibility: 'private' | 'family'
  access_role: string | null // role of the person who registered it
}

export interface CalendarChip {
  id: string
  text: string // calendar name, plus the owner's name for other people's calendars
  on: boolean
}

// The calendars this user may see (own ones and everything visible to the family), which of them are switched
// off (saved in the profile as a list of ids, so phone and computer agree; nothing saved = all on, so a newly
// added calendar appears by itself) and a color per calendar.
export function useCalendarSettings(familyId: string, userId: string) {
  const [links, setLinks] = useState<CalendarLink[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('calendar_links').select('id, label, owner_user_id, shared, visibility, access_role').eq('family_id', familyId),
      supabase.from('profiles').select('calendar_filter').eq('id', userId).maybeSingle(),
    ]).then(([l, p]) => {
      if (cancelled) return
      setLinks((l.data ?? []) as CalendarLink[])
      setHidden(new Set<string>(Array.isArray(p.data?.calendar_filter) ? p.data.calendar_filter : []))
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [familyId, userId])

  const owners = [...new Set(links.filter((l) => !l.shared).map((l) => l.owner_user_id))].sort()
  const names = useNames(owners.filter((o) => o !== userId))

  const textOf = (l: CalendarLink) =>
    l.shared || l.owner_user_id === userId ? l.label : `${l.label} · ${names.get(l.owner_user_id) || '?'}`
  // shared first, then own, then other people's
  const rank = (l: CalendarLink) => (l.shared ? 0 : l.owner_user_id === userId ? 1 : 2)
  const chips: CalendarChip[] = [...links]
    .sort((a, b) => rank(a) - rank(b) || textOf(a).localeCompare(textOf(b)))
    .map((l) => ({ id: l.id, text: textOf(l), on: !hidden.has(l.id) }))

  function toggle(id: string) {
    const next = new Set(hidden)
    if (!next.delete(id)) next.add(id)
    setHidden(next)
    const known = new Set(links.map((l) => l.id))
    supabase
      .from('profiles')
      .update({ calendar_filter: [...next].filter((x) => known.has(x)) })
      .eq('id', userId)
      .then()
  }

  // Color of a calendar: shared = accent, people = the person tokens in the order of their ids.
  const colorOf = (linkId: string) => {
    const link = links.find((l) => l.id === linkId)
    return link && !link.shared ? `var(--person-${(owners.indexOf(link.owner_user_id) % 3) + 1}-text)` : 'var(--accent)'
  }

  // Where a new event can go: the family calendar, or the person's own PRIVATE calendar with write access.
  // (The function checks the real rights in Google again.)
  const writeTargets = {
    everyone: links.filter((l) => l.shared),
    mine: links.filter(
      (l) => !l.shared && l.owner_user_id === userId && l.visibility === 'private' && (l.access_role === 'owner' || l.access_role === 'writer'),
    ),
  }

  return {
    loaded,
    links,
    writeTargets,
    chips,
    toggle,
    colorOf,
    hasOwn: links.some((l) => l.owner_user_id === userId && !l.shared),
    isOn: (linkId: string) => !hidden.has(linkId),
    labelOf: (linkId: string) => links.find((l) => l.id === linkId)?.label ?? '',
    textOf: (linkId: string) => {
      const link = links.find((l) => l.id === linkId)
      return link ? textOf(link) : ''
    },
  }
}

export type CalendarSettings = ReturnType<typeof useCalendarSettings>
