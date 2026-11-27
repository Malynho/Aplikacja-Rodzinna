import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KitchenData } from '../../hooks/useKitchen'
import { bestMatch, normalizeName, pantryFirst, rankCandidates, type MatchProduct } from '../../lib/ingredientMatch'
import { supabase } from '../../lib/supabase'
import { ProductPicker } from './ProductPicker'
import { CATEGORIES, CATEGORY_ICONS, productLabel, productName, type Category } from './products'
import {
  COUNTRIES,
  RECIPE_UNITS,
  flag,
  type ImportedRecipe,
  type ImportIngredientPayload,
  type RecipeUnit,
} from './recipeTypes'

interface Props {
  recipe: ImportedRecipe
  shop: KitchenData
  left: number // imports left today
  onSaved: (recipeId: string) => void
  onCancel: () => void
}

type Choice =
  | { kind: 'product'; id: string }
  | { kind: 'new'; name: string; category: Category; emoji: string }
  | { kind: 'text' }

interface Row {
  key: string
  raw: string // the ingredient text of the source (what an alias is learned for)
  name: string
  amount: string
  unit: RecipeUnit
  staple: boolean
  uncertain: boolean
  ai: string | null // the product the model chose
  suggestion: { name: string; category: Category; emoji: string } | null
  choice: Choice
}

