import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModuleAccess } from '../../hooks/useModuleAccess'
import type { KitchenData } from '../../hooks/useKitchen'
import { PantryEditor } from './PantryEditor'
import { ProductGrid } from './ProductGrid'
import { pantryStatus, productLabel, runningLow, type Pack, type PantryValues } from './products'

type Filter = 'all' | 'low'

// Pantry (Soll/Ist): stock per product, "running low" filter and shortages -> shopping list.
export function Pantry() {
  const { t } = useTranslation()
  const shop = useOutletContext<KitchenData>()
  const canWrite = useModuleAccess('kitchen') === 'write'
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<string | null>(null) // product id
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [editing])

  const pantry = shop.pantryByProduct
  const ists = new Map([...pantry.values()].map((r) => [r.product_id, r.ist])) // tile quantity = Ist
  const visible = filter === 'low' ? shop.products.filter((p) => runningLow(pantry.get(p.id))) : shop.products
  // Products whose open shopping item differs from the shortage Soll - Ist (matches add_pantry_shortages).
  const shortages = shop.products.filter((p) => {
    const r = pantry.get(p.id)
    return !!r && r.soll > r.ist && r.soll > 0 && (shop.quantities.get(p.id) ?? 0) !== r.soll - r.ist
  }).length
  const product = editing ? shop.products.find((p) => p.id === editing) : undefined

  function save(values: PantryValues, pack: Pack) {
    if (product) {
      shop.savePantry(product.id, values)
      // the package size belongs to the product; write it only when it changed
      if (pack.pack_size !== product.pack_size || pack.pack_unit !== product.pack_unit) {
        shop.setPack(product.id, pack)
      }
    }
    setEditing(null)
  }

  function used(amount: number) {
    if (product) shop.changeIst(product.id, -amount)
    setEditing(null)
  }

  return (
    <>
      <h1>{t('kitchen.tabs.pantry')}</h1>
      <div className="row toolbar">
        <div className="segmented" role="group">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            {t('kitchen.pantry.filterAll')}
          </button>
          <button className={filter === 'low' ? 'active' : ''} onClick={() => setFilter('low')}>
            {t('kitchen.pantry.filterLow', { count: shop.lowCount })}
          </button>
        </div>
        {canWrite && (
          <button className="primary" disabled={shortages === 0} onClick={() => shop.addShortages()}>
            {t('kitchen.pantry.addShortages', { count: shortages })}
          </button>
        )}
      </div>
      {shop.error && <p className="error">{t(`kitchen.shopping.${shop.error}`)}</p>}
      {product && (
        <div ref={editorRef}>
          <PantryEditor
            key={product.id}
            emoji={product.emoji}
            name={productLabel(product, t)}
            item={pantry.get(product.id)}
            pack={{ pack_size: product.pack_size, pack_unit: product.pack_unit }}
            onSave={save}
            onUsed={used}
            onClose={() => setEditing(null)}
          />
        </div>
      )}
      <ProductGrid
        products={visible}
        quantities={ists}
        canWrite={canWrite}
        onChange={shop.changeIst}
        onOpen={setEditing}
        storageKey="kitchen:open:pantry"
        isLow={(id) => runningLow(pantry.get(id))}
        expandAll={filter === 'low'}
        alwaysControls
        status={(id) => pantryStatus(pantry.get(id))}
        badge={(id) => {
          const r = pantry.get(id)
          if (!r || (r.ist === 0 && r.soll === 0)) return null
          return r.soll > 0 ? t('kitchen.pantry.ofSoll', { ist: r.ist, soll: r.soll }) : String(r.ist)
        }}
      />
    </>
  )
}
