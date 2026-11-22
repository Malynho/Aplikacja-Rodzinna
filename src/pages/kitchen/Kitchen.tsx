import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFamily } from '../../family/FamilyProvider'
import { useModuleAccess } from '../../hooks/useModuleAccess'

// Tabs of the Kitchen module: route segment + translation key (kitchen.tabs.<key>).
export const KITCHEN_TABS = [
  { to: 'shopping', key: 'shopping' },
  { to: 'pantry', key: 'pantry' },
  { to: 'recipes', key: 'recipes' },
  { to: 'meal-plan', key: 'mealPlan' },
] as const

export function Kitchen() {
  const { t } = useTranslation()
  const { family, loading } = useFamily()
  const access = useModuleAccess('kitchen')

  if (loading) return null
  // No family or no 'kitchen' permission: back to the home page.
  if (!family || access === 'none') return <Navigate to="/" replace />

  return (
    <>
      <nav className="segmented tabs">
        {KITCHEN_TABS.map(({ to, key }) => (
          <NavLink key={to} to={to}>
            {t(`kitchen.tabs.${key}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
