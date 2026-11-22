import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

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
  const { user } = useAuth()
  const [theme, setThemeState] = useState<Theme>(readStored)

  useEffect(() => {
    apply(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // Signed-in users get their saved theme from the profile (null = nothing saved yet).
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('theme')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data && THEMES.includes(data.theme as Theme)) setThemeState(data.theme as Theme)
      })
  }, [user])

  // Changing the theme also saves it to the profile so it follows the user across devices.
  function setTheme(next: Theme) {
    setThemeState(next)
    if (user) supabase.from('profiles').update({ theme: next }).eq('id', user.id).then()
  }

  return { theme, setTheme }
}
