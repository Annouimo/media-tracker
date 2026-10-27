import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import {
  getAdminState,
  getPublicWork,
  getWorkWithState,
  listLogsForWork,
  listWorksWithState,
  publicHome,
} from '../../worker/db/queries'

describe('D1 queries', () => {
  it('lists the fixture works with derived state', async () => {
    const works = await listWorksWithState(env.MEDIA_TRACKER_DB)
    expect(works).toHaveLength(5)

    const byId = new Map(works.map((work) => [work.id, work]))
    expect(byId.get('w-wish')?.state.status).toBe('wish')
    expect(byId.get('w-reading')?.state.status).toBe('reading')
    expect(byId.get('w-reading')?.state.progress).toBe(3)
    expect(byId.get('w-done')?.state.finishedOn).toBe('2026-10-02')
    expect(byId.get('w-paused')?.state.status).toBe('paused')
    expect(byId.get('w-reread')?.state.round).toBe(2)
    expect(byId.get('w-reread')?.state.finishedOn).toBe('2026-09-02')
  })

  it('splits the public home into reading, reviews, and archive', async () => {
    const home = await publicHome(env.MEDIA_TRACKER_DB)
    expect(home.reading.map((work) => work.title)).toEqual(['Reread Book', 'Reading Book'])
    expect(home.reviews.map((work) => work.title)).toEqual(['Done Book'])
    expect(home.archive.map((work) => work.title)).toEqual(['Reread Book'])

    expect(home.reviews[0]?.is_read).toBe(true)
    expect(home.reading.find((work) => work.id === 'w-reread')?.is_read).toBe(true)
    expect(home.reading.find((work) => work.id === 'w-reading')?.is_read).toBe(false)
  })

  it('returns public detail with chronological logs', async () => {
    const detail = await getPublicWork(env.MEDIA_TRACKER_DB, 'w-reread')
    expect(detail?.work.title).toBe('Reread Book')
    expect(detail?.logs.map((log) => log.round)).toEqual([1, 1, 2])

    expect(await getPublicWork(env.MEDIA_TRACKER_DB, 'w-paused')).toBeNull()
    expect(await getPublicWork(env.MEDIA_TRACKER_DB, 'w-wish')).toBeNull()
    expect(await getPublicWork(env.MEDIA_TRACKER_DB, 'missing')).toBeNull()
  })

  it('lists logs and admin state', async () => {
    const logs = await listLogsForWork(env.MEDIA_TRACKER_DB, 'w-reread')
    expect(logs.map((log) => log.seq)).toEqual([1, 2, 3])

    const admin = await getAdminState(env.MEDIA_TRACKER_DB)
    expect(admin.works).toHaveLength(5)
    expect(admin.logs).toHaveLength(8)
  })

  it('returns null for a missing work', async () => {
    expect(await getWorkWithState(env.MEDIA_TRACKER_DB, 'missing')).toBeNull()
  })
})
