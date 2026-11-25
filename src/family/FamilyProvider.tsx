import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export interface Family {
  id: string
  name: string
  home_state: string // ISO 3166-2 code of the German state (public holidays)
}
type Role = 'admin' | 'member'
export type Level = 'none' | 'read' | 'write'

interface FamilyState {
  family: Family | null
  role: Role | null
  permissions: Record<string, Level> // own per-module permissions (members only; admins have full access)
  loading: boolean
  reload: () => Promise<void>
}

interface Membership {
  role: Role
  families: Family & { created_at: string }
}

const FamilyContext = createContext<FamilyState | null>(null)

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<Omit<FamilyState, 'reload'>>({
    family: null,
    role: null,
    permissions: {},
    loading: true,
  })

  const reload = useCallback(async () => {
    if (!user) {
      setState({ family: null, role: null, permissions: {}, loading: false })
      return
    }
    const { data } = await supabase
      .from('family_members')
      .select('role, families(id, name, created_at, home_state)')
      .eq('user_id', user.id)
    // The UI uses only the first (oldest) family for now; the schema supports many.
    const rows = ((data ?? []) as unknown as Membership[]).sort((a, b) =>
      a.families.created_at.localeCompare(b.families.created_at),
    )
    const first = rows[0]
    let permissions: Record<string, Level> = {}
    if (first?.role === 'member') {
      const { data: perms } = await supabase
        .from('module_permissions')
        .select('module, access')
        .eq('family_id', first.families.id)
        .eq('user_id', user.id)
      permissions = Object.fromEntries((perms ?? []).map((p) => [p.module, p.access as Level]))
    }
    setState({
      family: first
        ? { id: first.families.id, name: first.families.name, home_state: first.families.home_state }
        : null,
      role: first?.role ?? null,
      permissions,
      loading: false,
    })
  }, [user])

  useEffect(() => {
    if (user) setState((s) => ({ ...s, loading: true }))
    reload()
  }, [user, reload])

  return <FamilyContext.Provider value={{ ...state, reload }}>{children}</FamilyContext.Provider>
}

export function useFamily() {
  const ctx = useContext(FamilyContext)
  if (!ctx) throw new Error('useFamily must be used inside FamilyProvider')
  return ctx
}
