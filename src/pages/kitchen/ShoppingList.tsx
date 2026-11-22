import { useTranslation } from 'react-i18next'
import { CATEGORIES, productName, type Product, type ShoppingItem } from './products'

interface Props {
  items: ShoppingItem[]
  recent: ShoppingItem[]
  products: Map<string, Product>
  canWrite: boolean
  onChecked: (item: ShoppingItem, checked: boolean) => void
  onQuantity: (item: ShoppingItem, delta: number) => void
  onRemove: (item: ShoppingItem) => void
  onClearBought: () => void
  onRestore: (item: ShoppingItem) => void
}

export function ShoppingList({
  items,
  recent,
  products,
  canWrite,
  onChecked,
  onQuantity,
  onRemove,
  onClearBought,
  onRestore,
}: Props) {
  const { t, i18n } = useTranslation()

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
  const toBuy = sorted.filter((i) => !i.checked)
  const bought = sorted.filter((i) => i.checked)
  const openProducts = new Set(toBuy.map((i) => i.product_id))

  const row = (item: ShoppingItem) => {
    const { emoji, name } = info(item)
    return (
      <div key={item.id} className={`list-row ${item.checked ? 'done' : ''}`}>
        <input
          type="checkbox"
          className="check"
          checked={item.checked}
          disabled={!canWrite}
          onChange={(e) => onChecked(item, e.target.checked)}
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
      {toBuy.length > 0 && (
        <section className="section">
          <h3>{t('kitchen.shopping.toBuy')}</h3>
          <div className="card list">{toBuy.map(row)}</div>
        </section>
      )}
      {bought.length > 0 && (
        <section className="section">
          <div className="row">
            <h3 className="grow">{t('kitchen.shopping.bought')}</h3>
            {canWrite && (
              <button className="link-btn" onClick={onClearBought}>
                {t('kitchen.shopping.clearBought')}
              </button>
            )}
          </div>
          <div className="card list">{bought.map(row)}</div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="section">
          <h3>{t('kitchen.shopping.recentlyDeleted')}</h3>
          <div className="card list">
            {recent.map((item) => {
              const { emoji, name } = info(item)
              // An open row for the same product exists: restoring would duplicate it.
              const blocked = !item.checked && openProducts.has(item.product_id)
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
        </section>
      )}
    </>
  )
}
