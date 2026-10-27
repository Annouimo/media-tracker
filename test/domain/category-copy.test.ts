import { describe, expect, it } from 'vitest'
import { copyForCategory, copyForType } from '../../shared/categories'
import { NEUTRAL_STATUS, animeCopy, bookCopy } from '../../shared/category-copy'

describe('category copy', () => {
  it('uses anime wording for anime works', () => {
    const copy = copyForType('Anime')
    expect(copy).toBe(animeCopy)
    expect(copy.status.done).toBe('看过')
    expect(copy.progressUnit).toBe('话')
    expect(copy.readSection).toBe('看过')
    expect(copy.doneUnknownProgress).toBe('已看完（进度未记录）')
  })

  it('uses book wording for books and textbooks', () => {
    expect(copyForType('Book')).toBe(bookCopy)
    expect(copyForType('textbook')).toBe(bookCopy)
    expect(copyForCategory('textbook')).toBe(bookCopy)
    expect(bookCopy.status.done).toBe('读完')
    expect(bookCopy.progressUnit).toBe('章')
  })

  it('falls back to books for unknown types and slugs', () => {
    expect(copyForType('Comic')).toBe(bookCopy)
    expect(copyForCategory('nope')).toBe(bookCopy)
  })

  it('has neutral labels for the mixed admin list', () => {
    expect(NEUTRAL_STATUS.wish).toBe('未开始')
    expect(NEUTRAL_STATUS.reading).toBe('进行中')
    expect(NEUTRAL_STATUS.done).toBe('已完成')
    expect(NEUTRAL_STATUS.dropped).toBe('已放弃')
  })
})
