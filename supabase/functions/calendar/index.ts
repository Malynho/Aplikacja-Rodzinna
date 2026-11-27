// Edge Function: Google Calendar through the family members' own Google sign-in (OAuth), read-only for now.
// Each person's refresh token is stored ENCRYPTED in google_tokens (no client access). Events are never stored.
// Which calendars a person may read is decided HERE and by RLS, never by the client; the user id always comes
// from the verified JWT (getUser), never from the request body.
// Secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CALENDAR_TOKEN_KEY) are set in Supabase, never in the repo,
// and neither they nor any token are ever logged or returned.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2'

const CHECKS_PER_HOUR = Number(Deno.env.get('CALENDAR_CHECKS_PER_HOUR')) || 20
const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ??
  'https://aplikacja-rodzinna.malynho.workers.dev,http://localhost:5173,http://localhost:5174'
)
  .split(',')
  .map((o) => o.trim())

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/calendar/v3'
// Granted by "Connect calendar". Writing events (stage 4c) needs no further consent.
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000
const MAX_CALENDARS = 10
const MAX_EVENTS = 250
const CACHE_MS = 15_000
const WRITES_PER_HOUR = Number(Deno.env.get('CALENDAR_WRITES_PER_HOUR')) || 60
const EVENT_READS_PER_MINUTE = Number(Deno.env.get('CALENDAR_READS_PER_MINUTE')) || 20
const TIME_ZONE = 'Europe/Berlin'
const MAX_SPAN_MS = 366 * 24 * 60 * 60 * 1000
const MAX_REMINDERS = 5
const MAX_REMINDER_MINUTES = 40320
const DAY = /^\d{4}-\d{2}-\d{2}$/
const NEW_EVENT_ID = /^[a-v0-9]{5,100}$/ // the characters Google accepts in a client-chosen event id
const EVENT_ID = /^[\w-]{5,1024}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------- Encryption of refresh tokens (AES-256-GCM, key from the secret CALENDAR_TOKEN_KEY) ----------

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

async function encryptionKey(): Promise<CryptoKey | null> {
  try {
    const raw = fromBase64(Deno.env.get('CALENDAR_TOKEN_KEY') ?? '')
    if (raw.length !== 32) return null
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  } catch {
    return null
  }
}

async function encrypt(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)))
  return toBase64(new Uint8Array([...iv, ...data]))
}

async function decrypt(key: CryptoKey, encoded: string): Promise<string> {
  const bytes = fromBase64(encoded)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
  return new TextDecoder().decode(plain)
}

// ---------- The only two places that use the service role (table google_tokens) ----------

const privileged = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

// 1) Reads the stored token of the OWNER of a link (callers have already checked that the caller may read that link).
async function readOwnerToken(ownerId: string): Promise<{ enc: string; status: string } | null> {
  const { data } = await privileged()
    .from('google_tokens')
    .select('refresh_token_enc, status')
    .eq('user_id', ownerId)
    .maybeSingle()
  return data ? { enc: data.refresh_token_enc, status: data.status } : null
}

// 2) Writes the caller's OWN token row: save (upsert), mark revoked, or delete.
async function writeOwnToken(
  uid: string,
  change: { save: { enc: string; scopes: string } } | { status: 'revoked' } | { remove: true },
): Promise<boolean> {
  const table = privileged().from('google_tokens')
  const now = new Date().toISOString()
  const { error } =
    'save' in change
      ? await table.upsert({
          user_id: uid,
          refresh_token_enc: change.save.enc,
          scopes: change.save.scopes,
          status: 'ok',
          updated_at: now,
          connected_at: now,
        })
      : 'status' in change
        ? await table.update({ status: 'revoked', updated_at: now }).eq('user_id', uid)
        : await table.delete().eq('user_id', uid)
  return !error
}

// ---------- Google: access tokens ----------

type Exchange =
  | { ok: true; accessToken: string; expiresIn: number; scope: string }
  | { ok: false; error: 'invalid_grant' | 'upstream_error' }

