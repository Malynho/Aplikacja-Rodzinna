import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFamily } from '../family/FamilyProvider'
import type { CalendarSettings } from '../hooks/useCalendarSettings'
import { endOf, startOf, type CalendarEvent } from '../lib/calendar'
import { addDays, toDay } from '../lib/date'
import { functionErrorCode } from '../lib/functionError'
import { supabase } from '../lib/supabase'

interface Props {
  familyId: string
  day: string // YYYY-MM-DD: the day that was clicked (default date of a new event)
  event?: CalendarEvent // set = editing it
  settings: CalendarSettings
  onSaved: () => void
  onCancel: () => void
}

type Target = 'everyone' | 'mine'
type Reminders = 'keep' | 'default' | 'custom' // keep: only when editing (the existing reminders are not touched)

// Minutes before the start; at most 5 can be chosen.
const REMINDER_CHOICES = [0, 10, 30, 60, 120, 1440, 2880, 10080]
const MAX_REMINDERS = 5

const timeOf = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

// Add / edit one event. The target calendar is chosen by the buttons "For everyone" (the family calendar) and
// "Only me" (the person's own private calendar). The Edge Function checks the rights again; nothing is trusted here.
export function EventForm({ familyId, day, event, settings, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const { role } = useFamily()
  const { everyone, mine } = settings.writeTargets
  const editing = !!event
  const first = event ? startOf(event) : null
  const last = event ? endOf(event) : null

  const [title, setTitle] = useState(event?.title ?? '')
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [date, setDate] = useState(first ? toDay(first) : day)
  // all-day events end on an exclusive date in Google; the form shows the last day itself
  const [endDate, setEndDate] = useState(last ? toDay(event!.all_day ? addDays(last, -1) : last) : day)
  const [startTime, setStartTime] = useState(first && !event!.all_day ? timeOf(first) : '09:00')
  const [endTime, setEndTime] = useState(last && !event!.all_day ? timeOf(last) : '10:00')
  const [location, setLocation] = useState(event?.location ?? '')
  const [reminders, setReminders] = useState<Reminders>(editing ? 'keep' : 'default')
  const [minutes, setMinutes] = useState<number[]>([])
  const [target, setTarget] = useState<Target>(everyone.length > 0 ? 'everyone' : 'mine')
  const [linkId, setLinkId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const group = target === 'everyone' ? everyone : mine
  const chosen = editing ? event!.calendar_link_id : (group.find((l) => l.id === linkId) ?? group[0])?.id
  const start = allDay ? date : new Date(`${date}T${startTime}`)
  const end = allDay ? addDays(new Date(`${endDate}T00:00:00`), 1) : new Date(`${endDate}T${endTime}`)
  const valid =
    title.trim() !== '' && date !== '' && endDate !== '' && !!chosen && (allDay ? endDate >= date : end > (start as Date))

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    const payload = {
      title: title.trim(),
      all_day: allDay,
      start: allDay ? date : (start as Date).toISOString(),
      end: allDay ? toDay(end) : end.toISOString(),
      location: location.trim() || null,
      ...(reminders === 'keep' ? {} : { reminders: reminders === 'default' ? null : minutes }),
      ...(editing ? {} : { id: crypto.randomUUID().replaceAll('-', '') }), // a retry cannot create a duplicate
    }
    const { error: err } = await supabase.functions.invoke('calendar', {
      body: {
        action: editing ? 'update_event' : 'create_event',
        family_id: familyId,
        calendar_link_id: chosen,
        ...(editing ? { event_id: event!.id, etag: event!.etag } : {}),
        event: payload,
      },
    })
    if (err) {
      setError(await functionErrorCode(err, 'function_error'))
      setBusy(false)
    } else {
      onSaved()
    }
  }

  function toggleMinutes(value: number) {
    setMinutes((prev) => (prev.includes(value) ? prev.filter((m) => m !== value) : prev.length < MAX_REMINDERS ? [...prev, value] : prev))
  }

  return (
    <div className="stack">
      <label className="field">
        {t('calendar.form.title')}
        <input className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="row">
        <input type="checkbox" className="check" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        {t('calendar.form.allDay')}
      </label>
      <div className="row">
        <label className="field grow">
          {t('calendar.form.from')}
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              if (endDate < e.target.value) setEndDate(e.target.value)
            }}
          />
        </label>
        {!allDay && (
          <label className="field">
            &nbsp;
            <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
        )}
      </div>
      <div className="row">
        <label className="field grow">
          {t('calendar.form.to')}
          <input className="input" type="date" min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        {!allDay && (
          <label className="field">
            &nbsp;
            <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        )}
      </div>
      <label className="field">
        {t('calendar.form.place')}
        <input className="input" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>

      {/* where the event is saved: fixed when editing */}
      {editing ? (
        <p className="muted">{t('calendar.form.calendarFixed', { name: settings.labelOf(event!.calendar_link_id) })}</p>
      ) : (
        <div className="stack">
          <span className="muted">{t('calendar.form.target')}</span>
          <div className="segmented" role="group">
            <button className={target === 'everyone' ? 'active' : ''} disabled={everyone.length === 0} onClick={() => setTarget('everyone')}>
              {t('calendar.form.everyone')}
            </button>
            <button className={target === 'mine' ? 'active' : ''} disabled={mine.length === 0} onClick={() => setTarget('mine')}>
              {t('calendar.form.onlyMe')}
            </button>
          </div>
          {mine.length === 0 && (
            <p className="muted">
              {t('calendar.form.noPrivate')} <Link to="/settings">{t('calendar.form.settingsLink')}</Link>
            </p>
          )}
          {everyone.length === 0 && (
            <p className="muted">
              {t('calendar.form.noShared')}
              {role === 'admin' && (
                <>
                  {' '}
                  <Link to="/admin">{t('calendar.form.sharedLinkAdmin')}</Link>
                </>
              )}
            </p>
          )}
          {group.length > 1 && (
            <select className="input" aria-label={t('calendar.form.calendar')} value={chosen} onChange={(e) => setLinkId(e.target.value)}>
              {group.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="stack">
        <span className="muted">{t('calendar.form.reminders')}</span>
        <div className="segmented" role="group">
          {(editing ? (['keep', 'default', 'custom'] as const) : (['default', 'custom'] as const)).map((mode) => (
            <button key={mode} className={reminders === mode ? 'active' : ''} onClick={() => setReminders(mode)}>
              {t(`calendar.form.reminderMode.${mode}`)}
            </button>
          ))}
        </div>
        {reminders === 'custom' && (
          <div className="chips" role="group" aria-label={t('calendar.form.reminders')}>
            {REMINDER_CHOICES.map((m) => (
              <button
                key={m}
                className="chip"
                aria-pressed={minutes.includes(m)}
                disabled={!minutes.includes(m) && minutes.length >= MAX_REMINDERS}
                onClick={() => toggleMinutes(m)}
              >
                {t(`calendar.form.reminderChoice.${m}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="error">{t(`calendars.errors.${error}`)}</p>}
      <div className="row">
        <button className="primary" disabled={!valid || busy} onClick={save}>
          {t('calendars.save')}
        </button>
        <button className="link-btn" onClick={onCancel}>
          {t('calendars.cancel')}
        </button>
      </div>
    </div>
  )
}
