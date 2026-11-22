import { useRef, useState, type ChangeEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModuleAccess } from '../../hooks/useModuleAccess'
import type { KitchenData } from '../../hooks/useKitchen'
import { UndoToast, useUndo } from '../../components/UndoToast'
import { photoToBase64Jpeg } from '../../lib/image'
import { OwnProducts } from './OwnProducts'
import { ProductGrid } from './ProductGrid'
import { productLabel, type Product, type ReceiptItem, type ReceiptLine, type ShoppingItem } from './products'
import { ReceiptReview } from './ReceiptReview'
import { ShoppingList } from './ShoppingList'

const VIEWS = ['products', 'list', 'own'] as const
type View = (typeof VIEWS)[number]

export function Shopping() {
  const { t } = useTranslation()
  const shop = useOutletContext<KitchenData>()
  const canWrite = useModuleAccess('kitchen') === 'write'
  const undo = useUndo()
  const [view, setView] = useState<View>('products')
  const fileInput = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptItem[] | null>(null) // lines waiting for confirmation

  const nameOf = (productId: string) => {
    const p = shop.productById.get(productId)
    return p ? productLabel(p, t) : ''
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

  // Photo -> shrink -> Edge Function -> confirmation screen. Nothing is saved at this point.
  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets the same file be picked again
    if (!file) return
    setScanError(null)
    setScanning(true)
    try {
      const result = await shop.scanReceipt(await photoToBase64Jpeg(file))
      if ('error' in result) setScanError(result.error)
      else if (result.items.length === 0) setScanError('empty')
      else setReceipt(result.items)
    } catch {
      setScanError('image')
    } finally {
      setScanning(false)
    }
  }

  async function applyReceipt(lines: ReceiptLine[]) {
    const result = await shop.applyReceipt(lines)
    if (!result) return false
    setReceipt(null)
    undo.show(t('kitchen.receipt.done', { cleared: result.cleared, pantry: result.pantry }))
    return true
  }

  const custom = shop.products.filter((p) => !p.seed_key)
  const customArchived = shop.archived.filter((p) => !p.seed_key)

  return (
    <>
      <h1>{t('kitchen.tabs.shopping')}</h1>
      {receipt ? (
        <>
          {shop.error && <p className="error">{t(`kitchen.shopping.${shop.error}`)}</p>}
          <ReceiptReview
            items={receipt}
            products={shop.products}
            onApply={applyReceipt}
            onCancel={() => setReceipt(null)}
          />
        </>
      ) : (
        <>
          {canWrite && (
            <div className="row toolbar">
              <button className="primary" disabled={scanning} onClick={() => fileInput.current?.click()}>
                {t(scanning ? 'kitchen.receipt.scanning' : 'kitchen.receipt.scan')}
              </button>
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPhoto} />
              <span className="muted grow">{t('kitchen.receipt.privacy')}</span>
            </div>
          )}
          {scanError && <p className="error">{t(`kitchen.receipt.errors.${scanError}`)}</p>}
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
        </>
      )}
      <UndoToast toast={undo.toast} dismiss={undo.dismiss} />
    </>
  )
}
