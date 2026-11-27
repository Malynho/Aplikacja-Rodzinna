import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { useFamily } from '../family/FamilyProvider'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { Controls } from './Controls'

// Sidebar entries: route path + translation key.
export const NAV_ITEMS = [
  { to: '/', key: 'home' },
  { to: '/kitchen', key: 'kitchen' },
  { to: '/todo', key: 'todo' },
  { to: '/notes', key: 'notes' },
  { to: '/settings', key: 'settings' },
  { to: '/admin', key: 'admin' },
] as const

export function Layout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const { family, role, loading } = useFamily()
  const [open, setOpen] = useState(false) // mobile drawer state
  const kitchenAccess = useModuleAccess('kitchen')
  const calendarAccess = useModuleAccess('calendar')
  const todoAccess = useModuleAccess('todo')
  const notesAccess = useModuleAccess('notes')
  // Verwaltung: admins and users without a family yet (to create one). Kitchen: read or write access.
  const items = NAV_ITEMS.filter((i) => {
    if (i.key === 'admin') return !loading && (!family || role === 'admin')
    if (i.key === 'kitchen') return !loading && kitchenAccess !== 'none'
    if (i.key === 'todo') return !loading && todoAccess !== 'none'
    if (i.key === 'notes') return !loading && notesAccess !== 'none'
    if (i.key === 'settings') return !loading && calendarAccess !== 'none' // the only setting so far is the calendar
    return true
  })

  return (
    <div className="layout">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">{t('app.name')}</div>
        <nav>
          {items.map(({ to, key }) => (
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
