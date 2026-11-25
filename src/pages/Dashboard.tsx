import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { useFamily } from '../family/FamilyProvider'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { useWeather, type Weather } from '../hooks/useWeather'
import { isoWeek, toDay } from '../lib/date'
import { appliesTo, useHolidays } from '../lib/holidays'
import { CalendarArea } from './CalendarArea'
import { MonthCalendar } from './MonthCalendar'

interface Props {
  name: string
  weather: Weather | null
  weatherError: boolean
  homeState: string
  calendar?: { familyId: string; userId: string } // set for people with calendar access
}

// The start page without data loading (so the layout can be checked with fixed data).
export function StartView({ name, weather, weatherError, homeState, calendar }: Props) {
  const { t, i18n } = useTranslation()
  const now = new Date()
  const holidays = useHolidays([now.getFullYear()])
  const today = toDay(now)
  const dateText = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)

  return (
    <div className="start">
      <h1>{t('greeting', { name })}</h1>
      <div className="pills">
        <span className="pill">{dateText}</span>
        <span className="pill">{t('week', { number: isoWeek(now) })}</span>
        {holidays.PL.filter((h) => h.date === today).map((h) => (
          <span key={`PL${h.localName}`} className="pill holiday">
            🇵🇱 {h.localName}
          </span>
        ))}
        {holidays.DE.filter((h) => h.date === today).map((h) => (
          <span key={`DE${h.localName}`} className={`pill holiday${appliesTo(h, homeState) ? ' home' : ''}`}>
            🇩🇪 {h.localName} · {h.counties ? h.counties.map((c) => c.slice(3)).join(', ') : t('holidays.nationwide')}
          </span>
        ))}
        <span className="pill">
          {weather ? (
            <>
              <span className="weather-icon">{weather.icon}</span>
              {weather.temperature}°C · {t(`weather.${weather.key}`)}
              {weather.city && <span className="muted"> · {weather.city}</span>}
            </>
          ) : (
            <span className="muted">{t(weatherError ? 'weather.error' : 'weather.loading')}</span>
          )}
        </span>
      </div>
      {calendar ? (
        <CalendarArea familyId={calendar.familyId} userId={calendar.userId} homeState={homeState} />
      ) : (
        <div className="dashboard">
          <MonthCalendar homeState={homeState} />
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  const { firstName, user } = useAuth()
  const { family } = useFamily()
  const { weather, error } = useWeather()
  const hasCalendar = useModuleAccess('calendar') !== 'none'
  return (
    <StartView
      name={firstName}
      weather={weather}
      weatherError={!!error}
      homeState={family?.home_state ?? 'DE-HE'}
      calendar={family && user && hasCalendar ? { familyId: family.id, userId: user.id } : undefined}
    />
  )
}
