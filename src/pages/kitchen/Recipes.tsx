import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection, useOpenSections } from '../../components/CollapsibleSection'
import { UndoToast, useUndo } from '../../components/UndoToast'
import type { KitchenData } from '../../hooks/useKitchen'
import { useModuleAccess } from '../../hooks/useModuleAccess'
import { RecipeForm } from './RecipeForm'
import { RecipeView } from './RecipeView'
import { COUNTRIES, flag, type IngredientValues, type RecipeValues } from './recipeTypes'

type Mode = { kind: 'list' } | { kind: 'view'; id: string } | { kind: 'form'; id: string | null }

const OTHER = 'other'

// Recipes grouped by country (collapsible), with search, details, and the add / edit form.
export function Recipes() {
  const { t, i18n } = useTranslation()
  const shop = useOutletContext<KitchenData>()
  const canWrite = useModuleAccess('kitchen') === 'write'
  const undo = useUndo()
  const { open, toggle } = useOpenSections('kitchen:open:recipes')
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const current = mode.kind === 'list' ? undefined : mode.id ? shop.recipeById.get(mode.id) : undefined
  const ingredients = (id: string) => shop.ingredientsByRecipe.get(id) ?? []

  async function save(values: RecipeValues, list: IngredientValues[]) {
    const id = await shop.saveRecipe(mode.kind === 'form' ? mode.id : null, values, list)
    if (id) setMode({ kind: 'view', id })
    return id !== null
  }

  function remove(id: string, title: string) {
    shop.setDeleted('recipes', [id], true)
    undo.show(t('kitchen.recipes.removed', { name: title }), () => shop.setDeleted('recipes', [id], false))
    setMode({ kind: 'list' })
  }

  let body
  if (mode.kind === 'form') {
    body = (
      <>
        {shop.error && <p className="error">{t(`kitchen.shopping.${shop.error}`)}</p>}
        <RecipeForm
          key={mode.id ?? 'new'}
          recipe={current}
          ingredients={current ? ingredients(current.id) : []}
          products={shop.products}
          productById={shop.productById}
          onSave={save}
          onCancel={() => setMode(current ? { kind: 'view', id: current.id } : { kind: 'list' })}
        />
      </>
    )
  } else if (mode.kind === 'view' && current && !current.deleted_at) {
    body = (
      <RecipeView
        key={current.id}
        recipe={current}
        ingredients={ingredients(current.id)}
        shop={shop}
        canWrite={canWrite}
        onEdit={() => setMode({ kind: 'form', id: current.id })}
        onDelete={() => remove(current.id, current.title)}
        onBack={() => setMode({ kind: 'list' })}
        notify={undo.show}
      />
    )
  } else {
    const found = shop.recipes
      .filter((r) => r.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, i18n.language))
    const groupOf = (country: string | null) => (country && (COUNTRIES as readonly string[]).includes(country) ? country : OTHER)
    const keys = [...new Set(found.map((r) => groupOf(r.country)))].sort((a, b) =>
      a === OTHER ? 1 : b === OTHER ? -1 : t(`kitchen.countries.${a}`).localeCompare(t(`kitchen.countries.${b}`), i18n.language),
    )
    body = (
      <>
        <input
          className="input search"
          type="search"
          placeholder={t('kitchen.recipes.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {found.length === 0 && (
          <p className="muted">{t(shop.recipes.length === 0 ? 'kitchen.recipes.empty' : 'kitchen.shopping.noResults')}</p>
        )}
        {keys.map((key) => {
          const group = found.filter((r) => groupOf(r.country) === key)
          return (
            <CollapsibleSection
              key={key}
              icon={key === OTHER ? '🍽️' : flag(key)}
              title={t(`kitchen.countries.${key}`)}
              count={group.length}
              expanded={q !== '' || open.has(key)}
              locked={q !== ''}
              onToggle={() => toggle(key)}
            >
              <div className="list">
                {group.map((r) => (
                  <button key={r.id} className="list-row card" onClick={() => setMode({ kind: 'view', id: r.id })}>
                    <span className="grow">{r.title}</span>
                    <span className="muted">
                      {r.lang.toUpperCase()}
                      {r.minutes != null && ` · ${t('kitchen.recipes.minutesValue', { count: r.minutes })}`}
                    </span>
                  </button>
                ))}
              </div>
            </CollapsibleSection>
          )
        })}
      </>
    )
  }

  return (
    <>
      <h1>{t('kitchen.tabs.recipes')}</h1>
      {mode.kind === 'list' && canWrite && (
        <div className="row toolbar">
          <button className="primary" onClick={() => setMode({ kind: 'form', id: null })}>
            {t('kitchen.recipes.add')}
          </button>
        </div>
      )}
      {body}
      <UndoToast toast={undo.toast} dismiss={undo.dismiss} />
    </>
  )
}
