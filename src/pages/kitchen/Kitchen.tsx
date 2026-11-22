import { useEffect, useRef } from 'react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFamily } from '../../family/FamilyProvider'
import { useModuleAccess } from '../../hooks/useModuleAccess'
import { useKitchen } from '../../hooks/useKitchen'

// Tabs of the Kitchen module: route segment + translation key (kitchen.tabs.<key>).
export const KITCHEN_TABS = [
  { to: 'shopping', key: 'shopping' },
  { to: 'pantry', key: 'pantry' },
  { to: 'recipes', key: 'recipes' },
  { to: 'meal-plan', key: 'mealPlan' },
] as const

export function Kitchen() {
  const { family, loading } = useFamily()
  const access = useModuleAccess('kitchen')

  if (loading) return null
  // No family or no 'kitchen' permission: back to the home page.
  if (!family || access === 'none') return <Navigate to="/" replace />
  return <KitchenBody familyId={family.id} canWrite={access === 'write'} />
}

// Loads the Kitchen data once; the tabs read it from the outlet context (no reload when switching tabs).
function KitchenBody({ familyId, canWrite }: { familyId: string; canWrite: boolean }) {
  const { t } = useTranslation()
  const kitchen = useKitchen(familyId)
  const seeding = useRef(false)

  // First visit by someone who may write: add the starter catalog (duplicates are skipped by the database).
  const { loaded, hasSeeded, seed } = kitchen
  useEffect(() => {
    if (canWrite && loaded && !hasSeeded && !seeding.current) {
      seeding.current = true
      seed()
    }
    // seed only depends on familyId, which is fixed for this component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite, loaded, hasSeeded])

  return (
    <>
      <nav className="segmented tabs">
        {KITCHEN_TABS.map(({ to, key }) => (
          <NavLink key={to} to={to}>
            {t(`kitchen.tabs.${key}`)}
            {key === 'pantry' && kitchen.lowCount > 0 ? ` (${kitchen.lowCount})` : ''}
          </NavLink>
        ))}
      </nav>
      <Outlet context={kitchen} />
    </>
  )
}
