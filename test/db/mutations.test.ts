import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createWorkSchema,
  progressInputSchema,
  roundInputSchema,
  statusInputSchema,
  updateWorkSchema,
} from '../../shared/schemas'
import {
  createWorkWithInitialLog,
  setProgress,
  setStatus,
  startNewRound,
  undoLatestLog,
  updateWork,
} from '../../worker/db/mutations'
import { getLatestLog, getWorkWithState, listLogsForWork } from '../../worker/db/queries'
import { resetDatabase } from '../helpers/db'

beforeEach(async () => {
  await resetDatabase()
})

describe('D1 mutations', () => {
  it('creates a wish work without a log', async () => {
    const work = await createWorkWithInitialLog(
      env.MEDIA_TRACKER_DB,
      createWorkSchema.parse({ title: 'New Wish' }),
    )

    expect(work.state.status).toBe('wish')
    expect(work.state.progress).toBe(0)
    expect(await listLogsForWork(env.MEDIA_TRACKER_DB, work.id)).toHaveLength(0)
  })

  it('creates an already-done work with a date-only log', async () => {
    const work = await createWorkWithInitialLog(
      env.MEDIA_TRACKER_DB,
      createWorkSchema.parse({
        title: 'New Done',
        status: 'done',
        total_progress: 3,
        progress: 2,
        finished_on: '2026-10-05',
      }),
    )

    expect(work.state.status).toBe('done')
    expect(work.state.progress).toBe(2)
    expect(work.state.finishedOn).toBe('2026-10-05')

    const logs = await listLogsForWork(env.MEDIA_TRACKER_DB, work.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.event).toBe('both')
    expect(logs[0]?.logged_on).toBe('2026-10-05')
    expect(logs[0]?.logged_at).toBeNull()
  })

  it('requires chapters when creating a binary reading work', async () => {
    await expect(
      createWorkWithInitialLog(
        env.MEDIA_TRACKER_DB,
        createWorkSchema.parse({ title: 'Binary Reading', status: 'reading' }),
      ),
    ).rejects.toMatchObject({ code: 'needs_total_progress' })
  })

  it('records progress without auto-finishing the last chapter', async () => {
    const result = await setProgress(
      env.MEDIA_TRACKER_DB,
      'w-reading',
      progressInputSchema.parse({ progress: 4 }),
    )

    expect(result.work.state.status).toBe('reading')
    expect(result.work.state.progress).toBe(4)
    expect(result.log?.event).toBe('progress')
    expect(result.log?.status).toBe('reading')

    const last = await setProgress(
      env.MEDIA_TRACKER_DB,
      'w-reading',
      progressInputSchema.parse({ progress: 10 }),
    )
    expect(last.work.state.status).toBe('reading')
    expect(last.work.state.progress).toBe(10)
  })

  it('turns wish into reading on first progress and handles binary prompt', async () => {
    await expect(
      setProgress(env.MEDIA_TRACKER_DB, 'w-wish', progressInputSchema.parse({ progress: 0 })),
    ).rejects.toMatchObject({ code: 'needs_total_progress' })

    const result = await setProgress(
      env.MEDIA_TRACKER_DB,
      'w-wish',
      progressInputSchema.parse({ progress: 1, total_progress: 5 }),
    )
    expect(result.work.state.status).toBe('reading')
    expect(result.work.state.progress).toBe(1)
    expect(result.work.total_progress).toBe(5)
    expect(result.log?.event).toBe('both')
  })

  it('rejects progress on a done work', async () => {
    await expect(
      setProgress(env.MEDIA_TRACKER_DB, 'w-done', progressInputSchema.parse({ progress: 1 })),
    ).rejects.toMatchObject({ code: 'use_new_round' })
  })

  it('sets done and paused statuses without changing progress', async () => {
    const done = await setStatus(
      env.MEDIA_TRACKER_DB,
      'w-reading',
      statusInputSchema.parse({ status: 'done' }),
    )
    expect(done.work.state.status).toBe('done')
    expect(done.work.state.progress).toBe(3)
    expect(done.log?.event).toBe('status')

    const resumed = await setStatus(
      env.MEDIA_TRACKER_DB,
      'w-paused',
      statusInputSchema.parse({ status: 'reading' }),
    )
    expect(resumed.work.state.status).toBe('reading')
    expect(resumed.work.state.progress).toBe(4)
  })

  it('starts a new round from done', async () => {
    const result = await startNewRound(
      env.MEDIA_TRACKER_DB,
      'w-done',
      roundInputSchema.parse({ confirm_binary: true }),
    )

    expect(result.work.state.status).toBe('reading')
    expect(result.work.state.round).toBe(2)
    expect(result.work.state.progress).toBe(0)
    expect(result.log?.event).toBe('both')
    expect(result.log?.round).toBe(2)
  })

  it('undoes only the latest log', async () => {
    await setProgress(
      env.MEDIA_TRACKER_DB,
      'w-reading',
      progressInputSchema.parse({ progress: 4 }),
    )
    expect(await listLogsForWork(env.MEDIA_TRACKER_DB, 'w-reading')).toHaveLength(2)

    const undone = await undoLatestLog(env.MEDIA_TRACKER_DB, 'w-reading')
    expect(undone.deleted.seq).toBe(2)
    expect(undone.work.state.progress).toBe(3)
    expect(await listLogsForWork(env.MEDIA_TRACKER_DB, 'w-reading')).toHaveLength(1)
  })

  it('updates metadata and reviews without touching status', async () => {
    const work = await updateWork(
      env.MEDIA_TRACKER_DB,
      'w-done',
      updateWorkSchema.parse({
        title: 'Done Book Revised',
        short_review: 'Updated review',
        long_review_url: 'https://example.com/updated',
      }),
    )

    expect(work.title).toBe('Done Book Revised')
    expect(work.short_review).toBe('Updated review')
    expect(work.state.status).toBe('done')
  })

  it('refuses to lower total_progress below current progress', async () => {
    await expect(
      updateWork(
        env.MEDIA_TRACKER_DB,
        'w-reading',
        updateWorkSchema.parse({ total_progress: 2 }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_total_progress' })
  })

  it('keeps the latest log query consistent', async () => {
    const before = await getLatestLog(env.MEDIA_TRACKER_DB, 'w-reading')
    await setProgress(
      env.MEDIA_TRACKER_DB,
      'w-reading',
      progressInputSchema.parse({ progress: 4 }),
    )
    const after = await getLatestLog(env.MEDIA_TRACKER_DB, 'w-reading')
    const work = await getWorkWithState(env.MEDIA_TRACKER_DB, 'w-reading')

    expect(before?.seq).toBe(1)
    expect(after?.seq).toBe(2)
    expect(work?.state.progress).toBe(4)
  })
})
