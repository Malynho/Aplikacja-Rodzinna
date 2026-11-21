import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { Controls } from './Controls'

// Sidebar entries: route path + translation key.
export const NAV_ITEMS = [
  { to: '/', key: 'home' },
  { to: '/shopping', key: 'shopping' },
  { to: '/todo', key: 'todo' },
  { to: '/notes', key: 'notes' },
  { to: '/admin', key: 'admin' },
] as const

export function Layout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false) // mobile drawer state

  return (
    <div className="layout">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">{t('app.name')}</div>
        <nav>
          {NAV_ITEMS.map(({ to, key }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" aria-label={t('nav.menu')} onClick={() => setOpen(true)}>
            ☰
          </button>
          <Controls />
          <button className="link-btn" onClick={signOut}>
            {t('auth.signOut')}
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
