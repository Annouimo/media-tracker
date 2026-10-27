import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()

  const headers = c.res.headers
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  )

  if (new URL(c.req.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (c.req.path.startsWith('/admin/')) {
    headers.set('X-Robots-Tag', 'noindex')
  }
}
