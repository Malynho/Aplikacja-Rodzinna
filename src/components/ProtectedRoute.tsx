import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

// Renders child routes only for signed-in users; others go to /login.
export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Outlet /> : <Navigate to="/login" replace />
}
