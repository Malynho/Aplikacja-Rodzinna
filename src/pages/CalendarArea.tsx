import { useState } from 'react'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { useCalendarSettings } from '../hooks/useCalendarSettings'
import { addDays } from '../lib/date'
import { MonthCalendar } from './MonthCalendar'
import { NextEventCounter } from './NextEventCounter'
import { UpcomingEvents } from './UpcomingEvents'

const WINDOW_DAYS = 30

// Calendar part of the start page for people with calendar access: the "next event" counter above the month
// calendar and the list of upcoming events. The counter and the list share one request.
export function CalendarArea({ familyId, userId, homeState }: { familyId: string; userId: string; homeState: string }) {
  const settings = useCalendarSettings(familyId, userId)
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  const [version, setVersion] = useState(0) // bumped after an own create / update / delete: both lists refresh at once
  const data = useCalendarEvents(familyId, today.getTime(), addDays(today, WINDOW_DAYS).getTime(), version)
  const events = data.events.filter((e) => settings.isOn(e.calendar_link_id))
  const errors = data.errors.filter((e) => settings.isOn(e.calendar_link_id))

  return (
    <>
      <NextEventCounter events={events} />
      <div className="dashboard">
        <MonthCalendar
          homeState={homeState}
          calendar={{ familyId, settings, refreshKey: version, onChanged: () => setVersion((v) => v + 1) }}
        />
        <UpcomingEvents
          settings={settings}
          events={events}
          errors={errors}
          loaded={data.loaded}
          failed={data.failed !== null}
          updatedAt={data.updatedAt}
          days={WINDOW_DAYS}
        />
      </div>
    </>
  )
}
