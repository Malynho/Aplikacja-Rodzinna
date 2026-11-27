import type { Dispatch, SetStateAction } from 'react'

export type Row = { id: string; updated_at: string }

// Merges a Realtime row into the map. Idempotent, so our own change arriving twice is harmless,
// and an older event never overwrites a newer row. A DELETE event removes the row.
export function applyChange<T extends Row>(set: Dispatch<SetStateAction<Map<string, T>>>) {
  return (payload: { eventType?: string; new: Record<string, unknown>; old?: Record<string, unknown> }) => {
    if (payload.eventType === 'DELETE') {
      const id = payload.old?.id as string | undefined
      if (id) {
        set((prev) => {
          if (!prev.has(id)) return prev
          const next = new Map(prev)
          next.delete(id)
          return next
        })
      }
      return
    }
    const row = payload.new as unknown as T
    if (!row?.id) return
    set((prev) => {
      const current = prev.get(row.id)
      if (current && current.updated_at > row.updated_at) return prev
      return new Map(prev).set(row.id, row)
    })
  }
}
