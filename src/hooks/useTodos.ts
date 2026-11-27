import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyChange } from '../lib/realtime'
import { supabase } from '../lib/supabase'
import type { Todo, TodoValues } from '../pages/todo/todos'

const DONE_DAYS = 30 // done to-dos are loaded for this long

// The family's to-dos (the family ones and the user's own private ones; RLS decides), kept live via Realtime.
// Actions only write to the database; the list updates from the change event (no double writes).
export function useTodos(familyId: string, userId: string) {
  const [map, setMap] = useState<Map<string, Todo>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null) // the database's message of the last failed write
  const subscribed = useRef(false)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - DONE_DAYS * 86_400_000).toISOString()
    const { data } = await supabase
      .from('todos')
      .select('*')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .or(`done_at.is.null,done_at.gte.${since}`)
    setMap(new Map(((data ?? []) as Todo[]).map((r) => [r.id, r])))
    setLoaded(true)
  }, [familyId])

  useEffect(() => {
    const channel = supabase
      .channel(`todos:${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `family_id=eq.${familyId}` }, applyChange(setMap))
      .subscribe((status) => {
        subscribed.current = status === 'SUBSCRIBED'
        // Load after subscribing so no change is missed; also (re)load when the connection fails or returns.
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') load()
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [familyId, load])

  // Runs a write. Without a live Realtime connection the list is refreshed by hand.
  async function run(op: PromiseLike<{ error: { message: string } | null }>) {
    const { error: failure } = await op
    setError(failure ? failure.message || 'error' : null)
    if (!subscribed.current) await load()
    return !failure
  }

  const todos = useMemo(() => [...map.values()].filter((t) => !t.deleted_at), [map])

  return {
    todos,
    loaded,
    error,
    add: (values: TodoValues) => run(supabase.from('todos').insert({ family_id: familyId, owner_user_id: userId, ...values })),
    update: (id: string, values: Partial<TodoValues>) => run(supabase.from('todos').update(values).eq('id', id)),
    setDone: (id: string, done: boolean) =>
      run(supabase.from('todos').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id)),
    // soft delete / restore
    setDeleted: (id: string, deleted: boolean) =>
      run(supabase.from('todos').update({ deleted_at: deleted ? new Date().toISOString() : null }).eq('id', id)),
  }
}
