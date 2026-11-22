import { useTranslation } from 'react-i18next'

// Placeholder for modules and tabs that are not built yet (titleKey = translation key of the title).
export function ModulePage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t(titleKey)}</h1>
      <div className="card muted">{t('module.comingSoon')}</div>
    </>
  )
}
