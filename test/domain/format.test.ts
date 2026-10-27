import { describe, expect, it } from 'vitest'
import { relativeDay } from '../../src/lib/format'

describe('relativeDay', () => {
  it('labels the last week relative to the given day', () => {
    expect(relativeDay('2026-10-27', '2026-10-27')).toBe('今天')
    expect(relativeDay('2026-10-26', '2026-10-27')).toBe('昨天')
    expect(relativeDay('2026-10-24', '2026-10-27')).toBe('3 天前')
    expect(relativeDay('2026-10-28', '2026-10-27')).toBe('明天')
  })

  it('keeps older dates as they are', () => {
    expect(relativeDay('2026-10-01', '2026-10-27')).toBe('2026-10-01')
  })
})
