import { useTranslation } from 'react-i18next'

// Placeholder for modules that are not built yet.
export function ModulePage({ name }: { name: string }) {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t(`nav.${name}`)}</h1>
      <div className="card muted">{t('module.comingSoon')}</div>
    </>
  )
}
