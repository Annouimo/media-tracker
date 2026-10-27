import { describe, expect, it } from 'vitest'
import { describeLog, progressLabel, progressSummary, relativeDay, statusLabel } from '../../src/lib/format'
import { animeCopy, bookCopy } from '../../shared/category-copy'
import type { PublicLog, PublicWork } from '../../shared/types'

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

describe('category-aware formatting', () => {
  it('uses the category progress unit', () => {
    const work = {
      progress: 3,
      total_progress: 12,
      is_read: false,
      is_reading: true,
    } as unknown as PublicWork

    expect(progressSummary(work, animeCopy)).toBe('3 / 12 话')
    expect(progressSummary(work, bookCopy)).toBe('3 / 12 章')
  })

  it('does not show 0 / N for finished works without progress', () => {
    expect(progressLabel(0, 13, 'done', animeCopy)).toBe('已看完（进度未记录）')
    expect(progressLabel(0, 1, 'done', animeCopy)).toBe('已看完')
    expect(progressLabel(0, 1, 'done', bookCopy)).toBe('已读完')

    const doneWithoutProgress = {
      progress: 0,
      total_progress: 13,
      is_read: true,
      is_reading: false,
    } as unknown as PublicWork
    expect(progressSummary(doneWithoutProgress, animeCopy)).toBe('已看完（进度未记录）')
  })

  it('describes anime logs with anime wording', () => {
    const log = {
      event: 'both',
      status: 'done',
      progress: 12,
      total_snapshot: 12,
    } as unknown as PublicLog

    expect(statusLabel('done', animeCopy)).toBe('看过')
    expect(describeLog(log, animeCopy)).toBe('状态：看过 · 进度：12 / 12 话')
    expect(describeLog({ ...log, event: 'status' }, animeCopy)).toBe('状态：看过')
  })
})
