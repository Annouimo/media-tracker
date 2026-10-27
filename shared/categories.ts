import { animeCopy, bookCopy } from './category-copy'
import type { CategoryCopy } from './category-copy'

export type Category = {
  /** Identifier used by `/api/public/categories/:slug`. */
  slug: string
  /** Label shown in the header navigation and page copy. */
  label: string
  /** Public URL of the category page. */
  path: string
  /** Value stored in `works.type`. Not migrated, so legacy casing stays valid. */
  type: string
  /** Display strings for this category. */
  copy: CategoryCopy
}

/**
 * The single place to register a category.
 *
 * Adding a category only needs a new entry here plus works that use the same
 * `type` value: routes, navigation, the public API, and the admin filter all
 * read from this list.
 */
export const CATEGORIES = [
  { slug: 'book', label: '图书', path: '/books', type: 'Book', copy: bookCopy },
  { slug: 'textbook', label: '教材', path: '/textbooks', type: 'Textbook', copy: bookCopy },
  { slug: 'anime', label: '动画', path: '/anime', type: 'Anime', copy: animeCopy },
] as const satisfies readonly Category[]

export type CategorySlug = (typeof CATEGORIES)[number]['slug']

/** Category shown for `/` before the redirect kicks in. */
export const DEFAULT_CATEGORY: Category = CATEGORIES[0]

const CATEGORY_BY_SLUG = new Map<string, Category>(
  CATEGORIES.map((category) => [category.slug, category] as const),
)

/** Category for a `/api/public/categories/:slug` request, or undefined. */
export function findCategory(slug: string): Category | undefined {
  return CATEGORY_BY_SLUG.get(slug)
}

/** Copy for a registered category slug; falls back to the book copy. */
export function copyForCategory(slug: string): CategoryCopy {
  return findCategory(slug)?.copy ?? bookCopy
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase()
}

/** Category that a stored `works.type` value belongs to, or undefined. */
export function categoryForType(type: string): Category | undefined {
  const normalized = normalizeType(type)
  return CATEGORIES.find((category) => normalizeType(category.type) === normalized)
}

/** Copy for a stored works.type value; unknown types fall back to books. */
export function copyForType(type: string): CategoryCopy {
  return categoryForType(type)?.copy ?? bookCopy
}