async function exchangeRefreshToken(refreshToken: string): Promise<Exchange> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      }),
    })
    const body = await res.json().catch(() => null)
    if (res.ok && body?.access_token) {
      return { ok: true, accessToken: body.access_token, expiresIn: body.expires_in ?? 3600, scope: String(body.scope ?? '') }
    }
    return { ok: false, error: body?.error === 'invalid_grant' ? 'invalid_grant' : 'upstream_error' }
  } catch {
    return { ok: false, error: 'upstream_error' }
  }
}

// Access tokens are kept in memory until shortly before they expire (never stored).
const accessTokens = new Map<string, { value: string; expires: number }>()

type TokenResult = { ok: true; token: string } | { ok: false; error: 'not_connected' | 'revoked' | 'upstream_error' }

// ownToken: the token belongs to the caller; only then may a failed exchange mark it as revoked.
async function accessTokenOf(userId: string, key: CryptoKey, ownToken: boolean): Promise<TokenResult> {
  const cached = accessTokens.get(userId)
  if (cached && cached.expires - Date.now() > 60_000) return { ok: true, token: cached.value }
  const row = await readOwnerToken(userId)
  if (!row) return { ok: false, error: 'not_connected' }
  if (row.status === 'revoked') return { ok: false, error: 'revoked' }
  let refreshToken: string
  try {
    refreshToken = await decrypt(key, row.enc)
  } catch {
    return { ok: false, error: 'upstream_error' }
  }
  const result = await exchangeRefreshToken(refreshToken)
  if (!result.ok) {
    if (result.error === 'invalid_grant') {
      accessTokens.delete(userId)
      if (ownToken) await writeOwnToken(userId, { status: 'revoked' })
      return { ok: false, error: 'revoked' }
    }
    return { ok: false, error: 'upstream_error' }
  }
  accessTokens.set(userId, { value: result.accessToken, expires: Date.now() + result.expiresIn * 1000 })
  return { ok: true, token: result.accessToken }
}

// ---------- Google Calendar ----------

interface RawEvent {
  id: string
  summary?: string
  location?: string
  visibility?: string
  status?: string
  etag?: string
  recurringEventId?: string
  recurrence?: string[]
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

interface EventOut {
  id: string
  calendar_link_id: string
  title: string | null
  start: string
  end: string
  all_day: boolean
  location: string | null
  private: boolean
  etag: string // for safe edits (If-Match)
  recurring: boolean // recurring events are read-only here ("edit in Google")
  editable: boolean // a hint for the UI; the write actions check everything again
}

interface LinkRow {
  id: string
  google_calendar_id: string
  owner_user_id: string
  shared: boolean
  access_role: string | null
  visibility: string
}

type CallError = 'missing_scope' | 'not_found' | 'not_writable' | 'conflict' | 'changed' | 'bad_request' | 'upstream_error'
type Outcome<T> = { ok: true; data: T } | { ok: false; error: CallError }

async function googleGet<T>(token: string, url: URL): Promise<Outcome<T>> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) return { ok: true, data: (await res.json()) as T }
    const reason = (await res.json().catch(() => null))?.error?.errors?.[0]?.reason as string | undefined
    if (res.status === 404) return { ok: false, error: 'not_found' }
    if (res.status === 403 && reason === 'insufficientPermissions') return { ok: false, error: 'missing_scope' }
    return { ok: false, error: 'upstream_error' }
  } catch {
    return { ok: false, error: 'upstream_error' }
  }
}

// Short cache of Google's raw answer per owner, calendar and range (privacy masking is applied per person afterwards).
const cache = new Map<string, { at: number; value: Outcome<RawEvent[]> }>()

async function listEvents(token: string, ownerId: string, calendarId: string, from: string, to: string): Promise<Outcome<RawEvent[]>> {
  const cacheKey = [ownerId, calendarId, from, to].join('|')
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const url = new URL(`${API}/calendars/${encodeURIComponent(calendarId)}/events`)
  url.search = new URLSearchParams({
    timeMin: from,
    timeMax: to,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(MAX_EVENTS),
    timeZone: 'Europe/Berlin',
    // only what the app shows: no description, attendees or e-mail addresses
    fields: 'items(id,summary,start,end,location,visibility,status,etag,recurringEventId,recurrence)',
  }).toString()
  const result = await googleGet<{ items?: RawEvent[] }>(token, url)
  const value: Outcome<RawEvent[]> = result.ok ? { ok: true, data: result.data.items ?? [] } : result
  if (cache.size > 200) cache.clear()
  cache.set(cacheKey, { at: Date.now(), value })
  return value
}

