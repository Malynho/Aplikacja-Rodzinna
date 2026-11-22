import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProductForm } from './ProductForm'
import type { Product, ProductValues } from './products'

interface Props {
  products: Product[] // custom products only (seed_key is null)
  archived: Product[]
  canWrite: boolean
  onCreate: (values: ProductValues) => Promise<boolean>
  onUpdate: (id: string, values: ProductValues) => Promise<boolean>
  onArchive: (product: Product) => void
  onUnarchive: (product: Product) => void
}

// Custom products of the family: add, edit, archive and restore.
export function OwnProducts({ products, archived, canWrite, onCreate, onUpdate, onArchive, onUnarchive }: Props) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<string | 'new' | null>(null) // product id, "new" or nothing

  async function save(id: string | null, values: ProductValues) {
    const ok = id ? await onUpdate(id, values) : await onCreate(values)
    if (ok) setEditing(null)
  }

  return (
    <>
      <section className="section">
        <div className="row">
          <h3 className="grow">{t('kitchen.custom.title')}</h3>
          {canWrite && editing === null && (
            <button className="primary" onClick={() => setEditing('new')}>
              {t('kitchen.custom.add')}
            </button>
          )}
        </div>
        {editing === 'new' && <ProductForm onSubmit={(v) => save(null, v)} onCancel={() => setEditing(null)} />}
        {products.length === 0 && editing !== 'new' && <p className="muted">{t('kitchen.custom.empty')}</p>}
        <div className="list">
          {products.map((p) =>
            editing === p.id ? (
              <ProductForm
                key={p.id}
                initial={{ name: p.name ?? '', emoji: p.emoji, category: p.category }}
                onSubmit={(v) => save(p.id, v)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={p.id} className="list-row card">
                <span className="grow">
                  <span className="list-emoji">{p.emoji}</span>
                  {p.name}
                </span>
                {canWrite && (
                  <>
                    <button className="link-btn" onClick={() => setEditing(p.id)}>
                      {t('kitchen.custom.edit')}
                    </button>
                    <button className="link-btn" onClick={() => onArchive(p)}>
                      {t('kitchen.custom.archive')}
                    </button>
                  </>
                )}
              </div>
            ),
          )}
        </div>
      </section>
      {archived.length > 0 && (
        <section className="section">
          <h3>{t('kitchen.custom.archived')}</h3>
          <div className="list">
            {archived.map((p) => (
              <div key={p.id} className="list-row card">
                <span className="grow muted">
                  <span className="list-emoji">{p.emoji}</span>
                  {p.name}
                </span>
                {canWrite && (
                  <button className="link-btn" onClick={() => onUnarchive(p)}>
                    {t('kitchen.custom.unarchive')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
