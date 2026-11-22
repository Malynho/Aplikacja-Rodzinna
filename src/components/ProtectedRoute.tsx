import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { INVITE_TOKEN_KEY } from '../lib/invite'

// Renders child routes only for signed-in users; others go to /login.
export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  // An invitation saved before Google login must be accepted first.
  if (sessionStorage.getItem(INVITE_TOKEN_KEY)) return <Navigate to="/invite" replace />
  return <Outlet />
}
