import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, productName, type Product } from './products'

interface Props {
  products: Product[]
  quantities: Map<string, number>
  canWrite: boolean
  onChange: (productId: string, delta: number) => void
}

// Tiles grouped by category with search. Tap = +1; + and − appear once the item is on the list.
export function ProductGrid({ products, quantities, canWrite, onChange }: Props) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const named = products
    .map((p) => ({ product: p, name: productName(p, t) }))
    .filter((x) => x.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, i18n.language))

  return (
    <>
      <input
        className="input search"
        type="search"
        placeholder={t('kitchen.shopping.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {named.length === 0 && <p className="muted">{t('kitchen.shopping.noResults')}</p>}
      {CATEGORIES.map((category) => {
        const group = named.filter((x) => x.product.category === category)
        if (group.length === 0) return null
        return (
          <section key={category} className="section">
            <h3>{t(`kitchen.categories.${category}`)}</h3>
            <div className="tiles">
              {group.map(({ product, name }) => {
                const qty = quantities.get(product.id) ?? 0
                return (
                  <div key={product.id} className={`tile ${qty > 0 ? 'selected' : ''}`}>
                    <button
                      className="tile-main"
                      disabled={!canWrite}
                      onClick={() => onChange(product.id, 1)}
                    >
                      <span className="tile-emoji">{product.emoji}</span>
                      <span className="tile-name">{name}</span>
                      {qty > 0 && <span className="badge">{qty}</span>}
                    </button>
                    {qty > 0 && canWrite && (
                      <div className="tile-qty">
                        <button aria-label={t('kitchen.shopping.decrease')} onClick={() => onChange(product.id, -1)}>
                          −
                        </button>
                        <button aria-label={t('kitchen.shopping.increase')} onClick={() => onChange(product.id, 1)}>
                          +
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}
