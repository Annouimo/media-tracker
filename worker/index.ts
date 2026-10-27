import { Hono } from 'hono'

/**
 * Worker bindings.
 *
 * `DB` is optional until the D1 database is created and bound in
 * `wrangler.jsonc`. See the README for the setup steps.
 */
export type Bindings = {
  DB?: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'media-tracker',
  }),
)

// Placeholder: every other API route is intentionally unimplemented while the
// data model and migration are being designed.
app.all('/api/*', (c) => c.json({ error: 'not_implemented' }, 501))

export default app
