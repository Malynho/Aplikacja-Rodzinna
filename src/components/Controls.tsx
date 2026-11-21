import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n'
import { THEMES, useTheme } from '../hooks/useTheme'

// Language and theme switchers, shared by the login page and the top bar.
export function Controls() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <div className="controls">
      <div className="segmented" role="group">
        {LANGUAGES.map((lng) => (
          <button
            key={lng}
            className={i18n.language === lng ? 'active' : ''}
            onClick={() => i18n.changeLanguage(lng)}
          >
            {lng.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="segmented" role="group">
        {THEMES.map((th) => (
          <button key={th} className={theme === th ? 'active' : ''} onClick={() => setTheme(th)}>
            {t(`theme.${th}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
