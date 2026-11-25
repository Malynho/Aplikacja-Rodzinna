import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Display names of family members by user id ('' when a profile has no name).
export function useNames(ids: string[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const key = [...new Set(ids)].sort().join(',')

  useEffect(() => {
    if (!key) return
    supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', key.split(','))
      .then(({ data }) =>
        setNames(new Map((data ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? '']))),
      )
  }, [key])

  return names
}
