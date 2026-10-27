import { Hono } from 'hono'
import { DomainError } from './domain/errors'
import { adminRoutes } from './routes/admin'
import { publicRoutes } from './routes/public'
import type { AppEnv } from './types'

export type { Bindings } from './types'

const app = new Hono<AppEnv>()

app.get('/api/health', async (c) => {
  if (!c.env.MEDIA_TRACKER_DB) {
    return c.json(
      {
        ok: false,
        db: 'missing_binding',
        service: 'media-tracker',
      },
      503,
    )
  }

  try {
    const row = await c.env.MEDIA_TRACKER_DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    return c.json({
      ok: row?.ok === 1,
      db: 'ok',
      service: 'media-tracker',
    })
  } catch {
    return c.json(
      {
        ok: false,
        db: 'query_error',
        service: 'media-tracker',
      },
      503,
    )
  }
})

app.route('/api/public', publicRoutes)
app.route('/admin/api', adminRoutes)

// Placeholder for future public API routes.
app.all('/api/*', (c) => c.json({ error: 'not_implemented' }, 501))

app.onError((error, c) => {
  if (error instanceof DomainError) {
    return new Response(
      JSON.stringify({
        error: error.code,
        message: error.message,
        details: error.details,
      }),
      {
        status: error.status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    )
  }

  console.error(error)
  return c.json(
    {
      error: 'internal_error',
      message: 'Internal server error',
    },
    500,
  )
})

export default app
