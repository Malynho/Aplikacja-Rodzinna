import type { TFunction } from 'i18next'
import i18n from '../../i18n'

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

// Package size units (stored as-is; labels come from kitchen.units.<unit>).
export const PACK_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'] as const
export type PackUnit = (typeof PACK_UNITS)[number]

export interface Pack {
  pack_size: number | null
  pack_unit: PackUnit | null
}

// Rows as stored in the database (products.deleted_at = archived).
export interface Product extends Pack {
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

export interface ProductValues extends Pack {
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

// Receipt scan: one recognized line, what is sent to apply_receipt, and its result.
export interface ReceiptItem {
  raw_text: string
  product_id: string | null // null = no match
  quantity: number
  uncertain: boolean // the model is not sure about the match or the quantity
  pack_size: number | null // printed on the line; only suggested for NEW products
  pack_unit: PackUnit | null
}

export interface ReceiptLine {
  product_id: string | null
  new_product: ProductValues | null // creates a custom product instead of using product_id
  quantity: number
  alias: string | null // receipt text to learn for this product
}

export interface ReceiptResult {
  cleared: number // list items fully bought
  reduced: number // list items partly bought
  pantry: number // products whose stock was raised
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

// Name with the optional package size, e.g. "Zwiebeln · 1 kg" (counts still refer to packs).
export function productLabel(product: Product, t: TFunction): string {
  const name = productName(product, t)
  if (product.pack_size == null || !product.pack_unit) return name
  const size = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(product.pack_size)
  return `${name} · ${size} ${t(`kitchen.units.${product.pack_unit}`)}`
}
