import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, CATEGORY_ICONS, EMOJI_CHOICES, type ProductValues } from './products'

interface Props {
  initial?: ProductValues
  onSubmit: (values: ProductValues) => void
  onCancel: () => void
}

// Name, emoji (simple picker) and category of a custom product; used for adding and editing.
export function ProductForm({ initial, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0])
  const [emoji, setEmoji] = useState(initial?.emoji ?? CATEGORY_ICONS[category])

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ name: name.trim(), emoji, category })
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <input
        className="input"
        placeholder={t('kitchen.custom.name')}
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`kitchen.categories.${c}`)}
          </option>
        ))}
      </select>
      <div className="emoji-grid" role="group" aria-label={t('kitchen.custom.emoji')}>
        {EMOJI_CHOICES.map((e) => (
          <button
            key={e}
            type="button"
            className={`emoji-btn ${e === emoji ? 'active' : ''}`}
            onClick={() => setEmoji(e)}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="primary" type="submit">
          {t('kitchen.custom.save')}
        </button>
        <button className="link-btn" type="button" onClick={onCancel}>
          {t('kitchen.custom.cancel')}
        </button>
      </div>
    </form>
  )
}
