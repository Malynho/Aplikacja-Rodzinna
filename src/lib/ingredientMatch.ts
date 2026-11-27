// Matching of a recipe ingredient name to the family's products (pure functions, no dependencies).
// Products that the family keeps in the pantry get a bonus, and hints in the text ("Dose", "gehackte",
// "passierte", "frische") steer the choice between close products such as Tomaten / Dosentomaten.

export interface MatchProduct {
  id: string
  names: string[] // every language of the product (pl and de)
  inPantry: boolean // a pantry row with soll > 0 or ist > 0
}

export interface Candidate {
  productId: string
  score: number
  inPantry: boolean
  fromAlias: boolean
}

const PANTRY_BONUS = 0.12 // only for plausible matches (score >= PANTRY_MIN)
const PANTRY_MIN = 0.5
export const AUTO_MATCH = 0.85 // at or above: taken without asking
const PANTRY_WINDOW = 0.25 // a pantry product this close to the best match wins
const PANTRY_PLAUSIBLE = 0.6

// lower case, no accents (ä -> a, ł -> l, ß -> ss), only letters and digits, single spaces
export function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// a rough singular: plural endings of German and Polish ingredient names (tomaten -> tomat, ziemniaki -> ziemniak)
function stem(token: string): string {
  if (token.length <= 4) return token
  return token.replace(/(ow|en|n|e|y|i|s)$/, '')
}

const tokens = (text: string) => normalizeName(text).split(' ').filter(Boolean)

// hints that point to a canned / processed product, or to a fresh one
const CANNED = /^(dose|dosen|konserve|konserven|puszka|puszki|puszce)$/
const PROCESSED = ['gehackt', 'passiert', 'stuckig', 'pelati', 'krojon', 'przecier', 'passata']
const FRESH = /^(frisch|frische|frischer|frisches|frischen|swiez|swieze|swiezy|swiezych)$/
const CANNED_PRODUCT = /dosen|dose|konserv|puszk|passiert|gehackt|stuck|passata|przecier/

function bigrams(text: string): Set<string> {
  const s = text.replace(/ /g, '')
  const out = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

function dice(a: string, b: string): number {
  const x = bigrams(a)
  const y = bigrams(b)
  if (x.size === 0 || y.size === 0) return 0
  let common = 0
  for (const g of x) if (y.has(g)) common++
  return (2 * common) / (x.size + y.size)
}

// How well one product name fits the ingredient text (0 .. 1).
function nameScore(query: string, name: string): number {
  const q = normalizeName(query)
  const n = normalizeName(name)
  if (!q || !n) return 0
  if (q === n) return 1
  const qs = q.split(' ').map(stem)
  const ns = n.split(' ').map(stem)
  if (qs.join(' ') === ns.join(' ')) return 0.97
  if (ns.every((t) => qs.includes(t))) return 0.85 // every word of the product is in the text: "Tomaten gehackt" ~ "Tomaten"
  if (qs.every((t) => ns.includes(t))) return 0.8 // every word of the text is in the product name
  // a word of one is inside a word of the other (tomaten ~ dosentomaten)
  const inside = qs.some((a) => a.length >= 4 && ns.some((b) => b.length >= 4 && (b.includes(a) || a.includes(b))))
  return Math.max(inside ? 0.65 : 0, dice(q, n) * 0.9)
}

// Hints in the text move canned / fresh / processed products up or down.
function hintAdjust(query: string, name: string): number {
  const qt = tokens(query)
  const n = normalizeName(name)
  let adjust = 0
  if (qt.some((t) => CANNED.test(t)) && CANNED_PRODUCT.test(n)) adjust += 0.25
  if (qt.some((t) => FRESH.test(t)) && CANNED_PRODUCT.test(n)) adjust -= 0.2
  for (const word of PROCESSED) if (qt.some((t) => t.startsWith(word)) && n.includes(word)) adjust += 0.15
  return adjust
}

// The best products for an ingredient text, best first. aliases: normalized ingredient text -> product id (what the
// family chose before). A learned alias comes first; pantry products get a bonus when they are a plausible match.
export function rankCandidates(
  query: string,
  products: MatchProduct[],
  aliases: Map<string, string> = new Map(),
  limit = 3,
): Candidate[] {
  const aliasId = aliases.get(normalizeName(query))
  const list: Candidate[] = []
  for (const p of products) {
    let score = Math.max(0, ...p.names.map((n) => nameScore(query, n)))
    if (score > 0) score += Math.max(...p.names.map((n) => hintAdjust(query, n)))
    if (p.inPantry && score >= PANTRY_MIN) score += PANTRY_BONUS
    const fromAlias = p.id === aliasId
    if (fromAlias) score = 2
    if (score >= 0.4) list.push({ productId: p.id, score, inPantry: p.inPantry, fromAlias })
  }
  return list.sort((a, b) => b.score - a.score).slice(0, limit)
}

// The same candidates for the confirmation screen: those from the pantry on top (each group best first).
export const pantryFirst = (list: Candidate[]): Candidate[] =>
  [...list].sort((a, b) => Number(b.inPantry) - Number(a.inPantry) || b.score - a.score)

// The product to preselect: a learned alias, or a clear match; otherwise nothing (the user decides).
// Ambiguous names (Tomaten ~ Dosentomaten): when the best match is not in the pantry but a plausible one is
// (within PANTRY_WINDOW of the best), the pantry product is preselected. Hints in the text already moved the scores.
export function bestMatch(query: string, products: MatchProduct[], aliases: Map<string, string> = new Map()): Candidate | null {
  const list = rankCandidates(query, products, aliases, 3)
  const top = list[0]
  if (!top || !(top.fromAlias || top.score >= AUTO_MATCH)) return null
  if (top.fromAlias || top.inPantry) return top
  return list.find((c) => c.inPantry && c.score >= PANTRY_PLAUSIBLE && top.score - c.score <= PANTRY_WINDOW) ?? top
}
