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
  const data = useCalendarEvents(familyId, today.getTime(), addDays(today, WINDOW_DAYS).getTime())
  const events = data.events.filter((e) => settings.isOn(e.calendar_link_id))

  return (
    <>
      <NextEventCounter events={events} />
      <div className="dashboard">
        <MonthCalendar homeState={homeState} calendar={{ familyId, settings }} />
        <UpcomingEvents
          settings={settings}
          events={events}
          loaded={data.loaded}
          failed={data.failed !== null}
          partial={data.errors.some((e) => settings.isOn(e.calendar_link_id))}
          days={WINDOW_DAYS}
        />
      </div>
    </>
  )
}
