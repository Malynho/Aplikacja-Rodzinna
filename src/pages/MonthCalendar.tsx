import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { useModuleAccess } from '../hooks/useModuleAccess'
import type { CalendarSettings } from '../hooks/useCalendarSettings'
import { daysOf, type CalendarEvent } from '../lib/calendar'
import { addDays, isoWeek, mondayOf, toDay } from '../lib/date'
import { functionErrorCode } from '../lib/functionError'
import { appliesTo, useHolidays } from '../lib/holidays'
import { supabase } from '../lib/supabase'
import { EventForm } from './EventForm'
import { EventLine } from './EventLine'

const FLAGS = { PL: '🇵🇱', DE: '🇩🇪' }
const MAX_EVENT_DOTS = 3
const firstOfThisMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)

interface Props {
  homeState: string
  // without it only holidays are shown; refreshKey / onChanged: own writes refresh every list on the page
  calendar?: { familyId: string; settings: CalendarSettings; refreshKey: number; onChanged: () => void }
}

// Month view (weeks start on Monday) with week numbers, today, PL / DE (home state) holidays and,
// when a calendar is connected, a dot per event; tapping a day lists its events (read-only).
export function MonthCalendar({ homeState, calendar }: Props) {
  const { t, i18n } = useTranslation()
  const [month, setMonth] = useState(firstOfThisMonth)
  const today = toDay(new Date())
  const [selected, setSelected] = useState(today)
  const canWrite = useModuleAccess('calendar') === 'write'
  const [form, setForm] = useState<{ event?: CalendarEvent } | null>(null) // the event form: new, or editing
  const [writeError, setWriteError] = useState<string | null>(null)

  const start = mondayOf(month)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const weeks = Math.round((mondayOf(last).getTime() - start.getTime()) / (7 * 86400000)) + 1
  const holidays = useHolidays([start.getFullYear(), last.getFullYear()])
  const settings = calendar?.settings
  const loaded = useCalendarEvents(calendar?.familyId ?? null, start.getTime(), addDays(start, weeks * 7).getTime(), calendar?.refreshKey ?? 0)

  // holidays by day: Poland always, Germany only when it applies in the family's state
  const byDay = new Map<string, { country: 'PL' | 'DE'; name: string }[]>()
  for (const country of ['PL', 'DE'] as const) {
    for (const h of holidays[country]) {
      if (country === 'DE' && !appliesTo(h, homeState)) continue
      byDay.set(h.date, [...(byDay.get(h.date) ?? []), { country, name: h.localName }])
    }
  }

  // events of the switched-on calendars by day
  const eventsByDay = new Map<string, CalendarEvent[]>()
  for (const e of loaded.events) {
    if (!settings?.isOn(e.calendar_link_id)) continue
    for (const day of daysOf(e)) eventsByDay.set(day, [...(eventsByDay.get(day) ?? []), e])
  }

  const monthKey = toDay(month).slice(0, 7)
  const inMonth = [...byDay.entries()].filter(([day]) => day.startsWith(monthKey)).sort(([a], [b]) => a.localeCompare(b))
  const dayName = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
  const dayMonth = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' })
  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1))
  const selectedEvents = eventsByDay.get(selected) ?? []

  async function remove(e: CalendarEvent) {
    if (!calendar || !window.confirm(t('calendar.confirmDelete', { title: e.title ?? t('calendar.private') }))) return
    const { error: err } = await supabase.functions.invoke('calendar', {
      body: { action: 'delete_event', family_id: calendar.familyId, calendar_link_id: e.calendar_link_id, event_id: e.id },
    })
    if (err) {
      setWriteError(await functionErrorCode(err, 'function_error'))
    } else {
      setWriteError(null)
      calendar.onChanged()
    }
  }

  return (
    <div className="card stack calendar-card">
      <div className="row cal-nav">
        <button aria-label={t('calendar.prev')} onClick={() => shift(-1)}>
          ‹
        </button>
        <strong className="grow">
          {new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(month)}
        </strong>
        <button
          className="link-btn"
          onClick={() => {
            setMonth(firstOfThisMonth())
            setSelected(today)
          }}
        >
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
              const events = eventsByDay.get(day) ?? []
              const names = marks.map((m) => m.name).join(', ')
              const label = [
                `${date.getDate()}`,
                events.length > 0 ? t('calendar.eventCount', { count: events.length }) : '',
                names,
              ]
                .filter(Boolean)
                .join(', ')
              return (
                <button
                  key={day}
                  className={`cal-day${date.getMonth() !== month.getMonth() ? ' other' : ''}${day === today ? ' today' : ''}${day === selected ? ' selected' : ''}`}
                  title={names || undefined}
                  aria-label={label}
                  aria-pressed={day === selected}
                  onClick={() => setSelected(day)}
                >
                  {date.getDate()}
                  <span className="cal-dots" aria-hidden="true">
                    {marks.map((m) => (
                      <span key={m.country} className={`dot ${m.country}`} />
                    ))}
                    {events.slice(0, MAX_EVENT_DOTS).map((e) => (
                      <span key={`${e.calendar_link_id}${e.id}`} className="dot-event" style={{ background: settings?.colorOf(e.calendar_link_id) }} />
                    ))}
                  </span>
                </button>
              )
            }),
          ]
        })}
      </div>
      {settings && calendar && (
        <div className="stack">
          <div className="row">
            <h3 className="grow">
              {new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selected}T12:00:00`))}
            </h3>
            {canWrite && !form && (
              <button
                className="link-btn"
                onClick={() => {
                  setWriteError(null)
                  setForm({})
                }}
              >
                {t('calendar.addEvent')}
              </button>
            )}
          </div>
          {form ? (
            <EventForm
              key={form.event?.id ?? 'new'}
              familyId={calendar.familyId}
              day={selected}
              event={form.event}
              settings={settings}
              onSaved={() => {
                setForm(null)
                calendar.onChanged()
              }}
              onCancel={() => setForm(null)}
            />
          ) : selectedEvents.length === 0 ? (
            <p className="muted">{t('calendar.noneOnDay')}</p>
          ) : (
            selectedEvents.map((e) => (
              <div key={`${e.calendar_link_id}${e.id}`} className="stack">
                <EventLine
                  event={e}
                  color={settings.colorOf(e.calendar_link_id)}
                  calendar={settings.labelOf(e.calendar_link_id)}
                />
                {e.recurring && <p className="muted">{t('calendar.recurringNote')}</p>}
                {canWrite && e.editable && (
                  <div className="row">
                    <button
                      className="link-btn"
                      onClick={() => {
                        setWriteError(null)
                        setForm({ event: e })
                      }}
                    >
                      {t('calendar.editEvent')}
                    </button>
                    <button className="link-btn" onClick={() => remove(e)}>
                      {t('calendar.deleteEvent')}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          {writeError && <p className="error">{t(`calendars.errors.${writeError}`)}</p>}
        </div>
      )}
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
