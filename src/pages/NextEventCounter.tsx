import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { upcoming, whenOf, type CalendarEvent, type When } from '../lib/calendar'

function whenText(when: When, t: TFunction): string {
  switch (when.kind) {
    case 'now':
    case 'today':
    case 'tomorrow':
      return t(`calendar.when.${when.kind}`)
    case 'days':
      return t('calendar.when.inDays', { count: when.days })
    case 'in': {
      const parts = []
      if (when.hours > 0) parts.push(t('calendar.when.hours', { count: when.hours }))
      if (when.minutes > 0 || when.hours === 0) parts.push(t('calendar.when.minutes', { count: when.minutes }))
      return t('calendar.when.in', { time: parts.join(' ') })
    }
  }
}

// "Next event: <title>, in 2 h 15 min" from the events already loaded (no extra requests); ticks every minute.
// Hidden when nothing is coming up.
export function NextEventCounter({ events }: { events: CalendarEvent[] }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const next = upcoming(events, now)[0]
  if (!next) return null
  return (
    <p className="card next-event">
      {t('calendar.counter', { title: next.title ?? t('calendar.private'), when: whenText(whenOf(next, now), t) })}
    </p>
  )
}
