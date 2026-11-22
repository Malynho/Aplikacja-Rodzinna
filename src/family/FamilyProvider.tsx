import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export interface Family {
  id: string
  name: string
}
type Role = 'admin' | 'member'

interface FamilyState {
  family: Family | null
  role: Role | null
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
    loading: true,
  })

  const reload = useCallback(async () => {
    if (!user) {
      setState({ family: null, role: null, loading: false })
      return
    }
    const { data } = await supabase
      .from('family_members')
      .select('role, families(id, name, created_at)')
      .eq('user_id', user.id)
    // The UI uses only the first (oldest) family for now; the schema supports many.
    const rows = ((data ?? []) as unknown as Membership[]).sort((a, b) =>
      a.families.created_at.localeCompare(b.families.created_at),
    )
    const first = rows[0]
    setState({
      family: first ? { id: first.families.id, name: first.families.name } : null,
      role: first?.role ?? null,
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
