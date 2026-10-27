import { applyD1Migrations, env } from 'cloudflare:test'
import seedSql from './fixtures/seed.sql?raw'

await applyD1Migrations(env.MEDIA_TRACKER_DB, env.TEST_MIGRATIONS)
await env.MEDIA_TRACKER_DB.exec(seedSql)
