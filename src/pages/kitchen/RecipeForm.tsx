import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProductPicker } from './ProductPicker'
import { productName, type Product } from './products'
import {
  COUNTRIES,
  RECIPE_UNITS,
  flag,
  type Ingredient,
  type IngredientValues,
  type Recipe,
  type RecipeUnit,
  type RecipeValues,
} from './recipeTypes'

interface Props {
  recipe?: Recipe // undefined = new recipe
  ingredients: Ingredient[]
  products: Product[] // active catalog
  productById: Map<string, Product>
  onSave: (values: RecipeValues, ingredients: IngredientValues[]) => Promise<boolean>
  onCancel: () => void
}

interface Row {
  key: string
  product_id: string | null
  name: string // text ingredients only; catalog ones show the product name
  amount: string
  unit: RecipeUnit
  staple: boolean
}

const MAX_INGREDIENTS = 60

// Default unit for a catalog product: the family of its package unit.
function defaultUnit(product: Product): RecipeUnit {
  if (product.pack_unit === 'g' || product.pack_unit === 'kg') return 'g'
  if (product.pack_unit === 'ml' || product.pack_unit === 'l') return 'ml'
  return 'pcs'
}

// Add / edit a recipe: basics, ingredients (catalog or text), steps. The recipe keeps its language.
export function RecipeForm({ recipe, ingredients, products, productById, onSave, onCancel }: Props) {
  const { t, i18n } = useTranslation()
  const [title, setTitle] = useState(recipe?.title ?? '')
  const [country, setCountry] = useState(recipe?.country ?? '')
  const [servings, setServings] = useState(String(recipe?.servings ?? 4))
  const [minutes, setMinutes] = useState(recipe?.minutes != null ? String(recipe.minutes) : '')
  const [steps, setSteps] = useState(recipe?.steps ?? '')
  const [rows, setRows] = useState<Row[]>(() =>
    ingredients.map((i) => ({
      key: i.id,
      product_id: i.product_id,
      name: i.name,
      amount: String(i.amount),
      unit: i.unit,
      staple: i.staple,
    })),
  )
  const [busy, setBusy] = useState(false)

  const nameOf = (row: Row) => {
    const p = row.product_id ? productById.get(row.product_id) : undefined
    return p && !p.deleted_at ? productName(p, t) : row.name
  }
  const servingsNum = Math.floor(Number(servings))
  const valid =
    title.trim() !== '' &&
    servingsNum >= 1 &&
    servingsNum <= 100 &&
    rows.every((r) => Number(r.amount) > 0 && nameOf(r).trim() !== '')

  const add = (row: Omit<Row, 'key' | 'amount' | 'staple'>) =>
    setRows((prev) => [...prev, { ...row, key: crypto.randomUUID(), amount: '1', staple: false }])
  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  function move(index: number, by: number) {
    setRows((prev) => {
      const next = [...prev]
      ;[next[index], next[index + by]] = [next[index + by], next[index]]
      return next
    })
  }

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    const ok = await onSave(
      {
        title: title.trim(),
        lang: recipe?.lang ?? (i18n.language.startsWith('pl') ? 'pl' : 'de'),
        country: country || null,
        servings: servingsNum,
        minutes: Number(minutes) > 0 ? Math.floor(Number(minutes)) : null,
        steps: steps.trim(),
      },
      rows.map((r) => ({
        product_id: r.product_id,
        name: nameOf(r).trim().slice(0, 80),
        amount: Number(r.amount),
        unit: r.unit,
        staple: r.staple,
      })),
    )
    if (!ok) setBusy(false) // on success the parent leaves this screen
  }

  return (
    <div className="card stack">
      <label className="field">
        {t('kitchen.recipes.title')}
        <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="row">
        <label className="field grow">
          {t('kitchen.recipes.country')}
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{t('kitchen.countries.other')}</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {flag(c)} {t(`kitchen.countries.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field qty-input">
          {t('kitchen.recipes.servings')}
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </label>
        <label className="field qty-input">
          {t('kitchen.recipes.minutes')}
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
      </div>

      <h3>{t('kitchen.recipes.ingredients')}</h3>
      {rows.map((row, index) => (
        <div key={row.key} className="stack">
          <div className="row">
            <span className="grow">{nameOf(row)}</span>
            <button aria-label={t('kitchen.recipes.moveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
              ↑
            </button>
            <button
              aria-label={t('kitchen.recipes.moveDown')}
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              aria-label={t('kitchen.shopping.remove')}
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            >
              ✕
            </button>
          </div>
          <div className="row">
            <input
              className="input qty-input"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              aria-label={t('kitchen.recipes.amount')}
              value={row.amount}
              onChange={(e) => update(row.key, { amount: e.target.value })}
            />
            <select
              className="input"
              aria-label={t('kitchen.recipes.unit')}
              value={row.unit}
              onChange={(e) => update(row.key, { unit: e.target.value as RecipeUnit })}
            >
              {RECIPE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`kitchen.units.${u}`)}
                </option>
              ))}
            </select>
            <label className="row">
              <input
                type="checkbox"
                className="check"
                checked={row.staple}
                onChange={(e) => update(row.key, { staple: e.target.checked })}
              />
              {t('kitchen.recipes.staple')}
            </label>
          </div>
        </div>
      ))}
      <ProductPicker
        products={products}
        disabled={rows.length >= MAX_INGREDIENTS}
        onPick={(p) => add({ product_id: p.id, name: productName(p, t), unit: defaultUnit(p) })}
        onText={(name) => add({ product_id: null, name, unit: 'pcs' })}
      />

      <label className="field">
        {t('kitchen.recipes.steps')}
        <textarea className="input" rows={6} maxLength={10000} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>

      <div className="row">
        <button className="primary" disabled={!valid || busy} onClick={save}>
          {t('kitchen.custom.save')}
        </button>
        <button className="link-btn" onClick={onCancel}>
          {t('kitchen.custom.cancel')}
        </button>
      </div>
    </div>
  )
}
