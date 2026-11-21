import { useEffect, useState } from 'react'

// Fallback location used when geolocation is denied or unavailable.
const FALLBACK = { lat: 50.1109, lon: 8.6821, city: 'Frankfurt am Main' }

export type WeatherKey = 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder'

export interface Weather {
  temperature: number
  key: WeatherKey
  icon: string
  city: string | null // null when the location came from the browser
}

// Maps WMO weather codes (Open-Meteo) to a translation key and an icon.
function describe(code: number): { key: WeatherKey; icon: string } {
  if (code === 0) return { key: 'clear', icon: '☀️' }
  if (code <= 3) return { key: 'cloudy', icon: '⛅' }
  if (code <= 48) return { key: 'fog', icon: '🌫️' }
  if (code <= 57) return { key: 'drizzle', icon: '🌦️' }
  if (code <= 67 || (code >= 80 && code <= 82)) return { key: 'rain', icon: '🌧️' }
  if (code <= 77 || (code >= 85 && code <= 86)) return { key: 'snow', icon: '❄️' }
  return { key: 'thunder', icon: '⛈️' }
}

function getPosition(): Promise<{ lat: number; lon: number; city: string | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(FALLBACK)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, city: null }),
      () => resolve(FALLBACK),
      { timeout: 5000 },
    )
  })
}

export function useWeather() {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { lat, lon, city } = await getPosition()
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        if (cancelled) return
        setWeather({
          temperature: Math.round(data.current.temperature_2m),
          ...describe(data.current.weather_code),
          city,
        })
      } catch {
        if (!cancelled) setError(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { weather, error }
}
