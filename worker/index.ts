import { Hono } from 'hono'

/**
 * Worker bindings.
 *
 * The D1 binding is injected from deployment/build environment variables by
 * `vite.config.ts`; it is never hardcoded in `wrangler.jsonc`.
 */
export type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/health', async (c) => {
  try {
    const row = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
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
