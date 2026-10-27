import { Hono } from 'hono'
import { publicRoutes } from './routes/public'
import type { Bindings } from './types'

export type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

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

// Placeholder for admin routes, implemented in M3+.
app.all('/api/*', (c) => c.json({ error: 'not_implemented' }, 501))

app.onError((error, c) => {
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
