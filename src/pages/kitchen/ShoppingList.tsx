import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, productName, type Product, type ShoppingItem } from './products'

const LEAVE_MS = 250 // fade-out time before a ticked item is written as bought

interface Props {
  items: ShoppingItem[]
  recent: ShoppingItem[]
  products: Map<string, Product>
  canWrite: boolean
  onChecked: (item: ShoppingItem, checked: boolean) => Promise<boolean>
  onQuantity: (item: ShoppingItem, delta: number) => void
  onRemove: (item: ShoppingItem) => void
  onRestore: (item: ShoppingItem) => void
}

export function ShoppingList({ items, recent, products, canWrite, onChecked, onQuantity, onRemove, onRestore }: Props) {
  const { t, i18n } = useTranslation()
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const [showRecent, setShowRecent] = useState(false)

  // Forget ids of items that are gone, so an undone item shows up normally again.
  useEffect(() => {
    setLeaving((prev) => {
      const ids = new Set(items.map((i) => i.id))
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  async function check(item: ShoppingItem, checked: boolean) {
    if (!checked) {
      onChecked(item, false)
      return
    }
    setLeaving((prev) => new Set(prev).add(item.id))
    await new Promise((resolve) => setTimeout(resolve, LEAVE_MS))
    const ok = await onChecked(item, true)
    // Write failed: show the row again.
    if (!ok) {
      setLeaving((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const info = (item: ShoppingItem) => {
    const p = products.get(item.product_id)
    return {
      emoji: p?.emoji ?? '',
      name: p ? productName(p, t) : '',
      order: p ? CATEGORIES.indexOf(p.category) : CATEGORIES.length,
    }
  }
  const sorted = [...items].sort((a, b) => {
    const x = info(a)
    const y = info(b)
    return x.order - y.order || x.name.localeCompare(y.name, i18n.language)
  })
  // Products that already have an open row: restoring another one would duplicate it.
  const openProducts = new Set(sorted.filter((i) => !i.checked).map((i) => i.product_id))

  const row = (item: ShoppingItem) => {
    const { emoji, name } = info(item)
    return (
      <div key={item.id} className={`list-row ${item.checked ? 'done' : ''} ${leaving.has(item.id) ? 'leaving' : ''}`}>
        <input
          type="checkbox"
          className="check"
          checked={item.checked}
          disabled={!canWrite}
          onChange={(e) => check(item, e.target.checked)}
        />
        <span className="grow">
          <span className="list-emoji">{emoji}</span>
          {name}
        </span>
        {canWrite && !item.checked ? (
          <div className="stepper">
            <button className="icon-btn" aria-label={t('kitchen.shopping.decrease')} onClick={() => onQuantity(item, -1)}>
              −
            </button>
            <span className="qty">{item.quantity}</span>
            <button className="icon-btn" aria-label={t('kitchen.shopping.increase')} onClick={() => onQuantity(item, 1)}>
              +
            </button>
          </div>
        ) : (
          <span className="qty">×{item.quantity}</span>
        )}
        {canWrite && (
          <button className="icon-btn" aria-label={t('kitchen.shopping.remove')} onClick={() => onRemove(item)}>
            ✕
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {items.length === 0 && <p className="muted">{t('kitchen.shopping.listEmpty')}</p>}
      {sorted.length > 0 && (
        <section className="section">
          <h3>{t('kitchen.shopping.toBuy')}</h3>
          <div className="card list">{sorted.map(row)}</div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="section">
          <button className="link-btn" aria-expanded={showRecent} onClick={() => setShowRecent((s) => !s)}>
            {t('kitchen.shopping.recentlyDeleted', { count: recent.length })}
          </button>
          {showRecent && (
            <div className="card list">
              {recent.map((item) => {
                const { emoji, name } = info(item)
                const blocked = openProducts.has(item.product_id)
                return (
                  <div key={item.id} className="list-row">
                    <span className="grow muted">
                      <span className="list-emoji">{emoji}</span>
                      {name} ×{item.quantity}
                    </span>
                    {canWrite && !blocked && (
                      <button className="link-btn" onClick={() => onRestore(item)}>
                        {t('kitchen.shopping.restore')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </>
  )
}
