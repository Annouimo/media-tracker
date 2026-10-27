import { Hono, type Context } from 'hono'
import { getPublicWork, publicCategory } from '../db/queries'
import { makeEtag } from '../lib/etag'
import type { Bindings } from '../types'

const publicRoutes = new Hono<{ Bindings: Bindings }>()

async function jsonWithCache(c: Context<{ Bindings: Bindings }>, data: unknown): Promise<Response> {
  const body = JSON.stringify(data)
  const etag = await makeEtag(body)

  c.header('ETag', etag)
  c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')

  if (c.req.header('if-none-match') === etag) {
    return c.body(null, 304)
  }

  return c.body(body, 200, {
    'content-type': 'application/json; charset=utf-8',
  })
}

publicRoutes.get('/categories/:slug', async (c) => {
  const data = await publicCategory(c.env.MEDIA_TRACKER_DB, c.req.param('slug'))
  if (!data) {
    return c.json({
      error: 'not_found',
      message: 'Category not found',
    }, 404)
  }
  return jsonWithCache(c, data)
})

publicRoutes.get('/works/:id', async (c) => {
  const detail = await getPublicWork(c.env.MEDIA_TRACKER_DB, c.req.param('id'))
  if (!detail) {
    return c.json({
      error: 'not_found',
      message: 'Work not found',
    }, 404)
  }
  return jsonWithCache(c, detail)
})

export { publicRoutes }
