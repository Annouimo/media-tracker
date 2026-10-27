import { cloudflare } from '@cloudflare/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // D1 is bound in the Cloudflare dashboard as MEDIA_TRACKER_DB; it is deliberately not
  // part of the build configuration. Only the public host is deployment
  // configuration here.
  const env = loadEnv(mode, process.cwd(), '')
  const publicHost = process.env.PUBLIC_HOST ?? env.PUBLIC_HOST

  // Keep the production custom domain out of source code. It is required in
  // Workers Builds so a build cannot silently deploy to the wrong host.
  if (process.env.WORKERS_CI && !publicHost) {
    throw new Error('PUBLIC_HOST is required in Workers Builds.')
  }

  return {
    plugins: [
      vue(),
      cloudflare({
        config: publicHost
          ? {
              routes: [
                {
                  pattern: publicHost,
                  custom_domain: true,
                },
              ],
            }
          : {},
      }),
    ],
  }
})
