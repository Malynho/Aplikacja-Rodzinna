import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { Controls } from '../components/Controls'

export function Login() {
  const { t } = useTranslation()
  const { user, loading, signInWithGoogle } = useAuth()

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  return (
    <div className="login">
      <div className="card login-card">
        <h1>{t('app.name')}</h1>
        <button className="primary" onClick={signInWithGoogle}>
          {t('auth.signInGoogle')}
        </button>
        <Controls />
      </div>
    </div>
  )
}
