import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { productLabel, type Product } from './products'

interface Props {
  products: Product[]
  disabled?: boolean
  onPick: (product: Product) => void // a catalog product
  onText: (text: string) => void // a free-text ingredient (no product_id)
}

const MAX_RESULTS = 8

// Search field for recipe ingredients: pick from the family catalog or add the text as it is.
export function ProductPicker({ products, disabled, onPick, onText }: Props) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const q = query.trim()
  const found =
    q === ''
      ? []
      : products
          .map((p) => ({ product: p, name: productLabel(p, t) }))
          .filter((x) => x.name.toLowerCase().includes(q.toLowerCase()))
          .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
          .slice(0, MAX_RESULTS)

  function done(action: () => void) {
    action()
    setQuery('')
  }

  return (
    <div className="stack">
      <input
        className="input search"
        type="search"
        placeholder={t('kitchen.recipes.pickProduct')}
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
      />
      {found.map(({ product, name }) => (
        <button key={product.id} className="link-btn" onClick={() => done(() => onPick(product))}>
          <span className="list-emoji">{product.emoji}</span>
          {name}
        </button>
      ))}
      {q !== '' && (
        <button className="link-btn" onClick={() => done(() => onText(q.slice(0, 80)))}>
          {t('kitchen.recipes.addAsText', { name: q.slice(0, 80) })}
        </button>
      )}
    </div>
  )
}
