import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Reject cross-origin writes. Cloudflare Access protects the endpoint, but
 * this also blocks a logged-in browser from being used as a CSRF proxy.
 */
export const requireSameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!WRITE_METHODS.has(c.req.method)) return next()

  const origin = c.req.header('origin')
  if (!origin) {
    return c.json(
      {
        error: 'invalid_origin',
        message: 'Origin header is required for write requests.',
      },
      403,
    )
  }

  const expected = new URL(c.req.url).origin
  if (origin !== expected) {
    return c.json(
      {
        error: 'invalid_origin',
        message: 'Cross-origin write request rejected.',
      },
      403,
    )
  }

  await next()
}
