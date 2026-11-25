import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { CalendarLinks } from '../components/CalendarLinks'
import { useFamily } from '../family/FamilyProvider'
import { useModuleAccess } from '../hooks/useModuleAccess'

// Account settings: for now the user's own calendar.
export function Settings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { family, loading } = useFamily()
  const access = useModuleAccess('calendar')

  if (loading) return null
  return (
    <>
      <h1>{t('settings.title')}</h1>
      {family && user && access !== 'none' ? (
        <CalendarLinks
          familyId={family.id}
          shared={false}
          canWrite={access === 'write'}
          title={t('settings.myCalendar')}
          intro={t('calendars.personalIntro')}
        />
      ) : (
        <p className="muted">{t('settings.noAccess')}</p>
      )}
    </>
  )
}
