import { env } from 'cloudflare:test'
import seedSql from '../fixtures/seed.sql?raw'

export async function resetDatabase(): Promise<void> {
  await env.MEDIA_TRACKER_DB.batch([
    env.MEDIA_TRACKER_DB.prepare('DELETE FROM logs'),
    env.MEDIA_TRACKER_DB.prepare('DELETE FROM works'),
  ])
  await env.MEDIA_TRACKER_DB.exec(seedSql)
}
