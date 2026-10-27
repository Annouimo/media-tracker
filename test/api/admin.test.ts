import { SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AdminMutationResult,
  AdminState,
  AdminUndoResult,
  AdminWorkDetail,
} from '../../shared/types'
import { resetDatabase } from '../helpers/db'

const ADMIN_BASE = 'http://localhost/admin/api'

function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`${ADMIN_BASE}${path}`, init)
}

function postJson(path: string, body: unknown): Promise<Response> {
  return adminFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await resetDatabase()
})

describe('admin API access', () => {
  it('allows localhost with DEV_AUTH_BYPASS', async () => {
    const response = await adminFetch('/state')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')

    const state = (await response.json()) as AdminState
    expect(state.works).toHaveLength(5)
    expect(state.logs).toHaveLength(8)
  })

  it('rejects non-local requests without an Access JWT', async () => {
    const response = await SELF.fetch('https://example.com/admin/api/state')
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized' })
  })

  it('exposes the local bypass identity for debugging', async () => {
    const response = await adminFetch('/me')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ email: 'dev@localhost' })
  })

  it('does not protect the public API', async () => {
    const response = await SELF.fetch('https://example.com/api/public/home')
    expect(response.status).toBe(200)
  })
})

describe('admin progress and status', () => {
  it('records progress and does not auto-finish the last chapter', async () => {
    const response = await postJson('/works/w-reading/progress', { progress: 4 })
    expect(response.status).toBe(200)

    const result = (await response.json()) as AdminMutationResult
    expect(result.work.state.status).toBe('reading')
    expect(result.work.state.progress).toBe(4)
    expect(result.log?.event).toBe('progress')

    const last = await postJson('/works/w-reading/progress', { progress: 10 })
    expect(last.status).toBe(200)
    const lastResult = (await last.json()) as AdminMutationResult
    expect(lastResult.work.state.status).toBe('reading')
    expect(lastResult.work.state.progress).toBe(10)
  })

  it('rejects progress on a done work', async () => {
    const response = await postJson('/works/w-done/progress', { progress: 1 })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: 'use_new_round' })
  })

  it('sets done manually, even when progress is below total', async () => {
    const response = await postJson('/works/w-reading/status', { status: 'done' })
    expect(response.status).toBe(200)

    const result = (await response.json()) as AdminMutationResult
    expect(result.work.state.status).toBe('done')
    expect(result.work.state.progress).toBe(3)
    expect(result.log?.event).toBe('status')
  })

  it('rejects wish as an admin status transition', async () => {
    const response = await postJson('/works/w-reading/status', { status: 'wish' })
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ error: 'validation_error' })
  })

  it('requires chapters or explicit binary mode when entering reading', async () => {
    const missing = await postJson('/works/w-wish/status', { status: 'reading' })
    expect(missing.status).toBe(409)
    await expect(missing.json()).resolves.toMatchObject({ error: 'needs_total_progress' })

    const chaptered = await postJson('/works/w-wish/status', {
      status: 'reading',
      total_progress: 5,
    })
    expect(chaptered.status).toBe(200)
    const result = (await chaptered.json()) as AdminMutationResult
    expect(result.work.state.status).toBe('reading')
    expect(result.work.total_progress).toBe(5)
  })

  it('starts a new round from done', async () => {
    const response = await postJson('/works/w-done/rounds', { confirm_binary: true })
    expect(response.status).toBe(200)

    const result = (await response.json()) as AdminMutationResult
    expect(result.work.state.status).toBe('reading')
    expect(result.work.state.round).toBe(2)
    expect(result.work.state.progress).toBe(0)
  })

  it('validates request bodies', async () => {
    const response = await postJson('/works/w-reading/progress', { progress: -1 })
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ error: 'validation_error' })
  })
})

describe('admin history and undo', () => {
  it('returns a work and its logs', async () => {
    const response = await adminFetch('/works/w-reread')
    expect(response.status).toBe(200)
    const detail = (await response.json()) as AdminWorkDetail
    expect(detail.work.title).toBe('Reread Book')
    expect(detail.logs.map((log) => log.round)).toEqual([1, 1, 2])
  })

  it('returns 404 for a missing work', async () => {
    const response = await adminFetch('/works/missing')
    expect(response.status).toBe(404)
  })

  it('only undoes the latest log', async () => {
    const detailResponse = await adminFetch('/works/w-done')
    const detail = (await detailResponse.json()) as AdminWorkDetail
    const [oldLog, latestLog] = detail.logs
    expect(oldLog).toBeDefined()
    expect(latestLog).toBeDefined()

    const old = await adminFetch(`/logs/${oldLog!.id}`, { method: 'DELETE' })
    expect(old.status).toBe(409)
    await expect(old.json()).resolves.toMatchObject({ error: 'conflict' })

    const latest = await adminFetch(`/logs/${latestLog!.id}`, { method: 'DELETE' })
    expect(latest.status).toBe(200)
    const result = (await latest.json()) as AdminUndoResult
    expect(result.deleted.id).toBe(latestLog!.id)
    expect(result.work.state.status).toBe('reading')
    expect(result.work.state.progress).toBe(0)
  })
})
