import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { useFamily } from '../family/FamilyProvider'
import { supabase } from '../lib/supabase'
import { INVITE_TOKEN_KEY } from '../lib/invite'

// Handles /invite#<token>. The token is moved out of the URL right away and
// is deleted from session storage as soon as the invitation was used.
export function AcceptInvite() {
  const { t } = useTranslation()
  const { user, loading } = useAuth()
  const { reload } = useFamily()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  // Runs first: stash the token from the URL fragment and clean the address bar.
  useEffect(() => {
    const fromUrl = window.location.hash.slice(1)
    if (fromUrl) {
      sessionStorage.setItem(INVITE_TOKEN_KEY, fromUrl)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (loading || started.current) return
    const token = sessionStorage.getItem(INVITE_TOKEN_KEY)
    if (!token) {
      navigate('/', { replace: true })
      return
    }
    // Not signed in yet: log in with Google first, then come back here.
    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    started.current = true
    supabase.rpc('accept_invitation', { tok: token }).then(async ({ error }) => {
      sessionStorage.removeItem(INVITE_TOKEN_KEY)
      if (error) {
        setFailed(true)
        return
      }
      await reload()
      navigate('/', { replace: true })
    })
  }, [loading, user, navigate, reload])

  if (!failed) return null
  return (
    <div className="login">
      <div className="card login-card">
        <p className="error">{t('invite.error')}</p>
        <Link to="/">{t('invite.back')}</Link>
      </div>
    </div>
  )
}
