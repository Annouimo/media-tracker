import { SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AdminMutationResult,
  PublicHome,
  PublicWorkDetail,
} from '../../shared/types'
import { resetDatabase } from '../helpers/db'

const ADMIN_BASE = 'http://localhost/admin/api'
const PUBLIC_BASE = 'https://example.com/api/public'

function adminPost(path: string, body: unknown): Promise<Response> {
  return SELF.fetch(`${ADMIN_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await resetDatabase()
})

describe('critical public/admin flow', () => {
  it('publishes a created work and unpublishes it after undoing its only log', async () => {
    const createResponse = await adminPost('/works', {
      title: 'E2E Finished Book',
      creator: 'E2E Author',
      status: 'done',
      total_progress: 1,
      progress: 1,
      short_review: 'Created through the admin JSON API.',
    })
    expect(createResponse.status).toBe(201)

    const created = (await createResponse.json()) as AdminMutationResult
    const workId = created.work.id
    expect(created.work.state.status).toBe('done')
    expect(created.log).not.toBeNull()

    const booksResponse = await SELF.fetch(`${PUBLIC_BASE}/categories/book`)
    expect(booksResponse.status).toBe(200)
    const books = (await booksResponse.json()) as PublicHome
    expect(books.reviews.some((work) => work.id === workId)).toBe(true)

    const detailResponse = await SELF.fetch(`${PUBLIC_BASE}/works/${workId}`)
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as PublicWorkDetail
    expect(detail.work.short_review).toBe('Created through the admin JSON API.')
    expect(detail.logs).toHaveLength(1)
    expect(JSON.stringify(detail)).not.toContain('legacy_id')

    const undoResponse = await SELF.fetch(`http://localhost/admin/api/logs/${created.log!.id}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost' },
    })
    expect(undoResponse.status).toBe(200)

    const afterUndo = await SELF.fetch(`${PUBLIC_BASE}/works/${workId}`)
    expect(afterUndo.status).toBe(404)

    const booksAfterUndo = (await (
      await SELF.fetch(`${PUBLIC_BASE}/categories/book`)
    ).json()) as PublicHome
    expect(booksAfterUndo.reviews.some((work) => work.id === workId)).toBe(false)
  })

  it('keeps a new textbook out of the book category', async () => {
    const createResponse = await adminPost('/works', {
      title: 'E2E Textbook',
      creator: 'E2E Author',
      type: 'Textbook',
      status: 'done',
      total_progress: 10,
      progress: 10,
    })
    expect(createResponse.status).toBe(201)

    const created = (await createResponse.json()) as AdminMutationResult
    const workId = created.work.id

    const textbooks = (await (
      await SELF.fetch(`${PUBLIC_BASE}/categories/textbook`)
    ).json()) as PublicHome
    expect(textbooks.archive.some((work) => work.id === workId)).toBe(true)

    const books = (await (
      await SELF.fetch(`${PUBLIC_BASE}/categories/book`)
    ).json()) as PublicHome
    expect(books.archive.some((work) => work.id === workId)).toBe(false)
  })
})
