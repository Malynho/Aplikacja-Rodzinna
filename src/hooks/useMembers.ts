import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNames } from './useNames'

export interface Member {
  user_id: string
  name: string // '' when a profile has no name
}

// The members of a family with their names, sorted by name (the list is visible to every member).
export function useMembers(familyId: string): Member[] {
  const [ids, setIds] = useState<string[]>([])
  const names = useNames(ids)

  useEffect(() => {
    supabase
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId)
      .then(({ data }) => setIds((data ?? []).map((r) => r.user_id as string)))
  }, [familyId])

  return ids
    .map((id) => ({ user_id: id, name: names.get(id) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.user_id.localeCompare(b.user_id))
}
