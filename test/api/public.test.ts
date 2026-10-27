import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { PublicHome, PublicWorkDetail } from '../../shared/types'

describe('public API', () => {
  it('serves the public home payload', async () => {
    const response = await SELF.fetch('https://example.com/api/public/home')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const home = (await response.json()) as PublicHome
    expect(home.reading.map((work) => work.title)).toEqual(['Reread Book', 'Reading Book'])
    expect(home.reviews.map((work) => work.title)).toEqual(['Done Book'])
    expect(home.archive.map((work) => work.title)).toEqual(['Reread Book'])
    expect(JSON.stringify(home)).not.toContain('legacy_id')
    expect(JSON.stringify(home)).not.toContain('created_at')
  })

  it('returns 404 for non-public works', async () => {
    for (const id of ['w-wish', 'w-paused', 'missing']) {
      const response = await SELF.fetch(`https://example.com/api/public/works/${id}`)
      expect(response.status).toBe(404)
    }
  })

  it('serves public details with chronological history', async () => {
    const response = await SELF.fetch('https://example.com/api/public/works/w-reread')
    expect(response.status).toBe(200)

    const detail = (await response.json()) as PublicWorkDetail
    expect(detail.work.title).toBe('Reread Book')
    expect(detail.work.is_reading).toBe(true)
    expect(detail.work.is_read).toBe(true)
    expect(detail.logs.map((log) => log.round)).toEqual([1, 1, 2])
  })

  it('supports ETag revalidation', async () => {
    const first = await SELF.fetch('https://example.com/api/public/home')
    const etag = first.headers.get('etag')
    expect(etag).toBeTruthy()

    const second = await SELF.fetch('https://example.com/api/public/home', {
      headers: { 'if-none-match': etag ?? '' },
    })
    expect(second.status).toBe(304)
  })

  it('keeps the health endpoint working', async () => {
    const response = await SELF.fetch('https://example.com/api/health')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      db: 'ok',
      service: 'media-tracker',
    })
  })
})