// ---------- Google Calendar: writing (always with the AUTHOR's own token) ----------

async function googleWrite<T>(method: 'POST' | 'PATCH' | 'DELETE', token: string, url: URL, body?: unknown, extra: Record<string, string> = {}): Promise<Outcome<T | null>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return { ok: true, data: res.status === 204 ? null : ((await res.json()) as T) }
    const reason = (await res.json().catch(() => null))?.error?.errors?.[0]?.reason as string | undefined
    if (res.status === 404 || res.status === 410) return { ok: false, error: 'not_found' }
    if (res.status === 409) return { ok: false, error: 'conflict' }
    if (res.status === 412) return { ok: false, error: 'changed' }
    if (res.status === 400) return { ok: false, error: 'bad_request' }
    if (res.status === 403 && reason === 'insufficientPermissions') return { ok: false, error: 'missing_scope' }
    if (res.status === 403 && !/limit|quota/i.test(reason ?? '')) return { ok: false, error: 'not_writable' }
    return { ok: false, error: 'upstream_error' }
  } catch {
    return { ok: false, error: 'upstream_error' }
  }
}

// Does the AUTHOR have write access to this calendar in Google? (The role stored in calendar_links is the
// registering person's, so it proves nothing about the author.) A calendar missing from the list counts as no.
async function authorCanWrite(token: string, calendarId: string): Promise<Outcome<boolean>> {
  const url = new URL(`${API}/users/me/calendarList/${encodeURIComponent(calendarId)}`)
  url.search = new URLSearchParams({ fields: 'accessRole' }).toString()
  const result = await googleGet<{ accessRole?: string }>(token, url)
  if (result.ok) return { ok: true, data: result.data.accessRole === 'owner' || result.data.accessRole === 'writer' }
  return result.error === 'not_found' ? { ok: true, data: false } : result
}

interface EventInput {
  title: string
  all_day: boolean
  start: string // all-day: YYYY-MM-DD, otherwise an ISO date-time
  end: string // all-day: exclusive end date
  location: string | null
  reminders: number[] | null | undefined // null = calendar default, undefined = leave as it is (edits)
}

// Whitelist + limits for everything that goes to Google. No description, attendees or colors are accepted.
function parseEvent(raw: unknown): EventInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  const title = typeof e.title === 'string' ? e.title.trim() : ''
  if (title.length < 1 || title.length > 200) return null
  const allDay = e.all_day === true
  if (typeof e.start !== 'string' || typeof e.end !== 'string') return null
  if (allDay && !(DAY.test(e.start) && DAY.test(e.end))) return null
  const start = Date.parse(allDay ? `${e.start}T00:00:00Z` : e.start)
  const end = Date.parse(allDay ? `${e.end}T00:00:00Z` : e.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_SPAN_MS) return null

  let location: string | null = null
  if (e.location !== undefined && e.location !== null && e.location !== '') {
    if (typeof e.location !== 'string' || e.location.length > 200) return null
    location = e.location.trim() || null
  }

  let reminders: number[] | null | undefined
  if (e.reminders === null) reminders = null
  else if (Array.isArray(e.reminders)) {
    if (
      e.reminders.length > MAX_REMINDERS ||
      !e.reminders.every((m) => Number.isInteger(m) && m >= 0 && m <= MAX_REMINDER_MINUTES)
    ) {
      return null
    }
    reminders = [...new Set(e.reminders as number[])].sort((a, b) => a - b)
  } else if (e.reminders !== undefined) return null

  return {
    title,
    all_day: allDay,
    start: allDay ? e.start : new Date(start).toISOString(),
    end: allDay ? e.end : new Date(end).toISOString(),
    location,
    reminders,
  }
}

