import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, isoWeek, mondayOf, toDay } from '../lib/date'
import { appliesTo, useHolidays } from '../lib/holidays'

const FLAGS = { PL: '🇵🇱', DE: '🇩🇪' }
const firstOfThisMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)

// Month view (weeks start on Monday) with week numbers, today, and the PL / DE (home state) holidays.
export function MonthCalendar({ homeState }: { homeState: string }) {
  const { t, i18n } = useTranslation()
  const [month, setMonth] = useState(firstOfThisMonth)
  const today = toDay(new Date())

  const start = mondayOf(month)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const weeks = Math.round((mondayOf(last).getTime() - start.getTime()) / (7 * 86400000)) + 1
  const holidays = useHolidays([start.getFullYear(), last.getFullYear()])

  // holidays by day: Poland always, Germany only when it applies in the family's state
  const byDay = new Map<string, { country: 'PL' | 'DE'; name: string }[]>()
  for (const country of ['PL', 'DE'] as const) {
    for (const h of holidays[country]) {
      if (country === 'DE' && !appliesTo(h, homeState)) continue
      byDay.set(h.date, [...(byDay.get(h.date) ?? []), { country, name: h.localName }])
    }
  }

  const monthKey = toDay(month).slice(0, 7)
  const inMonth = [...byDay.entries()].filter(([day]) => day.startsWith(monthKey)).sort(([a], [b]) => a.localeCompare(b))
  const dayName = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
  const dayMonth = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' })
  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1))

  return (
    <div className="card stack">
      <div className="row cal-nav">
        <button aria-label={t('calendar.prev')} onClick={() => shift(-1)}>
          ‹
        </button>
        <strong className="grow">
          {new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(month)}
        </strong>
        <button className="link-btn" onClick={() => setMonth(firstOfThisMonth())}>
          {t('calendar.today')}
        </button>
        <button aria-label={t('calendar.next')} onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="calendar">
        <span className="cal-week">{t('calendar.weekShort')}</span>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="cal-head">
            {dayName.format(addDays(mondayOf(new Date()), i))}
          </span>
        ))}
        {Array.from({ length: weeks }, (_, w) => {
          const monday = addDays(start, w * 7)
          return [
            <span key={`w${w}`} className="cal-week">
              {isoWeek(monday)}
            </span>,
            ...Array.from({ length: 7 }, (_, i) => {
              const date = addDays(monday, i)
              const day = toDay(date)
              const marks = byDay.get(day) ?? []
              const names = marks.map((m) => m.name).join(', ')
              return (
                <span
                  key={day}
                  className={`cal-day${date.getMonth() !== month.getMonth() ? ' other' : ''}${day === today ? ' today' : ''}`}
                  title={names || undefined}
                  aria-label={names ? `${date.getDate()}, ${names}` : undefined}
                >
                  {date.getDate()}
                  <span className="cal-dots" aria-hidden="true">
                    {marks.map((m) => (
                      <span key={m.country} className={`dot ${m.country}`} />
                    ))}
                  </span>
                </span>
              )
            }),
          ]
        })}
      </div>
      {inMonth.length > 0 && (
        <ul className="cal-list">
          {inMonth.map(([day, marks]) => (
            <li key={day}>
              <span className="muted">{dayMonth.format(new Date(`${day}T12:00:00`))}</span>{' '}
              {marks.map((m) => `${FLAGS[m.country]} ${m.name}`).join(' · ')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
