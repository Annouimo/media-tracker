import { cloudflare } from '@cloudflare/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Deployment/build configuration is injected from environment variables.
  // Local development reads .env.local; Workers Builds reads build variables
  // configured in the Cloudflare dashboard.
  const env = loadEnv(mode, process.cwd(), '')
  const d1DatabaseId = process.env.D1_DATABASE_ID ?? env.D1_DATABASE_ID
  const d1DatabaseName = process.env.D1_DATABASE_NAME ?? env.D1_DATABASE_NAME
  const publicHost = process.env.PUBLIC_HOST ?? env.PUBLIC_HOST

  if (!d1DatabaseId || !d1DatabaseName) {
    throw new Error(
      'D1_DATABASE_ID and D1_DATABASE_NAME are required. ' +
        'Set them in .env.local for local development, or as Workers Builds build variables.',
    )
  }

  // The production subdomain is deployment configuration, not source code.
  // It is required in Workers Builds so a build cannot silently deploy
  // without the intended custom domain.
  if (process.env.WORKERS_CI && !publicHost) {
    throw new Error('PUBLIC_HOST is required in Workers Builds.')
  }

  return {
    plugins: [
      vue(),
      cloudflare({
        config: {
          d1_databases: [
            {
              binding: 'DB',
              database_name: d1DatabaseName,
              database_id: d1DatabaseId,
            },
          ],
          ...(publicHost
            ? {
                routes: [
                  {
                    pattern: publicHost,
                    custom_domain: true,
                  },
                ],
              }
            : {}),
        },
      }),
    ],
  }
})
