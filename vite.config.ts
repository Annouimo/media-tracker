import { cloudflare } from '@cloudflare/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// D1 bindings and custom domains are managed in the Cloudflare dashboard.
// The build intentionally contains no route or binding IDs.
export default defineConfig({
  plugins: [vue(), cloudflare()],
})
