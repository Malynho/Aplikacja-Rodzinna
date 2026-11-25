import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFamily } from '../../family/FamilyProvider'
import { CreateFamily } from './CreateFamily'
import { HomeState } from './HomeState'
import { Invitations } from './Invitations'
import { MembersTable } from './MembersTable'

// Verwaltung: without a family it offers creation, otherwise admin-only management.
export function Admin() {
  const { t } = useTranslation()
  const { family, role, loading } = useFamily()

  if (loading) return null
  if (!family) return <CreateFamily />
  if (role !== 'admin') return <Navigate to="/" replace />

  return (
    <>
      <h1>{t('nav.admin')}</h1>
      <p className="muted">{family.name}</p>
      <HomeState familyId={family.id} current={family.home_state} />
      <Invitations familyId={family.id} />
      <MembersTable familyId={family.id} />
    </>
  )
}
