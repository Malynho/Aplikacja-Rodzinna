import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Controls } from '../components/Controls'

const SECTIONS = ['data', 'calendar', 'receipts', 'recipes', 'services', 'sharing', 'deletion', 'google'] as const
const CONTACT = 'malynho@gmail.com'
const GOOGLE_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy'

// Public privacy page (/datenschutz): reachable without signing in, in the language chosen with the switcher.
export function Privacy() {
  const { t } = useTranslation()

  return (
    <div className="legal">
      <Controls />
      <h1>{t('privacy.title')}</h1>
      <p>{t('privacy.intro')}</p>
      {SECTIONS.map((key) => (
        <section key={key} className="section">
          <h2>{t(`privacy.sections.${key}.title`)}</h2>
          <p>{t(`privacy.sections.${key}.text`)}</p>
          {key === 'google' && (
            <p>
              <a href={GOOGLE_POLICY} target="_blank" rel="noopener noreferrer">
                {t('privacy.googlePolicyLink')}
              </a>
            </p>
          )}
        </section>
      ))}
      <section className="section">
        <h2>{t('privacy.contactTitle')}</h2>
        <p>
          {t('privacy.contactText')} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </section>
      <p>
        <Link to="/login">{t('privacy.back')}</Link>
      </p>
    </div>
  )
}
