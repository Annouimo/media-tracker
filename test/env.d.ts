/// <reference types="@cloudflare/vitest-plugin/types" />
import type { D1Migration } from '@cloudflare/vitest-plugin'

declare global {
  namespace Cloudflare {
    interface Env {
      MEDIA_TRACKER_DB: D1Database
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}
