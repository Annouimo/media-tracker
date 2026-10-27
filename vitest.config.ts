import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: path.join(root, 'wrangler.jsonc') },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(root, 'migrations')),
          DEV_AUTH_BYPASS: '1',
          ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com',
          ACCESS_AUD: 'test-aud',
        },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: [path.join(root, 'test/setup.ts')],
  },
})
