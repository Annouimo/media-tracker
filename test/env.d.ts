/// <reference types="@cloudflare/vitest-plugin/types" />
import type { D1Migration } from '@cloudflare/vitest-plugin'

declare global {
  namespace Cloudflare {
    interface Env {
      MEDIA_TRACKER_DB: D1Database
      TEST_MIGRATIONS: D1Migration[]
      DEV_AUTH_BYPASS?: string
      ACCESS_TEAM_DOMAIN?: string
      ACCESS_AUD?: string
    }
  }
}

export {}