// The body sent to Google, built only from validated values. Edits are PATCHes, so a description or the
// attendees of an event are never overwritten; null clears a field there. Nobody is e-mailed (sendUpdates=none).
function googleBody(e: EventInput, create: { id?: string; privateEvent: boolean } | null): Record<string, unknown> {
  const when = (value: string) =>
    e.all_day
      ? create ? { date: value } : { date: value, dateTime: null }
      : create ? { dateTime: value, timeZone: TIME_ZONE } : { dateTime: value, timeZone: TIME_ZONE, date: null }
  const body: Record<string, unknown> = { summary: e.title, start: when(e.start), end: when(e.end) }
  if (e.location !== null) body.location = e.location
  else if (!create) body.location = null
  if (e.reminders !== undefined) {
    body.reminders =
      e.reminders === null
        ? { useDefault: true }
        : { useDefault: false, overrides: e.reminders.map((minutes) => ({ method: 'popup', minutes })) }
  }
  if (create) {
    if (create.id) body.id = create.id
    if (create.privateEvent) body.visibility = 'private' // "only me": hidden from others even in a shared view
  }
  return body
}

// One Google event as the app sees it (also used for the answer of a write).
function toEvent(e: RawEvent, link: LinkRow, uid: string): EventOut | null {
  const start = e.start?.dateTime ?? e.start?.date
  const end = e.end?.dateTime ?? e.end?.date
  if (e.status === 'cancelled' || !start || !end) return null
  // a private / confidential event is hidden from everyone except the owner of the calendar
  const masked = (e.visibility === 'private' || e.visibility === 'confidential') && link.owner_user_id !== uid
  const recurring = !!(e.recurringEventId || e.recurrence)
  const writable = link.shared || (link.owner_user_id === uid && (link.access_role === 'owner' || link.access_role === 'writer'))
  return {
    id: text(e.id, 200),
    calendar_link_id: link.id,
    title: masked ? null : text(e.summary, 200),
    start,
    end, // all-day events: the end date is exclusive (as in Google)
    all_day: !!e.start?.date,
    location: masked || !e.location ? null : text(e.location, 200),
    private: masked,
    etag: text(e.etag, 200),
    recurring,
    editable: !masked && !recurring && writable,
  }
}

// Per person: at most N event reads per minute (the browser polls; this protects the Google quota).
const recentReads = new Map<string, number[]>()
function tooManyReads(uid: string): boolean {
  const now = Date.now()
  const hits = (recentReads.get(uid) ?? []).filter((t) => now - t < 60_000)
  if (hits.length >= EVENT_READS_PER_MINUTE) {
    recentReads.set(uid, hits)
    return true
  }
  hits.push(now)
  if (recentReads.size > 1000) recentReads.clear()
  recentReads.set(uid, hits)
  return false
}

// ---------- HTTP ----------

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  if (!ALLOWED_ORIGINS.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function reply(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  })
}

const fail = (req: Request, status: number, code: string) => reply(req, status, { error: code })
const text = (value: unknown, max: number) => String(value ?? '').slice(0, max)

