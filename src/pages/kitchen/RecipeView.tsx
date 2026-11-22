import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KitchenData } from '../../hooks/useKitchen'
import { missingList, needsFor } from '../../lib/recipeNeeds'
import { productName } from './products'
import { flag, formatAmount, type Ingredient, type Recipe } from './recipeTypes'

interface Props {
  recipe: Recipe
  ingredients: Ingredient[]
  shop: KitchenData
  canWrite: boolean
  onEdit: () => void
  onDelete: () => void
  onBack: () => void
  notify: (message: string) => void
}

// One recipe: servings switch (scales the amounts), pantry check per ingredient, missing -> shopping list.
export function RecipeView({ recipe, ingredients, shop, canWrite, onEdit, onDelete, onBack, notify }: Props) {
  const { t, i18n } = useTranslation()
  const [servings, setServings] = useState(recipe.servings)
  const factor = servings / recipe.servings
  const needs = needsFor(
    ingredients.map((ingredient) => ({ ingredient, factor })),
    shop.productById,
    shop.pantryByProduct,
  )
  const toAdd = missingList(needs, shop.quantities)

  async function addMissing() {
    if (await shop.addMissing(toAdd)) notify(t('kitchen.recipes.addedMissing', { count: toAdd.length }))
  }

  // Status text of one ingredient line
  function status(i: Ingredient) {
    if (i.staple) return <span className="muted">{t('kitchen.recipes.stapleTag')}</span>
    const need = i.product_id ? needs.byProduct.get(i.product_id) : undefined
    if (!need) return <span className="muted">{t('kitchen.recipes.manual')}</span>
    return need.missing > 0 ? (
      <span className="tag-warning">{t('kitchen.recipes.missing', { count: need.missing })}</span>
    ) : (
      <span className="muted">{t('kitchen.recipes.have')}</span>
    )
  }

  return (
    <div className="card stack">
      <button className="link-btn" onClick={onBack}>
        ‹ {t('kitchen.recipes.back')}
      </button>
      <h2>
        {recipe.country && <span className="list-emoji">{flag(recipe.country)}</span>}
        {recipe.title}
      </h2>
      <p className="muted">
        {recipe.lang.toUpperCase()}
        {recipe.minutes != null && ` · ${t('kitchen.recipes.minutesValue', { count: recipe.minutes })}`}
      </p>
      <div className="row">
        <span className="grow">{t('kitchen.recipes.servings')}</span>
        <button aria-label={t('kitchen.shopping.decrease')} disabled={servings <= 1} onClick={() => setServings(servings - 1)}>
          −
        </button>
        <strong>{servings}</strong>
        <button aria-label={t('kitchen.shopping.increase')} disabled={servings >= 100} onClick={() => setServings(servings + 1)}>
          +
        </button>
      </div>

      <h3>{t('kitchen.recipes.ingredients')}</h3>
      <div className="list">
        {ingredients.map((i) => {
          const p = i.product_id ? shop.productById.get(i.product_id) : undefined
          const active = p && !p.deleted_at
          return (
            <div key={i.id} className="row">
              <span className="grow">
                {active && <span className="list-emoji">{p.emoji}</span>}
                {formatAmount(i.amount * factor, i18n.language)} {t(`kitchen.units.${i.unit}`)}{' '}
                {active ? productName(p, t) : i.name}
              </span>
              {status(i)}
            </div>
          )
        })}
      </div>
      {canWrite && (
        <button className="primary" disabled={toAdd.length === 0} onClick={addMissing}>
          {t('kitchen.recipes.addMissing', { count: toAdd.length })}
        </button>
      )}
      {shop.error && <p className="error">{t(`kitchen.shopping.${shop.error}`)}</p>}

      {recipe.steps && (
        <>
          <h3>{t('kitchen.recipes.steps')}</h3>
          <p className="steps">{recipe.steps}</p>
        </>
      )}
      {canWrite && (
        <div className="row">
          <button className="link-btn" onClick={onEdit}>
            {t('kitchen.custom.edit')}
          </button>
          <button className="link-btn" onClick={onDelete}>
            {t('kitchen.shopping.remove')}
          </button>
        </div>
      )}
    </div>
  )
}
