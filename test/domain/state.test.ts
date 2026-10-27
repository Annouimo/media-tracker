import { describe, expect, it } from 'vitest'
import type { Log, Work, WorkWithState } from '../../shared/types'
import { DomainError } from '../../worker/domain/errors'
import {
  assertCanSetStatus,
  assertProgressWithinTotal,
  deriveState,
  isPublicWork,
  latestLog,
  resolveTotalProgress,
  statusAfterProgress,
  withState,
} from '../../worker/domain/state'

function makeWork(overrides: Partial<Work> = {}): Work {
  return {
    id: 'w1',
    title: 'Test',
    creator: '',
    release_year: null,
    type: 'Book',
    total_progress: 10,
    short_review: '',
    long_review_url: '',
    added_at: 1,
    created_at: 1,
    updated_at: 1,
    legacy_id: null,
    deleted_at: null,
    ...overrides,
  }
}

function makeLog(overrides: Partial<Log> = {}): Log {
  return {
    id: 'l1',
    work_id: 'w1',
    seq: 1,
    event: 'progress',
    status: 'reading',
    progress: 1,
    total_snapshot: 10,
    round: 1,
    logged_on: '2026-10-01',
    logged_at: null,
    source: 'user',
    inferred: 0,
    created_at: 1,
    ...overrides,
  }
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return error instanceof DomainError ? error.code : undefined
  }
}

describe('work state', () => {
  it('derives wish/0 when there are no logs', () => {
    const work = makeWork()
    expect(deriveState(work, [])).toEqual({
      status: 'wish',
      progress: 0,
      totalSnapshot: 10,
      round: 1,
      loggedOn: null,
      loggedAt: null,
      event: null,
      finishedOn: null,
    })
  })

  it('uses the highest seq as current state and remembers done dates', () => {
    const logs = [
      makeLog({ id: 'l1', seq: 1, status: 'reading', progress: 0, logged_on: '2026-10-01' }),
      makeLog({ id: 'l2', seq: 3, status: 'reading', progress: 4, round: 2, event: 'both', logged_on: '2026-10-03' }),
      makeLog({ id: 'l3', seq: 2, status: 'done', progress: 10, logged_on: '2026-10-02' }),
    ]
    const state = deriveState(makeWork(), logs)
    expect(latestLog(logs)?.id).toBe('l2')
    expect(state.status).toBe('reading')
    expect(state.progress).toBe(4)
    expect(state.round).toBe(2)
    expect(state.finishedOn).toBe('2026-10-02')
  })

  it('is public when ever done or currently reading', () => {
    const base = makeWork()
    const reading: WorkWithState = withState(base, [makeLog({ status: 'reading' })])
    const done: WorkWithState = withState(base, [makeLog({ status: 'done', progress: 10 })])
    const paused: WorkWithState = withState(base, [makeLog({ status: 'paused' })])

    expect(isPublicWork(reading)).toBe(true)
    expect(isPublicWork(done)).toBe(true)
    expect(isPublicWork(paused)).toBe(false)
  })

  it('allows the intended status transitions and requires a new round from done', () => {
    expect(() => assertCanSetStatus('wish', 'reading')).not.toThrow()
    expect(() => assertCanSetStatus('paused', 'reading')).not.toThrow()
    expect(() => assertCanSetStatus('done', 'paused')).not.toThrow()
    expect(errorCode(() => assertCanSetStatus('done', 'reading'))).toBe('invalid_transition')
    expect(errorCode(() => assertCanSetStatus('wish', 'wish'))).toBeUndefined()
  })

  it('maps progress to reading and rejects progress on done', () => {
    expect(statusAfterProgress('wish')).toBe('reading')
    expect(statusAfterProgress('reading')).toBe('reading')
    expect(statusAfterProgress('paused')).toBe('paused')
    expect(errorCode(() => statusAfterProgress('done'))).toBe('use_new_round')
  })

  it('requires chapters or explicit binary mode when entering reading', () => {
    const binary = makeWork({ total_progress: 1 })
    const chapter = makeWork({ total_progress: 10 })

    expect(resolveTotalProgress(chapter, undefined, false)).toBe(10)
    expect(resolveTotalProgress(chapter, 12, false)).toBe(12)
    expect(resolveTotalProgress(binary, undefined, true)).toBe(1)
    expect(errorCode(() => resolveTotalProgress(binary, undefined, false))).toBe(
      'needs_total_progress',
    )
    expect(errorCode(() => resolveTotalProgress(binary, 1, false))).toBe('invalid_total_progress')
  })

  it('validates progress against total', () => {
    expect(() => assertProgressWithinTotal(0, 10)).not.toThrow()
    expect(() => assertProgressWithinTotal(10, 10)).not.toThrow()
    expect(errorCode(() => assertProgressWithinTotal(11, 10))).toBe('invalid_progress')
    expect(errorCode(() => assertProgressWithinTotal(-1, 10))).toBe('invalid_progress')
  })
})
