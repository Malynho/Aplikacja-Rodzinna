import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { functionErrorCode } from '../lib/functionError'
import { supabase } from '../lib/supabase'

// Scopes requested by "Connect calendar" (the function checks the same list): reading AND writing events,
// so stage 4c (adding events) needs no further consent.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ')

// Set right before the redirect to Google (value = the user id): only a return from that flow may send a token.
const MARKER = 'calendar:connecting'

export interface Connection {
  connected: boolean
  needs_reconnect: boolean
}

// The person's own Google connection: status, connect (OAuth with consent), disconnect.
// The refresh token comes back from Google only in the session right after the redirect; it is sent once to the
// Edge Function (which encrypts it) and only when this browser started the connect flow for THIS user.
export function useCalendarConnection(familyId: string) {
  const { user, signOut } = useAuth()
  const [status, setStatus] = useState<Connection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const refresh = useCallback(async () => {
    const { data, error: err } = await supabase.functions.invoke('calendar', { body: { action: 'status', family_id: familyId } })
    if (err) {
      setError(await functionErrorCode(err, 'function_error'))
      setStatus(null)
    } else {
      setStatus(data as Connection)
    }
  }, [familyId])

  useEffect(() => {
    async function afterReturn() {
      const marker = sessionStorage.getItem(MARKER)
      if (marker) {
        sessionStorage.removeItem(MARKER) // used up: never sent twice
        const { data } = await supabase.auth.getSession()
        const token = data.session?.provider_refresh_token
        if (data.session && token) {
          if (data.session.user.id !== marker) {
            setError('wrong_account') // signed in with another Google account: nothing is saved
          } else {
            const { data: result, error: err } = await supabase.functions.invoke('calendar', {
              body: { action: 'save_token', family_id: familyId, refresh_token: token },
            })
            if (err) setError(await functionErrorCode(err, 'function_error'))
            else if (result?.ok === false) setError(result.error)
            else setSaved(true)
          }
        }
      }
      await refresh()
    }
    afterReturn()
  }, [familyId, refresh])

  async function connect() {
    if (!user) return
    sessionStorage.setItem(MARKER, user.id)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/settings`,
        scopes: SCOPES,
        queryParams: { access_type: 'offline', prompt: 'consent', ...(user.email ? { login_hint: user.email } : {}) },
      },
    })
  }

  async function disconnect() {
    const { error: err } = await supabase.functions.invoke('calendar', { body: { action: 'disconnect', family_id: familyId } })
    setError(err ? await functionErrorCode(err, 'function_error') : null)
    setSaved(false)
    await refresh()
    return !err
  }

  return { status, error, saved, connect, disconnect, signOut, refresh }
}
