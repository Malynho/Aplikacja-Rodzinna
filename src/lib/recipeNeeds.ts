import type { PantryItem, Product } from '../pages/kitchen/products'
import type { Ingredient } from '../pages/kitchen/recipeTypes'

export interface NeedLine {
  ingredient: Ingredient
  factor: number // chosen servings / recipe servings
}

export interface ProductNeed {
  product_id: string
  packs: number // packs needed in total
  ist: number // packs in the pantry
  missing: number // max(0, packs - ist)
}

export interface Needs {
  byProduct: Map<string, ProductNeed> // catalog products only; text ingredients and staples are not listed
}

// Family of a unit for comparing amounts: g/kg, ml/l, pcs. Spoons have none.
const FAMILY: Record<string, string> = { g: 'g', kg: 'g', ml: 'ml', l: 'ml', pcs: 'pcs' }
const FACTOR: Record<string, number> = { kg: 1000, l: 1000 }

// Packs needed for all amounts of ONE product: ceil(sum / pack size) when the units match, otherwise
// one pack. Mixed units count the larger of both, never less than one.
function packsFor(lines: NeedLine[], product: Product): number {
  const family = product.pack_unit ? FAMILY[product.pack_unit] : undefined
  const packBase = product.pack_size && product.pack_unit ? product.pack_size * (FACTOR[product.pack_unit] ?? 1) : 0
  let sum = 0
  let other = false
  for (const { ingredient: i, factor } of lines) {
    if (packBase > 0 && FAMILY[i.unit] === family) sum += i.amount * factor * (FACTOR[i.unit] ?? 1)
    else other = true
  }
  return Math.max(sum > 0 ? Math.ceil(sum / packBase - 1e-9) : 0, other ? 1 : 0)
}

// Sums the ingredients per product BEFORE comparing with the pantry, so two dishes with onions
// draw on the same stock. Staples are skipped. Used by one recipe and by the whole week.
export function needsFor(
  lines: NeedLine[],
  products: Map<string, Product>,
  pantry: Map<string, PantryItem>, // by product id
): Needs {
  const groups = new Map<string, NeedLine[]>()
  for (const line of lines) {
    const { ingredient: i } = line
    if (i.staple) continue
    const product = i.product_id ? products.get(i.product_id) : undefined
    // no catalog product (or it was removed) = a text ingredient: shown in the recipe, never auto-listed
    if (i.product_id && product && !product.deleted_at) groups.set(i.product_id, [...(groups.get(i.product_id) ?? []), line])
  }
  const byProduct = new Map<string, ProductNeed>()
  for (const [id, group] of groups) {
    const packs = packsFor(group, products.get(id)!)
    const ist = pantry.get(id)?.ist ?? 0
    byProduct.set(id, { product_id: id, packs, ist, missing: Math.max(0, packs - ist) })
  }
  return { byProduct }
}

// What to send to add_missing_to_list: products still short and not already covered by the open list item.
export function missingList(needs: Needs, listed: Map<string, number>) {
  return [...needs.byProduct.values()]
    .filter((n) => n.missing > (listed.get(n.product_id) ?? 0))
    .map((n) => ({ product_id: n.product_id, qty: n.missing }))
}
