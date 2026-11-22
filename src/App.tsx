import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { FamilyProvider } from './family/FamilyProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AcceptInvite } from './pages/AcceptInvite'
import { Admin } from './pages/admin/Admin'
import { Layout, NAV_ITEMS } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { ModulePage } from './pages/ModulePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FamilyProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/invite" element={<AcceptInvite />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="/admin" element={<Admin />} />
                {NAV_ITEMS.filter((i) => i.to !== '/' && i.to !== '/admin').map(({ to, key }) => (
                  <Route key={to} path={to} element={<ModulePage name={key} />} />
                ))}
              </Route>
            </Route>
          </Routes>
        </FamilyProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
