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
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  })
}

function patchJson(path: string, body: unknown): Promise<Response> {
  return adminFetch(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
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

  it('adds security headers to Worker responses', async () => {
    const response = await SELF.fetch('https://example.com/api/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000')
  })

  it('marks admin responses noindex', async () => {
    const response = await adminFetch('/state')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('rejects writes without an Origin header', async () => {
    const response = await adminFetch('/works/w-reading/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress: 4 }),
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_origin' })
  })

  it('rejects cross-origin writes', async () => {
    const response = await adminFetch('/works/w-reading/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ progress: 4 }),
    })
    expect(response.status).toBe(403)
  })

  it('accepts same-origin writes', async () => {
    const response = await postJson('/works/w-reading/progress', { progress: 4 })
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

describe('admin create and update', () => {
  it('creates a wish work without a log', async () => {
    const response = await postJson('/works', { title: 'New Wish' })
    expect(response.status).toBe(201)

    const result = (await response.json()) as AdminMutationResult
    expect(result.work.title).toBe('New Wish')
    expect(result.work.state.status).toBe('wish')
    expect(result.log).toBeNull()

    const detail = (await (await adminFetch(`/works/${result.work.id}`)).json()) as AdminWorkDetail
    expect(detail.logs).toHaveLength(0)
  })

  it('creates a reading work with an initial log', async () => {
    const response = await postJson('/works', {
      title: 'New Reading',
      status: 'reading',
      total_progress: 5,
      progress: 2,
    })
    expect(response.status).toBe(201)

    const result = (await response.json()) as AdminMutationResult
    expect(result.work.state.status).toBe('reading')
    expect(result.work.state.progress).toBe(2)
    expect(result.log?.event).toBe('both')
    expect(result.log?.status).toBe('reading')
  })

  it('creates a done work with a date-only initial log', async () => {
    const response = await postJson('/works', {
      title: 'New Done',
      status: 'done',
      total_progress: 3,
      progress: 2,
      finished_on: '2026-10-05',
    })
    expect(response.status).toBe(201)

    const result = (await response.json()) as AdminMutationResult
    expect(result.work.state.status).toBe('done')
    expect(result.work.state.finishedOn).toBe('2026-10-05')
    expect(result.log?.logged_on).toBe('2026-10-05')
    expect(result.log?.logged_at).toBeNull()
  })

  it('rejects id and other server-owned fields', async () => {
    const response = await postJson('/works', { title: 'Bad', id: 'not-allowed' })
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ error: 'validation_error' })
  })

  it('handles the binary reading prompt on create', async () => {
    const missing = await postJson('/works', { title: 'Binary', status: 'reading' })
    expect(missing.status).toBe(409)
    await expect(missing.json()).resolves.toMatchObject({ error: 'needs_total_progress' })

    const confirmed = await postJson('/works', {
      title: 'Binary',
      status: 'reading',
      confirm_binary: true,
    })
    expect(confirmed.status).toBe(201)
    const result = (await confirmed.json()) as AdminMutationResult
    expect(result.work.state.status).toBe('reading')
    expect(result.work.total_progress).toBe(1)
  })

  it('updates metadata without touching status', async () => {
    const response = await patchJson('/works/w-done', {
      title: 'Done Book Revised',
      short_review: 'Updated review',
      long_review_url: 'https://example.com/updated',
    })
    expect(response.status).toBe(200)

    const result = (await response.json()) as AdminMutationResult
    expect(result.work.title).toBe('Done Book Revised')
    expect(result.work.short_review).toBe('Updated review')
    expect(result.work.state.status).toBe('done')
    expect(result.log).toBeNull()
  })

  it('rejects status changes through the edit endpoint', async () => {
    const response = await patchJson('/works/w-done', { status: 'reading' })
    expect(response.status).toBe(422)
  })

  it('rejects lowering total_progress below current progress', async () => {
    const response = await patchJson('/works/w-reading', { total_progress: 2 })
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_total_progress' })
  })

  it('returns 404 when editing a missing work', async () => {
    const response = await patchJson('/works/missing', { title: 'Missing' })
    expect(response.status).toBe(404)
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

    const old = await adminFetch(`/logs/${oldLog!.id}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost' },
    })
    expect(old.status).toBe(409)
    await expect(old.json()).resolves.toMatchObject({ error: 'conflict' })

    const latest = await adminFetch(`/logs/${latestLog!.id}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost' },
    })
    expect(latest.status).toBe(200)
    const result = (await latest.json()) as AdminUndoResult
    expect(result.deleted.id).toBe(latestLog!.id)
    expect(result.work.state.status).toBe('reading')
    expect(result.work.state.progress).toBe(0)
  })
})
