import { Hono } from 'hono'

/**
 * Worker bindings.
 *
 * `MEDIA_TRACKER_DB` is a D1 binding configured in the Cloudflare dashboard. The binding
 * name is part of our runtime contract; the database ID is not stored here.
 */
export type Bindings = {
  MEDIA_TRACKER_DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/health', async (c) => {
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
        db: 'error',
        service: 'media-tracker',
      },
      503,
    )
  }
})

// Placeholder: business routes are implemented in later milestones.
app.all('/api/*', (c) => c.json({ error: 'not_implemented' }, 501))

export default app
