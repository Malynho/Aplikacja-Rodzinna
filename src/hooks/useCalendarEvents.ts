import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalendarEvent } from '../lib/calendar'
import { functionErrorCode } from '../lib/functionError'
import { supabase } from '../lib/supabase'

const POLL_MS = 45_000 // while the tab is visible
const FOCUS_GAP_MS = 2_000 // returning to the tab refreshes at once, but not twice within this time

interface State {
  events: CalendarEvent[]
  errors: { calendar_link_id: string; error: string }[]
  failed: string | null // the whole call failed (error code); older data stays on screen
  loaded: boolean // the first answer has arrived
  updatedAt: number | null // when the last successful answer arrived
}

// Events of all calendars the user may see in [fromMs, toMs) (read live from Google by the Edge Function).
// Refreshes every 45 s while the tab is visible, at once when the tab becomes visible or focused again, and when
// refreshKey changes (the caller bumps it after its own create / update / delete). The previous data stays visible
// while a refresh runs, so nothing flickers.
export function useCalendarEvents(familyId: string | null, fromMs: number, toMs: number, refreshKey = 0): State {
  const [state, setState] = useState<State>({ events: [], errors: [], failed: null, loaded: false, updatedAt: null })
  const lastRun = useRef(0)
  const latest = useRef(0)

  const load = useCallback(
    async (minGapMs: number) => {
      if (!familyId || Date.now() - lastRun.current < minGapMs) return
      lastRun.current = Date.now()
      const mine = ++latest.current
      const { data, error } = await supabase.functions.invoke('calendar', {
        body: { action: 'events', family_id: familyId, from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
      })
      if (mine !== latest.current) return // a newer request is on its way
      if (error) {
        const code = await functionErrorCode(error, 'function_error')
        if (code === 'limit_reached') return // too many requests for now: keep what is shown, try again later
        setState((s) => ({ ...s, failed: code, loaded: true }))
      } else {
        setState({ events: data?.events ?? [], errors: data?.errors ?? [], failed: null, loaded: true, updatedAt: Date.now() })
      }
    },
    [familyId, fromMs, toMs],
  )

  useEffect(() => {
    load(0) // first load, a new range, or an own change (refreshKey)
  }, [load, refreshKey])

  useEffect(() => {
    const visible = () => document.visibilityState === 'visible'
    const soon = () => visible() && load(FOCUS_GAP_MS)
    const timer = window.setInterval(() => visible() && load(POLL_MS / 2), POLL_MS)
    document.addEventListener('visibilitychange', soon)
    window.addEventListener('focus', soon)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', soon)
      window.removeEventListener('focus', soon)
    }
  }, [load])

  return state
}
