import type { Category } from './products'

export const COUNTRIES = ['PL', 'DE', 'IT', 'FR', 'ES', 'GR', 'TR', 'CN', 'JP', 'IN', 'MX', 'US', 'GB', 'TH'] as const

export const RECIPE_UNITS = ['g', 'ml', 'pcs', 'tbsp', 'tsp'] as const
export type RecipeUnit = (typeof RECIPE_UNITS)[number]

export type RecipeLang = 'pl' | 'de'

// Rows as stored in the database (recipes.deleted_at = removed).
export interface Recipe {
  id: string
  family_id: string
  title: string
  lang: RecipeLang
  country: string | null // ISO code, null = other
  servings: number
  minutes: number | null
  steps: string
  source_url: string | null // https only
  updated_at: string
  deleted_at: string | null
}

export interface Ingredient {
  id: string
  recipe_id: string
  family_id: string
  product_id: string | null // null = not in the catalog
  name: string
  amount: number
  unit: RecipeUnit
  staple: boolean // always at home: never put on the list automatically
  sort: number
  updated_at: string
}

export interface MealWish {
  id: string
  family_id: string
  day: string // YYYY-MM-DD
  recipe_id: string | null
  title: string | null // own text when there is no recipe
  wished_by: string
  note: string | null
  updated_at: string
  deleted_at: string | null
}

// What the forms send (ids, owners and timestamps are set by the database).
export interface RecipeValues {
  title: string
  lang: RecipeLang
  country: string | null
  servings: number
  minutes: number | null
  steps: string
}

export type IngredientValues = Pick<Ingredient, 'product_id' | 'name' | 'amount' | 'unit' | 'staple'>

export interface WishValues {
  day: string
  recipe_id: string | null
  title: string | null
  note: string | null
}

// Flag emoji from an ISO 3166 country code (regional indicator letters).
export const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)))

// Amount for display: up to 2 decimals, no trailing zeros.
export const formatAmount = (value: number, language: string) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)

// Recipe import (phase 1: text and photos). What the Edge Function "import-recipe" returns ...
export interface ImportedIngredient {
  raw_text: string // as written in the source
  name: string
  amount: number
  unit: RecipeUnit
  staple: boolean
  product_id: string | null // the model's choice from the catalog
  uncertain: boolean
  new_product: { name: string; category: Category; emoji: string } | null // suggestion when there is no match
}

export interface ImportedRecipe {
  title: string
  lang: RecipeLang | null // null = the language of the app
  country: string | null
  servings: number | null
  minutes: number | null
  steps: string
  ingredients: ImportedIngredient[]
  truncated: boolean // the source had more than 60 ingredients
}

// ... and what save_recipe_import takes after the user has confirmed (the database validates all of it again).
export interface ImportRecipePayload {
  title: string
  lang: RecipeLang
  country: string | null
  servings: number
  minutes: number | null
  steps: string
  source_url: string | null
}

export interface ImportIngredientPayload {
  name: string
  amount: number
  unit: RecipeUnit
  staple: boolean
  product_id?: string
  new_product?: { name: string; category: Category; emoji: string }
  alias?: string // the ingredient text the user matched or corrected (learned in ingredient_aliases)
}
