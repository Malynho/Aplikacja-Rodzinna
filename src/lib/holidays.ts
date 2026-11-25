import { useEffect, useState } from 'react'

// Public holidays from Nager.Date (no key, CORS enabled). Only a year and a country code are sent.
export type HolidayCountry = 'PL' | 'DE'

export interface Holiday {
  date: string // YYYY-MM-DD
  localName: string
  counties: string[] | null // ISO 3166-2 codes (DE-HE); null = the whole country
}

const TTL_MS = 30 * 24 * 60 * 60 * 1000
const inflight = new Map<string, Promise<Holiday[]>>() // one request per country and year, even for two components

function readCache(key: string): { at: number; data: Holiday[] } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null')
    return parsed && Array.isArray(parsed.data) ? parsed : null
  } catch {
    return null
  }
}

// Cached copy when fresh; otherwise fetched. A failure falls back to an old copy or to nothing.
function loadYear(country: HolidayCountry, year: number): Promise<Holiday[]> {
  const key = `holidays:${country}:${year}`
  const cached = readCache(key)
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.data)
  const pending =
    inflight.get(key) ??
    fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: { date: string; localName: string; counties: string[] | null; types?: string[] }[]) => {
        const data = rows
          .filter((h) => !h.types || h.types.includes('Public'))
          .map(({ date, localName, counties }) => ({ date, localName, counties }))
        try {
          localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }))
        } catch {
          // storage unavailable: the list is simply fetched again next time
        }
        return data
      })
      .catch(() => cached?.data ?? [])
      .finally(() => inflight.delete(key))
  inflight.set(key, pending)
  return pending
}

// Holidays of the given years for Poland and Germany. Empty until loaded, empty on errors (nothing is shown).
export function useHolidays(years: number[]): Record<HolidayCountry, Holiday[]> {
  const [holidays, setHolidays] = useState<Record<HolidayCountry, Holiday[]>>({ PL: [], DE: [] })
  const key = [...new Set(years)].sort().join(',')

  useEffect(() => {
    let cancelled = false
    const list = key.split(',').map(Number)
    Promise.all(
      (['PL', 'DE'] as const).map((c) => Promise.all(list.map((y) => loadYear(c, y))).then((r) => r.flat())),
    ).then(([PL, DE]) => {
      if (!cancelled) setHolidays({ PL, DE })
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return holidays
}

// A German holiday counts for the family when it is nationwide or applies in its state.
export const appliesTo = (holiday: Holiday, state: string) => !holiday.counties || holiday.counties.includes(state)
