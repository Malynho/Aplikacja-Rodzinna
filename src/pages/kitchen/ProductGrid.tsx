import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection, useOpenSections } from '../../components/CollapsibleSection'
import { CATEGORIES, CATEGORY_ICONS, productLabel, type PantryStatus, type Product } from './products'

interface Props {
  products: Product[]
  quantities: Map<string, number>
  canWrite: boolean
  onChange: (productId: string, delta: number) => void
  storageKey: string // sessionStorage key for the expanded categories (one per view)
  // Optional, used by the pantry: tap opens the product instead of +1, text on the badge (null = none),
  // status styling, + / − shown on every tile, and which products count as "running low".
  onOpen?: (productId: string) => void
  badge?: (productId: string) => string | null
  status?: (productId: string) => PantryStatus
  alwaysControls?: boolean
  isLow?: (productId: string) => boolean
  expandAll?: boolean // open every category with results (e.g. while a filter is on); not remembered
}

// Collapsible category sections with tiles and search. Tap = +1; + and − appear once the item is on the list.
export function ProductGrid({
  products,
  quantities,
  canWrite,
  onChange,
  storageKey,
  onOpen,
  badge,
  status,
  alwaysControls,
  isLow,
  expandAll,
}: Props) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const { open, toggle } = useOpenSections(storageKey)
  const q = query.trim().toLowerCase()
  const forced = q !== '' || !!expandAll // a search or a filter opens every category with results

  const named = products
    .map((p) => ({ product: p, name: productLabel(p, t) })) // name + package size; the search covers both
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
        const expanded = forced || open.has(category)
        const low = isLow ? group.filter((x) => isLow(x.product.id)).length : 0
        return (
          <CollapsibleSection
            key={category}
            icon={CATEGORY_ICONS[category]}
            title={t(`kitchen.categories.${category}`)}
            count={group.length}
            extra={low > 0 && <span className="category-low">{t('kitchen.pantry.lowInCategory', { count: low })}</span>}
            expanded={expanded}
            locked={forced}
            onToggle={() => toggle(category)}
          >
            <div className="tiles">
              {group.map(({ product, name }) => {
                const qty = quantities.get(product.id) ?? 0
                const badgeText = badge ? badge(product.id) : qty > 0 ? String(qty) : null
                const st = status?.(product.id)
                return (
                  <div
                    key={product.id}
                    className={`tile ${!status && qty > 0 ? 'selected' : ''} ${st ? `status-${st}` : ''}`}
                  >
                    <button
                      className="tile-main"
                      disabled={!canWrite}
                      title={st && st !== 'untracked' ? t(`kitchen.pantry.status.${st}`) : undefined}
                      onClick={() => (onOpen ? onOpen(product.id) : onChange(product.id, 1))}
                    >
                      <span className="tile-emoji">{product.emoji}</span>
                      <span className="tile-name">{name}</span>
                      {badgeText && <span className="badge">{badgeText}</span>}
                    </button>
                    {(alwaysControls || qty > 0) && canWrite && (
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
          </CollapsibleSection>
        )
      })}
    </>
  )
}