const ACTIONS = ['status', 'save_token', 'calendars', 'disconnect', 'events', 'create_event', 'update_event', 'delete_event']
// Actions that need "write" on the calendar module (they register or remove the person's own connection)
const WRITE_ACTIONS = ['save_token', 'calendars', 'disconnect', 'create_event', 'update_event', 'delete_event']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') return fail(req, 405, 'bad_request')

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return fail(req, 401, 'forbidden')

    let body: {
      action?: unknown
      family_id?: unknown
      from?: unknown
      to?: unknown
      link_ids?: unknown
      refresh_token?: unknown
      calendar_link_id?: unknown
      event_id?: unknown
      etag?: unknown
      event?: unknown
    }
    try {
      body = await req.json()
    } catch {
      return fail(req, 400, 'bad_request')
    }
    const familyId = body.family_id
    const action = body.action
    if (typeof familyId !== 'string' || !UUID.test(familyId) || typeof action !== 'string' || !ACTIONS.includes(action)) {
      return fail(req, 400, 'bad_request')
    }

    // The caller's own client: RLS and auth.uid() apply to everything done with it.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    })
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData.user?.id // always from the verified token, never from the body
    if (!uid) return fail(req, 401, 'forbidden')

    const { data: allowed, error: accessError } = await supabase.rpc('has_module_access', {
      fid: familyId,
      mod: 'calendar',
      level: WRITE_ACTIONS.includes(action) ? 'write' : 'read',
    })
    if (accessError) return fail(req, 502, 'upstream_error')
    if (allowed !== true) return fail(req, 403, 'forbidden')

    const key = await encryptionKey()
    if (!key || !Deno.env.get('GOOGLE_CLIENT_ID') || !Deno.env.get('GOOGLE_CLIENT_SECRET')) {
      return fail(req, 503, 'not_configured')
    }

    // Limit per person and hour for the actions that call Google on the person's behalf for registering
    if (action === 'save_token' || action === 'calendars') {
      const { error: claimError } = await supabase.rpc('claim_calendar_check', { fid: familyId, per_hour: CHECKS_PER_HOUR })
      if (claimError) {
        if (claimError.message.includes('limit_reached')) return fail(req, 429, 'limit_reached')
        if (claimError.message.includes('forbidden')) return fail(req, 403, 'forbidden')
        return fail(req, 502, 'upstream_error')
      }
    }

    // ---------- save_token: the refresh token from the sign-in, validated, encrypted, stored ----------
    if (action === 'save_token') {
      const refreshToken = body.refresh_token
      if (typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 2048 || /\s/.test(refreshToken)) {
        return fail(req, 400, 'bad_request')
      }
      const result = await exchangeRefreshToken(refreshToken)
      if (!result.ok) return fail(req, result.error === 'invalid_grant' ? 400 : 502, result.error === 'invalid_grant' ? 'bad_request' : 'upstream_error')
      // A token without every required scope never replaces a working one (it is not stored at all).
      const granted = result.scope.split(' ')
      if (!REQUIRED_SCOPES.every((s) => granted.includes(s))) return reply(req, 200, { ok: false, error: 'missing_scope' })
      const saved = await writeOwnToken(uid, { save: { enc: await encrypt(key, refreshToken), scopes: result.scope } })
      if (!saved) return fail(req, 502, 'upstream_error')
      accessTokens.set(uid, { value: result.accessToken, expires: Date.now() + result.expiresIn * 1000 })
      return reply(req, 200, { ok: true })
    }

    // ---------- status: is the caller connected, and does the token still work? ----------
    if (action === 'status') {
      const row = await readOwnerToken(uid)
      if (!row) return reply(req, 200, { connected: false, needs_reconnect: false })
      const token = await accessTokenOf(uid, key, true)
      if (token.ok) return reply(req, 200, { connected: true, needs_reconnect: false })
      if (token.error === 'revoked') return reply(req, 200, { connected: true, needs_reconnect: true })
      return fail(req, 502, 'upstream_error')
    }

    // ---------- disconnect: revoke at Google, delete the token and the caller's own links ----------
    if (action === 'disconnect') {
      const row = await readOwnerToken(uid)
      if (row && row.status === 'ok') {
        try {
          const refreshToken = await decrypt(key, row.enc)
          await fetch(REVOKE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refreshToken }),
          })
        } catch {
          // revoking at Google is best effort; the stored token is deleted either way
        }
      }
      accessTokens.delete(uid)
      if (!(await writeOwnToken(uid, { remove: true }))) return fail(req, 502, 'upstream_error')
      await supabase.from('calendar_links').delete().eq('owner_user_id', uid) // RLS: only the caller's own
      return reply(req, 200, { ok: true })
    }

    // ---------- calendars: the caller's own Google calendars, to pick from when registering ----------
    if (action === 'calendars') {
      const token = await accessTokenOf(uid, key, true)
      if (!token.ok) {
        return fail(req, token.error === 'upstream_error' ? 502 : 409, token.error === 'revoked' ? 'reconnect' : token.error)
      }
      // The whole calendar list: hidden calendars too (they are left out by default) and every page.
      interface ListedCalendar {
        id: string
        summary?: string
        accessRole: string
        primary?: boolean
      }
      const listed: ListedCalendar[] = []
      let pageToken: string | undefined
      for (let page = 0; page < 4; page++) {
        const url = new URL(`${API}/users/me/calendarList`)
        url.search = new URLSearchParams({
          minAccessRole: 'reader',
          showHidden: 'true',
          maxResults: '250',
          fields: 'nextPageToken,items(id,summary,accessRole,primary)',
          ...(pageToken ? { pageToken } : {}),
        }).toString()
        const result = await googleGet<{ items?: ListedCalendar[]; nextPageToken?: string }>(token.token, url)
        if (!result.ok) return fail(req, 502, result.error)
        listed.push(...(result.data.items ?? []))
        pageToken = result.data.nextPageToken
        if (!pageToken) break
      }
      // calendars that are already registered in this family (as far as the caller's RLS shows them) are not offered again
      const { data: registered } = await supabase.from('calendar_links').select('google_calendar_id').eq('family_id', familyId)
      const taken = new Set((registered ?? []).map((r: { google_calendar_id: string }) => r.google_calendar_id))
      const calendars = listed.filter((c) => !taken.has(c.id)).slice(0, 250).map((c) => ({
        id: text(c.id, 254),
        summary: text(c.summary, 100),
        access_role: c.accessRole,
        primary: c.primary === true,
      }))
      return reply(req, 200, { calendars })
    }

    // ---------- create_event / update_event / delete_event ----------
    if (action === 'create_event' || action === 'update_event' || action === 'delete_event') {
      const { error: claimError } = await supabase.rpc('claim_calendar_write', { fid: familyId, per_hour: WRITES_PER_HOUR })
      if (claimError) {
        if (claimError.message.includes('limit_reached')) return fail(req, 429, 'limit_reached')
        if (claimError.message.includes('forbidden')) return fail(req, 403, 'forbidden')
        return fail(req, 502, 'upstream_error')
      }

      // validate everything before any Google call
      const linkId = body.calendar_link_id
      const eventId = body.event_id
      if (typeof linkId !== 'string' || !UUID.test(linkId)) return fail(req, 400, 'bad_request')
      if (action !== 'create_event' && !(typeof eventId === 'string' && EVENT_ID.test(eventId))) return fail(req, 400, 'bad_request')
      const input = action === 'delete_event' ? null : parseEvent(body.event)
      if (action !== 'delete_event' && !input) return fail(req, 400, 'bad_request')
      const etag = body.etag
      if (action === 'update_event' && !(typeof etag === 'string' && etag.length > 0 && etag.length <= 200)) return fail(req, 400, 'bad_request')
      const newId = action === 'create_event' && typeof (body.event as { id?: unknown })?.id === 'string' ? (body.event as { id: string }).id : undefined
      if (newId !== undefined && !NEW_EVENT_ID.test(newId)) return fail(req, 400, 'bad_request')

      // 1) the target comes from calendar_links read with the CALLER's client (RLS), never from an ID sent by the client
      const { data: link, error: linkError } = await supabase
        .from('calendar_links')
        .select('id, google_calendar_id, owner_user_id, shared, visibility, access_role')
        .eq('id', linkId)
        .eq('family_id', familyId)
        .maybeSingle()
      if (linkError) return fail(req, 502, 'upstream_error')
      // writable targets: the family calendar, or the caller's OWN calendar - never someone else's
      if (!link || !(link.shared || link.owner_user_id === uid)) return fail(req, 403, 'forbidden')

      // 2) always the AUTHOR's token (Google's own sharing rules are the last line of defence)
      const token = await accessTokenOf(uid, key, true)
      if (!token.ok) return fail(req, token.error === 'upstream_error' ? 502 : 409, token.error === 'revoked' ? 'reconnect' : token.error)

      // 3) the author's role in this Google calendar, checked live
      const role = await authorCanWrite(token.token, link.google_calendar_id)
      if (!role.ok) return fail(req, 502, 'upstream_error')
      if (!role.data) return fail(req, 403, 'not_writable')

      const calendarUrl = `${API}/calendars/${encodeURIComponent(link.google_calendar_id)}/events`
      const failWith = (error: CallError) =>
        fail(req, error === 'upstream_error' ? 502 : error === 'not_found' ? 404 : error === 'bad_request' ? 400 : error === 'not_writable' || error === 'missing_scope' ? 403 : 409, error)

      if (action === 'create_event') {
        const url = new URL(calendarUrl)
        url.search = new URLSearchParams({ sendUpdates: 'none' }).toString()
        const created = await googleWrite<RawEvent>('POST', token.token, url, googleBody(input!, { id: newId, privateEvent: !link.shared }))
        cache.clear()
        // the same client-chosen id twice = the first request already succeeded
        if (!created.ok) return created.error === 'conflict' ? reply(req, 200, { ok: true, duplicate: true }) : failWith(created.error)
        return reply(req, 200, { ok: true, event: created.data ? toEvent(created.data, link, uid) : null })
      }

      // update / delete: read the event first (same calendar, author's token) to reject recurring and hidden ones
      const eventUrl = new URL(`${calendarUrl}/${encodeURIComponent(eventId as string)}`)
      const current = await googleGet<RawEvent>(token.token, new URL(`${eventUrl}?fields=id,recurringEventId,recurrence,visibility,status`))
      if (!current.ok) return failWith(current.error)
      if (current.data.recurringEventId || current.data.recurrence) return fail(req, 409, 'recurring_unsupported')
      const hidden = current.data.visibility === 'private' || current.data.visibility === 'confidential'
      if (current.data.status === 'cancelled' || (hidden && link.owner_user_id !== uid)) return fail(req, 404, 'not_found')

      eventUrl.search = new URLSearchParams({ sendUpdates: 'none' }).toString()
      if (action === 'delete_event') {
        const removed = await googleWrite<null>('DELETE', token.token, eventUrl)
        cache.clear()
        return removed.ok ? reply(req, 200, { ok: true }) : failWith(removed.error)
      }
      const patched = await googleWrite<RawEvent>('PATCH', token.token, eventUrl, googleBody(input!, null), { 'If-Match': etag as string })
      cache.clear()
      if (!patched.ok) return failWith(patched.error)
      return reply(req, 200, { ok: true, event: patched.data ? toEvent(patched.data, link, uid) : null })
    }

    // ---------- events ----------
    if (tooManyReads(uid)) return fail(req, 429, 'limit_reached')
    const from = Date.parse(String(body.from))
    const to = Date.parse(String(body.to))
    const wanted = body.link_ids
    if (
      !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > MAX_RANGE_MS ||
      (wanted !== undefined &&
        (!Array.isArray(wanted) || wanted.length > MAX_CALENDARS || !wanted.every((w) => typeof w === 'string' && UUID.test(w))))
    ) {
      return fail(req, 400, 'bad_request')
    }

    // RLS already hides other people's private calendars; the explicit filter keeps that true even if a policy changes.
    const { data: links, error: linksError } = await supabase
      .from('calendar_links')
      .select('id, google_calendar_id, owner_user_id, shared, visibility, access_role')
      .eq('family_id', familyId)
    if (linksError) return fail(req, 502, 'upstream_error')
    // the client list can only narrow the selection, never widen it
    const usable = (links ?? [])
      .filter((l) => l.owner_user_id === uid || l.visibility === 'family')
      .filter((l) => !wanted || (wanted as string[]).includes(l.id))
      .slice(0, MAX_CALENDARS)

    const fromIso = new Date(from).toISOString()
    const toIso = new Date(to).toISOString()
    const events: EventOut[] = []
    const errors: { calendar_link_id: string; error: string }[] = []
    await Promise.all(
      usable.map(async (link) => {
        // every calendar is read with the token of its OWNER (the person who registered it)
        const own = link.owner_user_id === uid
        const token = await accessTokenOf(link.owner_user_id, key, own)
        if (!token.ok) {
          errors.push({
            calendar_link_id: link.id,
            error: token.error === 'upstream_error' ? 'upstream_error' : own ? (token.error === 'revoked' ? 'reconnect' : 'not_connected') : 'owner_reconnect',
          })
          return
        }
        const outcome = await listEvents(token.token, link.owner_user_id, link.google_calendar_id, fromIso, toIso)
        if (!outcome.ok) {
          errors.push({ calendar_link_id: link.id, error: outcome.error })
          return
        }
        for (const e of outcome.data) {
          const event = toEvent(e, link, uid)
          if (event) events.push(event)
        }
      }),
    )
    events.sort((a, b) => a.start.localeCompare(b.start))
    return reply(req, 200, { events, errors })
  } catch (err) {
    // Only the error class is logged - never tokens, the key, the client secret, events or calendar IDs.
    console.error('calendar failed:', (err as Error)?.name)
    return fail(req, 502, 'upstream_error')
  }
})
