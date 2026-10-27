import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { AdminState } from '../../shared/types'

describe('admin API access', () => {
  it('allows localhost with DEV_AUTH_BYPASS', async () => {
    const response = await SELF.fetch('http://localhost/admin/api/state')
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
    const response = await SELF.fetch('http://localhost/admin/api/me')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ email: 'dev@localhost' })
  })

  it('does not protect the public API', async () => {
    const response = await SELF.fetch('https://example.com/api/public/home')
    expect(response.status).toBe(200)
  })
})
