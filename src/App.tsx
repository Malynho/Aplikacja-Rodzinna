import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Kitchen } from './pages/kitchen/Kitchen'
import { Pantry } from './pages/kitchen/Pantry'
import { Shopping } from './pages/kitchen/Shopping'
import { AuthProvider } from './auth/AuthProvider'
import { FamilyProvider } from './family/FamilyProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AcceptInvite } from './pages/AcceptInvite'
import { Admin } from './pages/admin/Admin'
import { Layout, NAV_ITEMS } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { ModulePage } from './pages/ModulePage'
import { MealPlan } from './pages/kitchen/MealPlan'
import { Recipes } from './pages/kitchen/Recipes'
import { Privacy } from './pages/Privacy'
import { Settings } from './pages/Settings'
import { TodoPage } from './pages/todo/Todo'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FamilyProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/invite" element={<AcceptInvite />} />
            <Route path="/datenschutz" element={<Privacy />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/todo" element={<TodoPage />} />
                <Route path="/kitchen" element={<Kitchen />}>
                  <Route index element={<Navigate to="shopping" replace />} />
                  <Route path="shopping" element={<Shopping />} />
                  <Route path="pantry" element={<Pantry />} />
                  <Route path="recipes" element={<Recipes />} />
                  <Route path="meal-plan" element={<MealPlan />} />
                </Route>
                {NAV_ITEMS.filter((i) => !['/', '/admin', '/kitchen', '/settings', '/todo'].includes(i.to)).map(({ to, key }) => (
                  <Route key={to} path={to} element={<ModulePage titleKey={`nav.${key}`} />} />
                ))}
              </Route>
            </Route>
          </Routes>
        </FamilyProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
