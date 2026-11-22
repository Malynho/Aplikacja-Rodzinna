import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModuleAccess } from '../../hooks/useModuleAccess'
import type { KitchenData } from '../../hooks/useKitchen'
import { UndoToast, useUndo } from '../../components/UndoToast'
import { OwnProducts } from './OwnProducts'
import { ProductGrid } from './ProductGrid'
import { productName, type Product, type ShoppingItem } from './products'
import { ShoppingList } from './ShoppingList'

const VIEWS = ['products', 'list', 'own'] as const
type View = (typeof VIEWS)[number]

export function Shopping() {
  const { t } = useTranslation()
  const shop = useOutletContext<KitchenData>()
  const canWrite = useModuleAccess('kitchen') === 'write'
  const undo = useUndo()
  const [view, setView] = useState<View>('products')

  const nameOf = (productId: string) => {
    const p = shop.productById.get(productId)
    return p ? productName(p, t) : ''
  }

  function removeItem(item: ShoppingItem) {
    shop.setDeleted('shopping_items', [item.id], true)
    undo.show(t('kitchen.shopping.removed', { name: nameOf(item.product_id) }), () =>
      shop.setDeleted('shopping_items', [item.id], false),
    )
  }

  function changeItem(item: ShoppingItem, delta: number) {
    // Going below 1 removes the item, with undo.
    if (item.quantity + delta < 1) removeItem(item)
    else shop.changeQuantity(item.product_id, delta)
  }

  // Ticking an item marks it bought (it leaves the list); unticking restores it.
  async function check(item: ShoppingItem, checked: boolean) {
    const ok = await shop.setChecked(item.id, checked)
    if (ok && checked) {
      undo.show(t('kitchen.shopping.boughtToast', { name: nameOf(item.product_id) }), () =>
        shop.setChecked(item.id, false),
      )
    }
    return ok
  }

  function archive(product: Product) {
    shop.setDeleted('products', [product.id], true)
    undo.show(t('kitchen.custom.archivedToast', { name: product.name }), () =>
      shop.setDeleted('products', [product.id], false),
    )
  }

  const custom = shop.products.filter((p) => !p.seed_key)
  const customArchived = shop.archived.filter((p) => !p.seed_key)

  return (
    <>
      <h1>{t('kitchen.tabs.shopping')}</h1>
      <div className="segmented view-switch" role="group">
        {VIEWS.map((v) => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {t(`kitchen.shopping.views.${v}`)}
          </button>
        ))}
      </div>
      {shop.error && <p className="error">{t(`kitchen.shopping.${shop.error}`)}</p>}

      {view === 'products' && (
        <ProductGrid
          products={shop.products}
          quantities={shop.quantities}
          canWrite={canWrite}
          onChange={shop.changeQuantity}
          storageKey="kitchen:open:shopping"
        />
      )}
      {view === 'list' && (
        <ShoppingList
          items={shop.items}
          recent={shop.recent}
          products={shop.productById}
          canWrite={canWrite}
          onChecked={check}
          onQuantity={changeItem}
          onRemove={removeItem}
          onRestore={(item) => shop.setDeleted('shopping_items', [item.id], false)}
        />
      )}
      {view === 'own' && (
        <OwnProducts
          products={custom}
          archived={customArchived}
          canWrite={canWrite}
          onCreate={shop.createProduct}
          onUpdate={shop.updateProduct}
          onArchive={archive}
          onUnarchive={(p) => shop.setDeleted('products', [p.id], false)}
        />
      )}
      <UndoToast toast={undo.toast} dismiss={undo.dismiss} />
    </>
  )
}
