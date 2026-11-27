import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CalendarSettings } from '../hooks/useCalendarSettings'
import { upcoming, type CalendarEvent } from '../lib/calendar'
import { EventLine } from './EventLine'

export interface CalendarError {
  calendar_link_id: string
  error: string
}

interface Props {
  settings: CalendarSettings
  events: CalendarEvent[] // already filtered to the calendars that are switched on
  errors: CalendarError[] // of the calendars that are switched on
  loaded: boolean
  failed: boolean // the whole call failed
  updatedAt: number | null // last successful refresh
  days: number // length of the window shown in the "nothing coming up" text
}

const OWN_PROBLEMS = ['reconnect', 'not_connected'] // the person's own Google connection needs attention

// "Next events": the 5 nearest events of the switched-on calendars, with a filter chip per calendar.
// Problems stay inside this card (with a way to fix them); the rest of the page is not affected.
export function UpcomingEvents({ settings, events, errors, loaded, failed, updatedAt, days }: Props) {
  const { t, i18n } = useTranslation()
  const list = upcoming(events, new Date()).slice(0, 5)

  const ownProblem = errors.some((e) => OWN_PROBLEMS.includes(e.error))
  const ownerProblems = [...new Set(errors.filter((e) => e.error === 'owner_reconnect').map((e) => settings.textOf(e.calendar_link_id)))]
  const otherProblem = errors.some((e) => e.error !== 'owner_reconnect' && !OWN_PROBLEMS.includes(e.error))
  const connect = (label: string) => (
    <Link className="primary" to="/settings">
      {label}
    </Link>
  )

  let body
  if (!settings.loaded || !loaded) body = <p className="muted">{t('calendar.loading')}</p>
  else if (settings.links.length === 0)
    body = (
      <div className="stack">
        <p className="muted">{t('calendar.noCalendars')}</p>
        {connect(t('calendar.connect'))}
      </div>
    )
  else if (failed && list.length === 0) body = <p className="error">{t('calendar.unavailable')}</p>
  else if (list.length === 0) body = <p className="muted">{t('calendar.none', { days })}</p>
  else
    body = (
      <div className="list">
        {list.map((e) => (
          <EventLine
            key={`${e.calendar_link_id}${e.id}`}
            event={e}
            color={settings.colorOf(e.calendar_link_id)}
            calendar={settings.labelOf(e.calendar_link_id)}
            withDay
          />
        ))}
      </div>
    )

  const ready = settings.loaded && loaded
  return (
    <div className="card stack">
      <h2>{t('calendar.upcoming')}</h2>
      {settings.chips.length > 0 && (
        <div className="chips" role="group" aria-label={t('calendar.filter.label')}>
          {settings.chips.map((c) => (
            <button key={c.id} className="chip" aria-pressed={c.on} onClick={() => settings.toggle(c.id)}>
              {c.text}
            </button>
          ))}
        </div>
      )}
      {body}
      {ready && ownProblem && (
        <div className="stack">
          <p className="error">{t('calendar.reconnectOwn')}</p>
          {connect(t('calendar.reconnect'))}
        </div>
      )}
      {ready && ownerProblems.length > 0 && <p className="muted">{t('calendar.ownerReconnect', { names: ownerProblems.join(', ') })}</p>}
      {ready && (otherProblem || (failed && list.length > 0)) && <p className="muted">{t('calendar.partial')}</p>}
      {ready && settings.links.length > 0 && !settings.hasOwn && !ownProblem && (
        <div className="stack">
          <p className="muted">{t('calendar.connectBanner')}</p>
          {connect(t('calendar.connect'))}
        </div>
      )}
      {ready && updatedAt && (
        <p className="muted updated">
          {t('calendar.updatedAt', { time: new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(updatedAt) })}
        </p>
      )}
    </div>
  )
}
