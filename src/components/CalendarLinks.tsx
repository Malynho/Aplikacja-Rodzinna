import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { useCalendarConnection } from '../hooks/useCalendarConnection'
import { functionErrorCode } from '../lib/functionError'
import { supabase } from '../lib/supabase'

interface Link {
  id: string
  label: string
  visibility: 'private' | 'family'
  access_role: string | null
}

interface GoogleCalendar {
  id: string
  summary: string
  access_role: string
}

interface Draft {
  id: string | null // null = new calendar
  google: GoogleCalendar | null // the picked Google calendar (new ones only)
  label: string
  visibility: 'private' | 'family'
}

interface Props {
  familyId: string
  shared: boolean // true: the family calendars (Verwaltung, admins); false: the user's own calendars
  canWrite: boolean
  title: string
  intro: string
}

const EMPTY: Draft = { id: null, google: null, label: '', visibility: 'private' }

// Google connection of the signed-in person plus the calendars registered with it: connect / disconnect,
// pick a calendar from the person's own Google list, name it, choose who sees it. Used for the family
// calendar (Verwaltung) and for the person's own calendars (account settings).
export function CalendarLinks({ familyId, shared, canWrite, title, intro }: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const connection = useCalendarConnection(familyId)
  const [links, setLinks] = useState<Link[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [options, setOptions] = useState<GoogleCalendar[] | null>(null) // null = not loaded yet
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const query = supabase
      .from('calendar_links')
      .select('id, label, visibility, access_role')
      .eq('family_id', familyId)
      .eq('shared', shared)
    const { data } = await (shared ? query : query.eq('owner_user_id', user.id))
    setLinks(((data ?? []) as Link[]).sort((a, b) => a.label.localeCompare(b.label)))
  }, [familyId, shared, user])

  useEffect(() => {
    load()
  }, [load])

  const connected = connection.status?.connected === true && !connection.status.needs_reconnect

  // the list of the person's own Google calendars, loaded when the add form opens
  async function openAdd() {
    setDraft({ ...EMPTY })
    setError(null)
    setOptions(null) // reload every time: a calendar added a moment ago must not be offered again
    const { data, error: err } = await supabase.functions.invoke('calendar', { body: { action: 'calendars', family_id: familyId } })
    if (err) {
      setError(await functionErrorCode(err, 'function_error'))
      setDraft(null)
    } else {
      setOptions((data?.calendars ?? []) as GoogleCalendar[])
    }
  }

  async function save() {
    if (!draft || !user) return
    const label = draft.label.trim()
    const { error: err } = draft.id
      ? await supabase.from('calendar_links').update({ label, visibility: shared ? 'family' : draft.visibility }).eq('id', draft.id)
      : await supabase.from('calendar_links').insert({
          family_id: familyId,
          owner_user_id: user.id, // always the registering person: their token reads this calendar
          shared,
          google_calendar_id: draft.google!.id,
          access_role: draft.google!.access_role,
          label,
          visibility: shared ? 'family' : draft.visibility,
        })
    setError(err ? (err.code === '23505' ? 'duplicate' : 'error') : null)
    if (!err) {
      setDraft(null)
      await load()
    }
  }

  async function remove(link: Link) {
    if (!window.confirm(t('calendars.confirmRemove', { name: link.label }))) return
    const { error: err } = await supabase.from('calendar_links').delete().eq('id', link.id)
    setError(err ? 'error' : null)
    await load()
  }

  async function setVisibility(link: Link, visibility: Link['visibility']) {
    const { error: err } = await supabase.from('calendar_links').update({ visibility }).eq('id', link.id)
    setError(err ? 'error' : null)
    await load()
  }

  async function disconnect() {
    if (!window.confirm(t('calendars.connection.confirmDisconnect'))) return
    if (await connection.disconnect()) {
      setOptions(null)
      await load()
    }
  }

  const shownError = error ?? connection.error
  const nothingToAdd = draft?.id === null && options !== null && options.length === 0
  const status = connection.status

  return (
    <section className="section cal-links">
      <h2>{title}</h2>
      <div className="card stack">
        <p className="muted">{intro}</p>

        {/* connection of this person's Google account */}
        {status === null && !connection.error ? (
          <p className="muted">{t('calendars.connection.checking')}</p>
        ) : status?.connected && !status.needs_reconnect ? (
          <div className="row">
            <span className="grow">{t('calendars.connection.ok')}</span>
            <button className="link-btn" onClick={disconnect}>
              {t('calendars.connection.disconnect')}
            </button>
          </div>
        ) : (
          <div className="stack">
            <p className={status?.needs_reconnect ? 'error' : 'muted'}>
              {t(status?.needs_reconnect ? 'calendars.connection.reconnectNeeded' : 'calendars.connection.off')}
            </p>
            <button className="primary" onClick={connection.connect}>
              {t(status?.needs_reconnect ? 'calendars.connection.reconnect' : 'calendars.connection.connect')}
            </button>
          </div>
        )}
        {connection.saved && <p className="muted">{t('calendars.connection.saved')}</p>}
        {shownError === 'wrong_account' && (
          <button className="link-btn" onClick={connection.signOut}>
            {t('calendars.connection.signOut')}
          </button>
        )}

        {links.length === 0 && !draft && <p className="muted">{t('calendars.empty')}</p>}
        {links.map((link) => (
          <div key={link.id} className="stack">
            <div className="row">
              <strong className="grow">{link.label}</strong>
              {!shared && canWrite && (
                <div className="segmented" role="group" aria-label={t('calendars.visibility')}>
                  {(['private', 'family'] as const).map((v) => (
                    <button key={v} className={link.visibility === v ? 'active' : ''} onClick={() => setVisibility(link, v)}>
                      {t(`calendars.visibilityOptions.${v}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {link.access_role && <span className="muted">{t(`calendars.roles.${link.access_role}`)}</span>}
            {canWrite && (
              <div className="row">
                <button className="link-btn" onClick={() => setDraft({ id: link.id, google: null, label: link.label, visibility: link.visibility })}>
                  {t('calendars.edit')}
                </button>
                <button className="link-btn" onClick={() => remove(link)}>
                  {t('calendars.remove')}
                </button>
              </div>
            )}
          </div>
        ))}

        {draft && nothingToAdd && (
          <div className="stack">
            <p className="muted">{t('calendars.noneToAdd')}</p>
            <button className="link-btn" onClick={() => setDraft(null)}>
              {t('calendars.cancel')}
            </button>
          </div>
        )}
        {draft && !nothingToAdd && (
          <div className="stack">
            {draft.id === null && (
              <label className="field">
                {t('calendars.pick')}
                <select
                  className="input"
                  value={draft.google?.id ?? ''}
                  disabled={options === null}
                  onChange={(e) => {
                    const google = options?.find((c) => c.id === e.target.value) ?? null
                    setDraft({ ...draft, google, label: draft.label || google?.summary.slice(0, 60) || '' })
                  }}
                >
                  <option value="">{t(options === null ? 'calendars.loadingList' : 'calendars.pickPlaceholder')}</option>
                  {(options ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary} ({t(`calendars.roles.${c.access_role}`)})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              {t('calendars.label')}
              <input
                className="input"
                maxLength={60}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            {!shared && (
              <div className="segmented" role="group" aria-label={t('calendars.visibility')}>
                {(['private', 'family'] as const).map((v) => (
                  <button key={v} className={draft.visibility === v ? 'active' : ''} onClick={() => setDraft({ ...draft, visibility: v })}>
                    {t(`calendars.visibilityOptions.${v}`)}
                  </button>
                ))}
              </div>
            )}
            <div className="row">
              <button
                className="primary"
                disabled={draft.label.trim() === '' || (draft.id === null && !draft.google)}
                onClick={save}
              >
                {t('calendars.save')}
              </button>
              <button className="link-btn" onClick={() => setDraft(null)}>
                {t('calendars.cancel')}
              </button>
            </div>
          </div>
        )}
        {shownError && <p className="error">{t(`calendars.errors.${shownError}`)}</p>}
        {canWrite && connected && !draft && (
          <button className="primary" onClick={openAdd}>
            {t('calendars.add')}
          </button>
        )}
      </div>
    </section>
  )
}
