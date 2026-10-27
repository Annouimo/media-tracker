import { Hono } from 'hono'
import { getAdminState } from '../db/queries'
import { requireAccess } from '../middleware/access'
import type { AppEnv } from '../types'

const adminRoutes = new Hono<AppEnv>()

adminRoutes.use('*', requireAccess)

adminRoutes.get('/state', async (c) => {
  const state = await getAdminState(c.env.MEDIA_TRACKER_DB)
  c.header('Cache-Control', 'no-store')
  return c.json(state)
})

adminRoutes.get('/me', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ email: c.get('accessEmail') })
})

export { adminRoutes }
