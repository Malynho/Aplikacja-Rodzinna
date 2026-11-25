import { useTranslation } from 'react-i18next'
import { addDays, toDay } from '../lib/date'
import { startOf, type CalendarEvent } from '../lib/calendar'

interface Props {
  event: CalendarEvent
  color: string // color of its calendar
  calendar: string // name of its calendar
  withDay?: boolean // prefix with the day (the list of upcoming events)
}

// One event: day (optional), time or "all day", title ("Private" when hidden), place, calendar. Read-only.
export function EventLine({ event, color, calendar, withDay }: Props) {
  const { t, i18n } = useTranslation()
  const start = startOf(event)
  const today = new Date()

  let when = event.all_day
    ? t('calendar.allDay')
    : new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(start)
  if (withDay) {
    const day = toDay(start)
    const label =
      day === toDay(today)
        ? t('calendar.when.today')
        : day === toDay(addDays(today, 1))
          ? t('calendar.when.tomorrow')
          : new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'numeric' }).format(start)
    when = `${label}, ${when}`
  }

  return (
    <div className="event-line">
      <span className="event-dot" style={{ background: color }} aria-hidden="true" />
      <span className="grow">
        <span className="muted">{when}</span> {event.title ?? t('calendar.private')}
        {event.location && <span className="muted"> · {event.location}</span>}
      </span>
      <span className="muted event-cal">{calendar}</span>
    </div>
  )
}
