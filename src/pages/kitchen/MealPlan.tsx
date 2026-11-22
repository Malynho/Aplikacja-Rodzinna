import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { UndoToast, useUndo } from '../../components/UndoToast'
import type { KitchenData } from '../../hooks/useKitchen'
import { useModuleAccess } from '../../hooks/useModuleAccess'
import { addDays, isoWeek, mondayOf, toDay } from '../../lib/date'
import { missingList, needsFor } from '../../lib/recipeNeeds'
import { supabase } from '../../lib/supabase'
import type { MealWish, Recipe, WishValues } from './recipeTypes'

interface FormProps {
  day: string
  wish?: MealWish
  recipes: Recipe[] // active recipes
  recipeById: Map<string, Recipe>
  onSave: (values: WishValues) => Promise<boolean>
  onCancel: () => void
}

// One wish: a recipe from the list or own text, a day and an optional note.
function WishForm({ day, wish, recipes, recipeById, onSave, onCancel }: FormProps) {
  const { t, i18n } = useTranslation()
  const [date, setDate] = useState(wish?.day ?? day)
  const [recipeId, setRecipeId] = useState(wish?.recipe_id ?? '')
  const [title, setTitle] = useState(wish?.title ?? '')
  const [note, setNote] = useState(wish?.note ?? '')
  const [busy, setBusy] = useState(false)
  const valid = date !== '' && (recipeId !== '' || title.trim() !== '')
  // the recipe of an existing wish may have been removed meanwhile; keep it selectable
  const current = wish?.recipe_id && !recipes.some((r) => r.id === wish.recipe_id) ? recipeById.get(wish.recipe_id) : undefined

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    const ok = await onSave({
      day: date,
      recipe_id: recipeId || null,
      title: recipeId ? null : title.trim(),
      note: note.trim() || null,
    })
    if (!ok) setBusy(false) // on success the parent closes the form
  }

  return (
    <div className="card stack">
      <label className="field">
        {t('kitchen.plan.day')}
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        {t('kitchen.plan.dish')}
        <select className="input" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          <option value="">{t('kitchen.plan.ownText')}</option>
          {current && <option value={current.id}>{t('kitchen.plan.deletedRecipe')}</option>}
          {[...recipes]
            .sort((a, b) => a.title.localeCompare(b.title, i18n.language))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
        </select>
      </label>
      {recipeId === '' && (
        <input
          className="input"
          maxLength={120}
          placeholder={t('kitchen.plan.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      )}
      <input
        className="input"
        maxLength={300}
        placeholder={t('kitchen.plan.note')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
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

// Dinner plan: one week at a time; every member adds wishes (recipe or own text) for any day.
export function MealPlan() {
  const { t, i18n } = useTranslation()
  const shop = useOutletContext<KitchenData>()
  const canWrite = useModuleAccess('kitchen') === 'write'
  const undo = useUndo()
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [form, setForm] = useState<{ day: string; wish?: MealWish } | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())

  // Who wished what: names from the profiles, colors by the order of the authors.
  const authors = [...new Set(shop.wishes.map((w) => w.wished_by))].sort()
  const authorKey = authors.join(',')
  useEffect(() => {
    if (authors.length === 0) return
    supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', authors)
      .then(({ data }) => setNames(new Map((data ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? '']))))
    // authors is derived from authorKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorKey])

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const today = toDay(new Date())
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'numeric' })
  const rangeFormat = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' })

  // Ingredients of every planned recipe of this week (from today on), summed before the pantry check.
  const weekWishes = shop.wishes.filter(
    (w) => w.day >= toDay(monday) && w.day <= toDay(days[6]) && w.day >= today && w.recipe_id && shop.recipes.some((r) => r.id === w.recipe_id),
  )
  const needs = needsFor(
    weekWishes.flatMap((w) => (shop.ingredientsByRecipe.get(w.recipe_id!) ?? []).map((ingredient) => ({ ingredient, factor: 1 }))),
    shop.productById,
    shop.pantryByProduct,
  )
  const toAdd = missingList(needs, shop.quantities)

  async function addWeek() {
    if (await shop.addMissing(toAdd)) undo.show(t('kitchen.recipes.addedMissing', { count: toAdd.length }))
  }

  async function save(values: WishValues) {
    const ok = form?.wish ? await shop.updateWish(form.wish.id, values) : await shop.addWish(values)
    if (ok) setForm(null)
    return ok
  }

  function remove(wish: MealWish) {
    shop.setDeleted('meal_wishes', [wish.id], true)
    undo.show(t('kitchen.plan.removed'), () => shop.setDeleted('meal_wishes', [wish.id], false))
  }

  const wishTitle = (w: MealWish) => {
    if (!w.recipe_id) return w.title
    const r = shop.recipeById.get(w.recipe_id)
    return r && !r.deleted_at ? r.title : t('kitchen.plan.deletedRecipe')
  }

  return (
    <>
      <h1>{t('kitchen.tabs.mealPlan')}</h1>
      <div className="row toolbar">
        <button aria-label={t('kitchen.plan.prev')} onClick={() => setMonday(addDays(monday, -7))}>
          ‹
        </button>
        <strong className="grow">
          {t('kitchen.plan.week', { week: isoWeek(monday) })} · {rangeFormat.format(monday)} – {rangeFormat.format(days[6])}
        </strong>
        <button className="link-btn" onClick={() => setMonday(mondayOf(new Date()))}>
          {t('kitchen.plan.today')}
        </button>
        <button aria-label={t('kitchen.plan.next')} onClick={() => setMonday(addDays(monday, 7))}>
          ›
        </button>
      </div>
      {canWrite && (
        <div className="row toolbar">
          <button className="primary" disabled={toAdd.length === 0} onClick={addWeek}>
            {t('kitchen.plan.addWeek', { count: toAdd.length })}
          </button>
        </div>
      )}
      {shop.error && <p className="error">{t(`kitchen.shopping.${shop.error}`)}</p>}

      {days.map((d) => {
        const day = toDay(d)
        const list = shop.wishes.filter((w) => w.day === day).sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        return (
          <section key={day} className="section">
            <div className="row">
              <h3 className="grow">{day === today ? `${dayFormat.format(d)} · ${t('kitchen.plan.today')}` : dayFormat.format(d)}</h3>
              {canWrite && (
                <button className="link-btn" onClick={() => setForm({ day })}>
                  {t('kitchen.plan.add')}
                </button>
              )}
            </div>
            {form && !form.wish && form.day === day && (
              <WishForm
                day={day}
                recipes={shop.recipes}
                recipeById={shop.recipeById}
                onSave={save}
                onCancel={() => setForm(null)}
              />
            )}
            <div className="list">
              {list.map((w) =>
                form?.wish?.id === w.id ? (
                  <WishForm
                    key={w.id}
                    day={day}
                    wish={w}
                    recipes={shop.recipes}
                    recipeById={shop.recipeById}
                    onSave={save}
                    onCancel={() => setForm(null)}
                  />
                ) : (
                  <div key={w.id} className="list-row card">
                    <span className="grow">
                      {wishTitle(w)}
                      {w.note && <span className="muted"> · {w.note}</span>}
                    </span>
                    <span
                      className="author"
                      style={{
                        background: `var(--person-${(authors.indexOf(w.wished_by) % 3) + 1}-bg)`,
                        color: `var(--person-${(authors.indexOf(w.wished_by) % 3) + 1}-text)`,
                      }}
                    >
                      {names.get(w.wished_by) || '?'}
                    </span>
                    {canWrite && (
                      <>
                        <button className="link-btn" onClick={() => setForm({ day: w.day, wish: w })}>
                          {t('kitchen.custom.edit')}
                        </button>
                        <button aria-label={t('kitchen.shopping.remove')} onClick={() => remove(w)}>
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                ),
              )}
            </div>
          </section>
        )
      })}
      <UndoToast toast={undo.toast} dismiss={undo.dismiss} />
    </>
  )
}
