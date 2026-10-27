import { Hono, type Context } from 'hono'
import type { ZodType } from 'zod'
import {
  createWorkSchema,
  progressInputSchema,
  roundInputSchema,
  statusInputSchema,
  updateWorkSchema,
} from '../../shared/schemas'
import { getAdminState, getLatestLog, getWorkWithState, listLogsForWork } from '../db/queries'
import {
  createWorkWithInitialLog,
  setProgress,
  setStatus,
  startNewRound,
  undoLog,
  updateWork,
} from '../db/mutations'
import { notFound } from '../domain/errors'
import { requireAccess } from '../middleware/access'
import { requireSameOrigin } from '../middleware/origin'
import type { AppEnv } from '../types'

const adminRoutes = new Hono<AppEnv>()

adminRoutes.use('*', requireAccess)
adminRoutes.use('*', requireSameOrigin)

function noStore(c: Context<AppEnv>): void {
  c.header('Cache-Control', 'no-store')
}

async function readBody<T>(c: Context<AppEnv>, schema: ZodType<T>): Promise<T | Response> {
  let data: unknown
  try {
    data = await c.req.json()
  } catch {
    return c.json(
      {
        error: 'validation_error',
        message: 'Invalid JSON body.',
      },
      422,
    )
  }

  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    return c.json(
      {
        error: 'validation_error',
        message: 'Invalid request body.',
        details: { issues: parsed.error.issues },
      },
      422,
    )
  }

  return parsed.data
}

adminRoutes.get('/state', async (c) => {
  const state = await getAdminState(c.env.MEDIA_TRACKER_DB)
  noStore(c)
  return c.json(state)
})

adminRoutes.get('/me', (c) => {
  noStore(c)
  return c.json({ email: c.get('accessEmail') })
})

adminRoutes.post('/works', async (c) => {
  const body = await readBody(c, createWorkSchema)
  if (body instanceof Response) return body

  const work = await createWorkWithInitialLog(c.env.MEDIA_TRACKER_DB, body)
  const log =
    work.state.status === 'wish'
      ? null
      : await getLatestLog(c.env.MEDIA_TRACKER_DB, work.id)

  noStore(c)
  return c.json({ work, log }, 201)
})

adminRoutes.patch('/works/:id', async (c) => {
  const body = await readBody(c, updateWorkSchema)
  if (body instanceof Response) return body

  const work = await updateWork(c.env.MEDIA_TRACKER_DB, c.req.param('id'), body)
  noStore(c)
  return c.json({ work, log: null })
})

adminRoutes.get('/works/:id', async (c) => {
  const work = await getWorkWithState(c.env.MEDIA_TRACKER_DB, c.req.param('id'))
  if (!work) throw notFound('Work not found')

  const logs = await listLogsForWork(c.env.MEDIA_TRACKER_DB, work.id)
  noStore(c)
  return c.json({ work, logs })
})

adminRoutes.post('/works/:id/progress', async (c) => {
  const body = await readBody(c, progressInputSchema)
  if (body instanceof Response) return body

  const result = await setProgress(c.env.MEDIA_TRACKER_DB, c.req.param('id'), body)
  noStore(c)
  return c.json(result)
})

adminRoutes.post('/works/:id/status', async (c) => {
  const body = await readBody(c, statusInputSchema)
  if (body instanceof Response) return body

  const result = await setStatus(c.env.MEDIA_TRACKER_DB, c.req.param('id'), body)
  noStore(c)
  return c.json(result)
})

adminRoutes.post('/works/:id/rounds', async (c) => {
  const body = await readBody(c, roundInputSchema)
  if (body instanceof Response) return body

  const result = await startNewRound(c.env.MEDIA_TRACKER_DB, c.req.param('id'), body)
  noStore(c)
  return c.json(result)
})

adminRoutes.delete('/logs/:id', async (c) => {
  const result = await undoLog(c.env.MEDIA_TRACKER_DB, c.req.param('id'))
  noStore(c)
  return c.json(result)
})

export { adminRoutes }
