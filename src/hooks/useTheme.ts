import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export const THEMES: Theme[] = ['light', 'dark', 'system']

const STORAGE_KEY = 'theme'

function readStored(): Theme {
  const v = localStorage.getItem(STORAGE_KEY)
  return THEMES.includes(v as Theme) ? (v as Theme) : 'system'
}

// Sets data-theme on <html>; "system" removes it so the CSS media query applies.
function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStored)

  useEffect(() => {
    apply(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  return { theme, setTheme }
}
