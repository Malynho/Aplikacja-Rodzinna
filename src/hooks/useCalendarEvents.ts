import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalendarEvent } from '../lib/calendar'
import { functionErrorCode } from '../lib/functionError'
import { supabase } from '../lib/supabase'

const REFRESH_MS = 5 * 60 * 1000
const MIN_GAP_MS = 60 * 1000 // returning to the tab never asks more often than this

interface State {
  events: CalendarEvent[]
  errors: { calendar_link_id: string; error: string }[]
  failed: string | null // the whole call failed (error code); older data stays on screen
  loaded: boolean // the first answer has arrived
}

// Events of all calendars the user may see in [fromMs, toMs) (read live from Google by the Edge Function).
// Refreshes when the browser tab becomes visible again and every few minutes; the previous data stays visible
// while a refresh runs, so nothing flickers.
export function useCalendarEvents(familyId: string | null, fromMs: number, toMs: number): State {
  const [state, setState] = useState<State>({ events: [], errors: [], failed: null, loaded: false })
  const lastRun = useRef(0)
  const latest = useRef(0)

  const load = useCallback(
    async (force: boolean) => {
      if (!familyId || (!force && Date.now() - lastRun.current < MIN_GAP_MS)) return
      lastRun.current = Date.now()
      const mine = ++latest.current
      const { data, error } = await supabase.functions.invoke('calendar', {
        body: { action: 'events', family_id: familyId, from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
      })
      if (mine !== latest.current) return // a newer request is on its way
      if (error) {
        const code = await functionErrorCode(error, 'function_error')
        setState((s) => ({ ...s, failed: code, loaded: true }))
      } else {
        setState({ events: data?.events ?? [], errors: data?.errors ?? [], failed: null, loaded: true })
      }
    },
    [familyId, fromMs, toMs],
  )

  useEffect(() => {
    load(true) // first load and every change of the range
    const onVisible = () => document.visibilityState === 'visible' && load(false)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => load(true), REFRESH_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [load])

  return state
}
