import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProductForm } from './ProductForm'
import {
  CATEGORIES,
  CATEGORY_ICONS,
  productLabel,
  type Product,
  type ProductValues,
  type ReceiptItem,
  type ReceiptLine,
} from './products'

const SKIP = '__skip'
const NEW = '__new'

interface Props {
  items: ReceiptItem[]
  products: Product[]
  onApply: (lines: ReceiptLine[]) => Promise<boolean>
  onCancel: () => void
}

interface Row {
  item: ReceiptItem
  choice: string // a product id, SKIP or NEW
  quantity: string
  newProduct: ProductValues | null
  editingNew: boolean
}

const toQuantity = (value: string) => Math.max(1, Math.floor(Number(value)) || 1)

// Mandatory confirmation step: nothing changes in the database until "Approve".
export function ReceiptReview({ items, products, onApply, onCancel }: Props) {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item) => ({
      item,
      // an uncertain line stays on "skip" until the user picks a product
      choice: item.product_id && !item.uncertain ? item.product_id : SKIP,
      quantity: String(item.quantity),
      newProduct: null,
      editingNew: false,
    })),
  )
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false) // blocks a second approval even within the same tick

  const named = products
    .map((p) => ({ product: p, name: productLabel(p, t) }))
    .sort((a, b) => a.name.localeCompare(b.name, i18n.language))

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function choose(index: number, value: string) {
    if (value === NEW) update(index, { choice: NEW, editingNew: true })
    else update(index, { choice: value, newProduct: null, editingNew: false })
  }

  // Lines to apply; an alias is learned only where the user matched or changed the product.
  const lines = rows.flatMap<ReceiptLine>((r) => {
    if (r.choice === SKIP) return []
    const quantity = toQuantity(r.quantity)
    if (r.choice === NEW) {
      return r.newProduct ? [{ product_id: null, new_product: r.newProduct, quantity, alias: r.item.raw_text }] : []
    }
    return [
      {
        product_id: r.choice,
        new_product: null,
        quantity,
        // learn when the user matched or changed the product, or confirmed an uncertain suggestion
        alias: r.choice !== r.item.product_id || r.item.uncertain ? r.item.raw_text : null,
      },
    ]
  })
  const formOpen = rows.some((r) => r.editingNew)

  async function approve() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    const ok = await onApply(lines)
    // On success the parent closes this screen; on failure allow another try.
    if (!ok) {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <h2>{t('kitchen.receipt.reviewTitle')}</h2>
      <div className="stack">
        {rows.map((r, index) => {
          // Flagged until the user picks a product: no match at all, or the model was unsure.
          const flagged = r.choice === SKIP && (r.item.product_id === null || r.item.uncertain)
          const suggested = r.item.uncertain ? products.find((p) => p.id === r.item.product_id) : undefined
          return (
            <div key={index} className={`card stack ${flagged ? 'unmatched' : ''}`}>
              <div className="row">
                <span className="grow muted">{r.item.raw_text}</span>
                {flagged && (
                  <span className="tag-warning">
                    {t(r.item.product_id === null ? 'kitchen.receipt.unmatched' : 'kitchen.receipt.uncertain')}
                  </span>
                )}
              </div>
              {flagged && suggested && (
                <p className="muted">{t('kitchen.receipt.suggestion', { name: productLabel(suggested, t) })}</p>
              )}
              <div className="row">
                <select
                  className="input grow"
                  value={r.choice}
                  disabled={busy}
                  onChange={(e) => choose(index, e.target.value)}
                >
                  <option value={SKIP}>{t('kitchen.receipt.skip')}</option>
                  <option value={NEW}>{t('kitchen.receipt.newProduct')}</option>
                  {CATEGORIES.map((category) => {
                    const group = named.filter((x) => x.product.category === category)
                    if (group.length === 0) return null
                    return (
                      <optgroup key={category} label={t(`kitchen.categories.${category}`)}>
                        {group.map(({ product, name }) => (
                          <option key={product.id} value={product.id}>
                            {product.emoji} {name}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
                <input
                  className="input qty-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  aria-label={t('kitchen.receipt.quantity')}
                  value={r.quantity}
                  disabled={busy || r.choice === SKIP}
                  onChange={(e) => update(index, { quantity: e.target.value })}
                />
              </div>
              {r.editingNew && (
                <ProductForm
                  // the package size printed on the receipt line is only a suggestion for a NEW product
                  initial={{
                    name: r.item.raw_text,
                    emoji: CATEGORY_ICONS.other,
                    category: 'other',
                    pack_size: r.item.pack_size,
                    pack_unit: r.item.pack_unit,
                  }}
                  onSubmit={(values) => update(index, { newProduct: values, editingNew: false })}
                  onCancel={() => update(index, { choice: SKIP, newProduct: null, editingNew: false })}
                />
              )}
              {r.choice === NEW && r.newProduct && (
                <p className="muted">
                  {t('kitchen.receipt.newLabel', { name: `${r.newProduct.emoji} ${r.newProduct.name}` })}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <div className="row toolbar section">
        <button className="primary" disabled={busy || formOpen || lines.length === 0} onClick={approve}>
          {t(busy ? 'kitchen.receipt.approving' : 'kitchen.receipt.approve')}
        </button>
        <button className="link-btn" disabled={busy} onClick={onCancel}>
          {t('kitchen.custom.cancel')}
        </button>
      </div>
    </>
  )
}
