import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  categoryForType,
  findCategory,
} from '../../shared/categories'

const RESERVED_PATHS = ['/admin', '/works', '/api']

describe('category registry', () => {
  it('has unique slugs, paths, and stored types', () => {
    expect(new Set(CATEGORIES.map((category) => category.slug)).size).toBe(CATEGORIES.length)
    expect(new Set(CATEGORIES.map((category) => category.path)).size).toBe(CATEGORIES.length)
    expect(
      new Set(CATEGORIES.map((category) => category.type.toLowerCase())).size,
    ).toBe(CATEGORIES.length)
  })

  it('keeps paths absolute and clear of reserved routes', () => {
    for (const category of CATEGORIES) {
      expect(category.path.startsWith('/')).toBe(true)
      for (const reserved of RESERVED_PATHS) {
        expect(category.path === reserved || category.path.startsWith(`${reserved}/`)).toBe(false)
      }
    }
  })

  it('finds a category by slug', () => {
    expect(findCategory('book')?.label).toBe('图书')
    expect(findCategory('textbook')?.path).toBe('/textbooks')
    expect(findCategory('anime')?.label).toBe('动画')
    expect(findCategory('nope')).toBeUndefined()
  })

  it('resolves stored types case-insensitively', () => {
    expect(categoryForType('Book')?.slug).toBe('book')
    expect(categoryForType('book')?.slug).toBe('book')
    expect(categoryForType(' Textbook ')?.slug).toBe('textbook')
    expect(categoryForType('Anime')?.slug).toBe('anime')
    expect(categoryForType('Comic')).toBeUndefined()
  })

  it('exposes a default category that is registered', () => {
    expect(CATEGORIES).toContain(DEFAULT_CATEGORY)
  })
})
