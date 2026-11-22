import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { useWeather } from '../hooks/useWeather'
import { isoWeek } from '../lib/date'

export function Dashboard() {
  const { t, i18n } = useTranslation()
  const { firstName } = useAuth()
  const { weather, error } = useWeather()

  const now = new Date()
  const dateText = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)

  return (
    <>
      <h1>{t('greeting', { name: firstName })}</h1>
      <div className="pills">
        <span className="pill">{dateText}</span>
        <span className="pill">{t('week', { number: isoWeek(now) })}</span>
        <span className="pill">
          {weather ? (
            <>
              <span className="weather-icon">{weather.icon}</span>
              {weather.temperature}°C · {t(`weather.${weather.key}`)}
              {weather.city && <span className="muted"> · {weather.city}</span>}
            </>
          ) : (
            <span className="muted">{t(error ? 'weather.error' : 'weather.loading')}</span>
          )}
        </span>
      </div>
    </>
  )
}
