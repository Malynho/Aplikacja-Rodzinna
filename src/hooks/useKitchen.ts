import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import i18n from '../i18n'
import { supabase } from '../lib/supabase'
import { STARTER_PRODUCTS } from '../pages/kitchen/starterProducts'
import {
  productLabel,
  runningLow,
  type Pack,
  type PantryItem,
  type PantryValues,
  type Product,
  type ProductValues,
  type ReceiptItem,
  type ReceiptLine,
  type ReceiptResult,
  type ShoppingItem,
} from '../pages/kitchen/products'

const RECENT_LIMIT = 10

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

// Products, shopping list and pantry of one family, kept live via Supabase Realtime.
// Actions only write to the database; the UI updates from the Realtime event (no double writes).
export function useKitchen(familyId: string) {
  const [products, setProducts] = useState<Map<string, Product>>(new Map())
  const [items, setItems] = useState<Map<string, ShoppingItem>>(new Map())
  const [pantry, setPantry] = useState<Map<string, PantryItem>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const subscribed = useRef(false)

  const load = useCallback(async () => {
    const [p, pan, open, deleted] = await Promise.all([
      supabase.from('products').select('*').eq('family_id', familyId),
      supabase.from('pantry_items').select('*').eq('family_id', familyId),
      supabase.from('shopping_items').select('*').eq('family_id', familyId).is('deleted_at', null),
      supabase
        .from('shopping_items')
        .select('*')
        .eq('family_id', familyId)
        .not('deleted_at', 'is', null)
        .eq('checked', false) // only manually removed items; bought ones are deleted + checked
        .order('deleted_at', { ascending: false })
        .limit(RECENT_LIMIT),
    ])
    setProducts(new Map((p.data ?? []).map((r: Product) => [r.id, r])))
    setPantry(new Map((pan.data ?? []).map((r: PantryItem) => [r.id, r])))
    setItems(new Map([...(open.data ?? []), ...(deleted.data ?? [])].map((r: ShoppingItem) => [r.id, r])))
    setLoaded(true)
  }, [familyId])

  useEffect(() => {
    const filter = `family_id=eq.${familyId}`
    const channel = supabase
      .channel(`kitchen:${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter }, applyChange(setProducts))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, applyChange(setItems))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items', filter }, applyChange(setPantry))
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
    const active = all.filter((p) => !p.deleted_at)
    const byProduct = new Map([...pantry.values()].map((r) => [r.product_id, r]))
    const allItems = [...items.values()]
    const openItems = allItems.filter((i) => !i.deleted_at)
    return {
      products: active,
      pantryByProduct: byProduct,
      lowCount: active.filter((p) => runningLow(byProduct.get(p.id))).length,
      archived: all.filter((p) => p.deleted_at),
      items: openItems,
      recent: allItems
        .filter((i) => i.deleted_at && !i.checked)
        .sort((a, b) => b.deleted_at!.localeCompare(a.deleted_at!))
        .slice(0, RECENT_LIMIT),
      quantities: new Map(openItems.filter((i) => !i.checked).map((i) => [i.product_id, i.quantity])),
    }
  }, [products, items, pantry])

  const hasSeeded = useMemo(() => [...products.values()].some((p) => p.seed_key), [products])

  return {
    ...view,
    productById: products,
    loaded,
    hasSeeded,
    error,
    changeQuantity: (productId: string, delta: number) =>
      run(supabase.rpc('change_shopping_quantity', { fid: familyId, pid: productId, delta })),
    // Bought = checked and soft-deleted in one update; undoing reverses both.
    setChecked: (id: string, checked: boolean) =>
      run(
        supabase
          .from('shopping_items')
          .update({ checked, deleted_at: checked ? new Date().toISOString() : null })
          .eq('id', id),
      ),
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
    // Pantry: +/- on Ist (atomic, never below 0). A falling Ist adds the shortage to the shopping list (DB trigger).
    changeIst: (productId: string, delta: number) =>
      run(supabase.rpc('change_pantry_ist', { fid: familyId, pid: productId, delta })),
    savePantry: (productId: string, values: PantryValues) =>
      run(
        supabase
          .from('pantry_items')
          .upsert({ family_id: familyId, product_id: productId, ...values }, { onConflict: 'family_id,product_id' }),
      ),
    // Package size of a product (both values, or both null to clear it).
    setPack: (productId: string, pack: Pack) =>
      run(supabase.from('products').update(pack).eq('id', productId)),
    // Puts every product with Soll > Ist on the shopping list (no duplicates, set to Soll - Ist).
    addShortages: () => run(supabase.rpc('add_pantry_shortages', { fid: familyId, pid: null })),
    // Receipt scan: the photo goes to the Edge Function and is not stored. Returns the lines or an error code.
    scanReceipt: async (imageBase64: string): Promise<{ items: ReceiptItem[] } | { error: string }> => {
      const pl = i18n.getFixedT('pl')
      const de = i18n.getFixedT('de')
      const catalog = [...products.values()]
        .filter((p) => !p.deleted_at)
        // names include the package size, so "Zwiebeln · 1 kg" and "Zwiebeln · 2 kg" can be told apart
        .map((p) => ({ id: p.id, names: p.seed_key ? [productLabel(p, pl), productLabel(p, de)] : [productLabel(p, de)] }))
      const { data, error: err } = await supabase.functions.invoke('scan-receipt', {
        body: { family_id: familyId, image_base64: imageBase64, catalog },
      })
      if (err) {
        let code = 'scan_failed'
        if (err instanceof FunctionsHttpError) {
          try {
            code = (await err.context.json()).error ?? code
          } catch {
            // keep the generic code
          }
        }
        return { error: ['forbidden', 'limit_reached', 'bad_request'].includes(code) ? code : 'scan_failed' }
      }
      return { items: (data?.items ?? []) as ReceiptItem[] }
    },
    // Applies a confirmed receipt in one database call. Returns the summary or null on failure.
    applyReceipt: async (lines: ReceiptLine[]): Promise<ReceiptResult | null> => {
      const { data, error: err } = await supabase.rpc('apply_receipt', { fid: familyId, lines })
      setError(err ? 'error' : null)
      if (!subscribed.current) await load()
      return err ? null : (data as ReceiptResult)
    },
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

// Shape of the data shared with the Kitchen tabs through the router outlet context.
export type KitchenData = ReturnType<typeof useKitchen>