// Step 2 of the recipe import: everything the model read, editable. Ingredients are matched to products (the
// pantry first); nothing is saved - not even new products - until "Save" (one database call).
export function RecipeImportReview({ recipe, shop, left, onSaved, onCancel }: Props) {
  const { t, i18n } = useTranslation()
  const [aliases, setAliases] = useState<Map<string, string> | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [title, setTitle] = useState(recipe.title)
  const [country, setCountry] = useState(recipe.country ?? '')
  const [servings, setServings] = useState(String(recipe.servings ?? 4))
  const [minutes, setMinutes] = useState(recipe.minutes != null ? String(recipe.minutes) : '')
  const [steps, setSteps] = useState(recipe.steps)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // products with their names in both languages and whether the pantry holds them (soll or ist above 0)
  const products = useMemo<MatchProduct[]>(() => {
    const pl = i18n.getFixedT('pl')
    const de = i18n.getFixedT('de')
    return shop.products.map((p) => {
      const stock = shop.pantryByProduct.get(p.id)
      return {
        id: p.id,
        names: p.seed_key ? [productName(p, pl), productName(p, de)] : [productName(p, de)],
        inPantry: !!stock && (stock.soll > 0 || stock.ist > 0),
      }
    })
  }, [shop.products, shop.pantryByProduct, i18n])
  const productById = useMemo(() => new Map(shop.products.map((p) => [p.id, p])), [shop.products])

  // learned choices of this family (normalized ingredient text -> product)
  useEffect(() => {
    supabase
      .from('ingredient_aliases')
      .select('alias_text, product_id')
      .then(({ data }) => setAliases(new Map((data ?? []).map((a) => [a.alias_text as string, a.product_id as string]))))
  }, [])

  // the first match of every ingredient: the model's product (if it exists), a learned alias or a clear match
  useEffect(() => {
    if (!aliases) return
    setRows(
      recipe.ingredients.map((i) => {
        const text = i.raw_text || i.name
        const best = i.product_id && productById.has(i.product_id) ? i.product_id : (bestMatch(text, products, aliases)?.productId ?? null)
        return {
          key: crypto.randomUUID(),
          raw: text,
          name: i.name,
          amount: String(i.amount),
          unit: i.unit,
          staple: i.staple,
          uncertain: i.uncertain,
          ai: i.product_id,
          suggestion: i.new_product,
          choice: best ? { kind: 'product', id: best } : { kind: 'text' },
        }
      }),
    )
    // computed once, when the learned aliases have arrived
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aliases])

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  // the three best products for a row (the pantry on top); the chosen one is always shown
  function candidatesOf(row: Row) {
    const list = pantryFirst(rankCandidates(row.raw || row.name, products, aliases ?? new Map(), 3))
    if (row.choice.kind === 'product' && !list.some((c) => c.productId === (row.choice as { id: string }).id)) {
      const chosen = products.find((p) => p.id === (row.choice as { id: string }).id)
      if (chosen) list.unshift({ productId: chosen.id, score: 1, inPantry: chosen.inPantry, fromAlias: false })
    }
    return list
  }

  const servingsNum = Math.floor(Number(servings))
  const valid =
    title.trim() !== '' &&
    servingsNum >= 1 &&
    servingsNum <= 100 &&
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.name.trim() !== '' &&
        Number(r.amount) > 0 &&
        (r.choice.kind !== 'new' || (r.choice.name.trim() !== '' && r.choice.name.trim().length <= 60)),
    )

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    setFailed(false)
    const ingredients: ImportIngredientPayload[] = rows.map((r) => {
      const base = { name: r.name.trim(), amount: Number(r.amount), unit: r.unit, staple: r.staple }
      const alias = normalizeName(r.raw)
      if (r.choice.kind === 'product') {
        // learn the choice when the user changed the model's product or the model had none
        return { ...base, product_id: r.choice.id, ...(r.choice.id !== r.ai && alias ? { alias } : {}) }
      }
      if (r.choice.kind === 'new') {
        return { ...base, new_product: { name: r.choice.name.trim(), category: r.choice.category, emoji: r.choice.emoji }, ...(alias ? { alias } : {}) }
      }
      return base
    })
    const id = await shop.saveRecipeImport(
      {
        title: title.trim(),
        lang: recipe.lang ?? (i18n.language.startsWith('pl') ? 'pl' : 'de'),
        country: country || null,
        servings: servingsNum,
        minutes: Number(minutes) > 0 ? Math.floor(Number(minutes)) : null,
        steps: steps.trim(),
        source_url: null,
      },
      ingredients,
    )
    if (id) onSaved(id)
    else {
      setFailed(true)
      setBusy(false)
    }
  }

  const productText = (id: string) => {
    const p = productById.get(id)
    return p ? `${p.emoji} ${productLabel(p, t)}` : '?'
  }

  if (!aliases) return <p className="muted">{t('calendar.loading')}</p>

  return (
    <div className="card stack recipe-import">
      <h2>{t('kitchen.recipes.import.reviewTitle')}</h2>
      <p className="muted">{t('kitchen.recipes.import.reviewHint')}</p>
      <p className="muted">{t('kitchen.recipes.import.left', { count: left })}</p>
      {recipe.truncated && <p className="error">{t('kitchen.recipes.import.truncated')}</p>}

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
          <input className="input" type="number" inputMode="numeric" min={1} max={100} value={servings} onChange={(e) => setServings(e.target.value)} />
        </label>
        <label className="field qty-input">
          {t('kitchen.recipes.minutes')}
          <input className="input" type="number" inputMode="numeric" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
      </div>

      <h3>{t('kitchen.recipes.ingredients')}</h3>
      {rows.map((row) => {
        const unmatched = row.choice.kind !== 'product'
        const flagged = unmatched || row.uncertain
        const cands = open === row.key ? candidatesOf(row) : []
        return (
          <div key={row.key} className={`card stack${flagged ? ' unmatched' : ''}`}>
            <div className="row">
              <input
                className="input grow"
                maxLength={80}
                aria-label={t('kitchen.custom.name')}
                value={row.name}
                onChange={(e) => update(row.key, { name: e.target.value })}
              />
              <button aria-label={t('kitchen.shopping.remove')} onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>
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
              <select className="input" aria-label={t('kitchen.recipes.unit')} value={row.unit} onChange={(e) => update(row.key, { unit: e.target.value as RecipeUnit })}>
                {RECIPE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`kitchen.units.${u}`)}
                  </option>
                ))}
              </select>
              <label className="row">
                <input type="checkbox" className="check" checked={row.staple} onChange={(e) => update(row.key, { staple: e.target.checked })} />
                {t('kitchen.recipes.staple')}
              </label>
            </div>

            <div className="row">
              <span className="grow">
                {row.choice.kind === 'product' && productText(row.choice.id)}
                {row.choice.kind === 'new' && t('kitchen.recipes.import.newProduct', { name: row.choice.name })}
                {row.choice.kind === 'text' && <span className="tag-warning">{t('kitchen.recipes.import.noMatch')}</span>}
                {row.uncertain && row.choice.kind === 'product' && <span className="tag-warning"> {t('kitchen.recipes.import.uncertain')}</span>}
              </span>
              <button className="link-btn" aria-expanded={open === row.key} onClick={() => setOpen(open === row.key ? null : row.key)}>
                {t('kitchen.recipes.import.change')}
              </button>
            </div>

            {row.choice.kind === 'new' && (
              <div className="row">
                <input
                  className="input grow"
                  maxLength={60}
                  aria-label={t('kitchen.custom.name')}
                  value={row.choice.name}
                  onChange={(e) => update(row.key, { choice: { ...(row.choice as Extract<Choice, { kind: 'new' }>), name: e.target.value } })}
                />
                <select
                  className="input"
                  aria-label={t('kitchen.custom.category')}
                  value={row.choice.category}
                  onChange={(e) => {
                    const category = e.target.value as Category
                    update(row.key, { choice: { ...(row.choice as Extract<Choice, { kind: 'new' }>), category, emoji: CATEGORY_ICONS[category] } })
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_ICONS[c]} {t(`kitchen.categories.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {open === row.key && (
              <div className="stack">
                {cands.length > 0 && <span className="muted">{t('kitchen.recipes.import.candidates')}</span>}
                <div className="chips" role="group">
                  {cands.map((c) => (
                    <button
                      key={c.productId}
                      className="chip"
                      aria-pressed={row.choice.kind === 'product' && row.choice.id === c.productId}
                      onClick={() => {
                        update(row.key, { choice: { kind: 'product', id: c.productId } })
                        setOpen(null)
                      }}
                    >
                      {c.inPantry ? '🏠 ' : ''}
                      {productText(c.productId)}
                    </button>
                  ))}
                </div>
                <ProductPicker
                  products={shop.products}
                  onPick={(p) => {
                    update(row.key, { choice: { kind: 'product', id: p.id } })
                    setOpen(null)
                  }}
                  onText={() => {
                    update(row.key, { choice: { kind: 'text' } })
                    setOpen(null)
                  }}
                />
                <div className="chips" role="group">
                  <button
                    className="chip"
                    onClick={() => {
                      const s = row.suggestion ?? { name: row.name.slice(0, 60), category: 'other' as Category, emoji: CATEGORY_ICONS.other }
                      update(row.key, { choice: { kind: 'new', name: s.name, category: s.category, emoji: s.emoji } })
                      setOpen(null)
                    }}
                  >
                    {t('kitchen.recipes.import.createNew')}
                  </button>
                  <button
                    className="chip"
                    onClick={() => {
                      update(row.key, { choice: { kind: 'text' } })
                      setOpen(null)
                    }}
                  >
                    {t('kitchen.recipes.import.asText')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <label className="field">
        {t('kitchen.recipes.steps')}
        <textarea className="input" rows={8} maxLength={10000} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>

      {failed && <p className="error">{t('kitchen.shopping.error')}</p>}
      <div className="row">
        <button className="primary" disabled={!valid || busy} onClick={save}>
          {t('kitchen.custom.save')}
        </button>
        <button className="link-btn" disabled={busy} onClick={onCancel}>
          {t('kitchen.custom.cancel')}
        </button>
      </div>
    </div>
  )
}
