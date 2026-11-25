import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CalendarSettings } from '../hooks/useCalendarSettings'
import { upcoming, type CalendarEvent } from '../lib/calendar'
import { EventLine } from './EventLine'

interface Props {
  settings: CalendarSettings
  events: CalendarEvent[] // already filtered to the calendars that are switched on
  loaded: boolean
  failed: boolean // the whole call failed
  partial: boolean // some calendars could not be read
  days: number // length of the window shown in the "nothing coming up" text
}

// "Next events": the 5 nearest events of the switched-on calendars, with the calendar filter chips.
// A calendar problem stays inside this card; the rest of the page is not affected.
export function UpcomingEvents({ settings, events, loaded, failed, partial, days }: Props) {
  const { t } = useTranslation()
  const list = upcoming(events, new Date()).slice(0, 5)

  let body
  if (!settings.loaded || !loaded) body = <p className="muted">{t('calendar.loading')}</p>
  else if (settings.links.length === 0)
    body = (
      <p className="muted">
        {t('calendar.noCalendars')} <Link to="/settings">{t('calendar.connect')}</Link>
      </p>
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

  return (
    <div className="card stack">
      <h2>{t('calendar.upcoming')}</h2>
      {settings.groups.length > 0 && (
        <div className="chips" role="group" aria-label={t('calendar.filter.label')}>
          {settings.groups.map((g) => (
            <button key={g.key} className="chip" aria-pressed={g.on} onClick={() => settings.toggle(g)}>
              {g.label ?? t(`calendar.filter.${g.key}`)}
            </button>
          ))}
        </div>
      )}
      {body}
      {settings.loaded && loaded && (failed ? list.length > 0 : partial) && <p className="muted">{t('calendar.partial')}</p>}
    </div>
  )
}
