import type { TFunction } from 'i18next'

export const CATEGORIES = [
  'fruitVeg',
  'dairyEggs',
  'bakery',
  'meatFish',
  'frozen',
  'pantry',
  'spices',
  'drinks',
  'household',
  'other',
] as const
export type Category = (typeof CATEGORIES)[number]

// Fallback icon per category (used for starter products without a fitting emoji).
export const CATEGORY_ICONS: Record<Category, string> = {
  fruitVeg: '🥦',
  dairyEggs: '🥛',
  bakery: '🍞',
  meatFish: '🥩',
  frozen: '🧊',
  pantry: '🥫',
  spices: '🧂',
  drinks: '🥤',
  household: '🧴',
  other: '🛒',
}

// Simple emoji choice for custom products.
export const EMOJI_CHOICES = [
  '🍎', '🍌', '🍇', '🍓', '🥕', '🥔', '🍅', '🥦', '🧅', '🥬',
  '🍞', '🥐', '🧀', '🥛', '🥚', '🍗', '🥩', '🐟', '🍝', '🍚',
  '🥫', '🧂', '🌶️', '🍯', '🍫', '🍪', '🥤', '🧃', '☕', '🍺',
  '🍷', '🧻', '🧴', '🧼', '🧽', '🗑️', '🔋', '💡', '🐾', '💊',
  '🌿', '🍕', '🧊', '🛒',
]

// Rows as stored in the database (products.deleted_at = archived).
export interface Product {
  id: string
  family_id: string
  name: string | null
  seed_key: string | null
  emoji: string
  category: Category
  updated_at: string
  deleted_at: string | null
}

export interface ShoppingItem {
  id: string
  family_id: string
  product_id: string
  quantity: number
  checked: boolean
  updated_at: string
  deleted_at: string | null
}

export interface ProductValues {
  name: string
  emoji: string
  category: Category
}

// Pantry stock of a product: ist = have, soll = target, min_qty = "running low" marker.
export interface PantryItem {
  id: string
  family_id: string
  product_id: string
  ist: number
  soll: number
  min_qty: number
  updated_at: string
}

export interface PantryValues {
  ist: number
  soll: number
  min_qty: number
}

export type PantryStatus = 'untracked' | 'out' | 'low' | 'ok'

// "Running low": a target is set and the stock is at or below the minimum.
export function runningLow(item?: PantryItem): boolean {
  return !!item && item.soll > 0 && item.ist <= item.min_qty
}

// Products with neither stock nor target are not tracked and stay neutral.
export function pantryStatus(item?: PantryItem): PantryStatus {
  if (!item || (item.ist === 0 && item.soll === 0)) return 'untracked'
  if (item.ist === 0) return 'out'
  return runningLow(item) ? 'low' : 'ok'
}

// Starter products take their name from the translation files, custom ones from the database.
export function productName(product: Product, t: TFunction): string {
  return product.seed_key ? t(`kitchen.products.${product.seed_key}`) : (product.name ?? '')
}
