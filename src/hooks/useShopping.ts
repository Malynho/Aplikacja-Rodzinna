import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { supabase } from '../lib/supabase'
import { STARTER_PRODUCTS } from '../pages/kitchen/starterProducts'
import type { Product, ProductValues, ShoppingItem } from '../pages/kitchen/products'

const RECENT_LIMIT = 20

type Row = { id: string; updated_at: string }
type ErrorKey = 'alreadyOnList' | 'error'

// Merges a Realtime row into the map. Idempotent, so our own change arriving twice is harmless,
// and an older event never overwrites a newer row.
function applyChange<T extends Row>(set: Dispatch<SetStateAction<Map<string, T>>>) {
  return (payload: { new: Record<string, unknown> }) => {
    const row = payload.new as unknown as T
    if (!row?.id) return
    set((prev) => {
      const current = prev.get(row.id)
      if (current && current.updated_at > row.updated_at) return prev
      return new Map(prev).set(row.id, row)
    })
  }
}

// Products and shopping list of one family, kept live via Supabase Realtime.
// Actions only write to the database; the UI updates from the Realtime event (no double writes).
export function useShopping(familyId: string) {
  const [products, setProducts] = useState<Map<string, Product>>(new Map())
  const [items, setItems] = useState<Map<string, ShoppingItem>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const subscribed = useRef(false)

  const load = useCallback(async () => {
    const [p, open, deleted] = await Promise.all([
      supabase.from('products').select('*').eq('family_id', familyId),
      supabase.from('shopping_items').select('*').eq('family_id', familyId).is('deleted_at', null),
      supabase
        .from('shopping_items')
        .select('*')
        .eq('family_id', familyId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(RECENT_LIMIT),
    ])
    setProducts(new Map((p.data ?? []).map((r: Product) => [r.id, r])))
    setItems(new Map([...(open.data ?? []), ...(deleted.data ?? [])].map((r: ShoppingItem) => [r.id, r])))
    setLoaded(true)
  }, [familyId])

  useEffect(() => {
    const filter = `family_id=eq.${familyId}`
    const channel = supabase
      .channel(`kitchen:${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter }, applyChange(setProducts))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, applyChange(setItems))
      .subscribe((status) => {
        subscribed.current = status === 'SUBSCRIBED'
        // Load after subscribing so no change is missed; also (re)load when the connection fails or returns.
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') load()
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [familyId, load])

  // Runs a write. Without a live Realtime connection the view is refreshed by hand.
  async function run(op: PromiseLike<{ error: { code?: string } | null }>) {
    const { error: err } = await op
    setError(err ? (err.code === '23505' ? 'alreadyOnList' : 'error') : null)
    if (!subscribed.current) await load()
    return !err
  }

  const view = useMemo(() => {
    const all = [...products.values()]
    const allItems = [...items.values()]
    const openItems = allItems.filter((i) => !i.deleted_at)
    return {
      products: all.filter((p) => !p.deleted_at),
      archived: all.filter((p) => p.deleted_at),
      items: openItems,
      recent: allItems
        .filter((i) => i.deleted_at)
        .sort((a, b) => b.deleted_at!.localeCompare(a.deleted_at!))
        .slice(0, RECENT_LIMIT),
      quantities: new Map(openItems.filter((i) => !i.checked).map((i) => [i.product_id, i.quantity])),
    }
  }, [products, items])

  const hasSeeded = useMemo(() => [...products.values()].some((p) => p.seed_key), [products])

  return {
    ...view,
    productById: products,
    loaded,
    hasSeeded,
    error,
    changeQuantity: (productId: string, delta: number) =>
      run(supabase.rpc('change_shopping_quantity', { fid: familyId, pid: productId, delta })),
    setChecked: (id: string, checked: boolean) =>
      run(supabase.from('shopping_items').update({ checked }).eq('id', id)),
    // Soft delete / restore for both tables (deleted_at = null means active).
    setDeleted: (table: 'shopping_items' | 'products', ids: string[], deleted: boolean) =>
      run(
        supabase
          .from(table)
          .update({ deleted_at: deleted ? new Date().toISOString() : null })
          .in('id', ids),
      ),
    createProduct: (values: ProductValues) =>
      run(supabase.from('products').insert({ family_id: familyId, ...values })),
    updateProduct: (id: string, values: ProductValues) =>
      run(supabase.from('products').update(values).eq('id', id)),
    // Adds the starter catalog once; existing (family_id, seed_key) pairs are skipped.
    seed: () =>
      run(
        supabase.from('products').upsert(
          STARTER_PRODUCTS.map(({ key, emoji, category }) => ({
            family_id: familyId,
            seed_key: key,
            emoji,
            category,
          })),
          { onConflict: 'family_id,seed_key', ignoreDuplicates: true },
        ),
      ),
  }
}
