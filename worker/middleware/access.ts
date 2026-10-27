import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function teamOrigin(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  return new URL(withScheme).origin
}

function getJwks(origin: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByTeam.get(origin)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${origin}/cdn-cgi/access/certs`))
    jwksByTeam.set(origin, jwks)
  }
  return jwks
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  )
}

/**
 * Protect /admin/api/*.
 *
 * - Localhost + DEV_AUTH_BYPASS=1 skips Access (only local requests).
 * - Otherwise requires a valid Cloudflare Access JWT.
 * - Fails closed with 503 when Access is not configured.
 */
export const requireAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  const hostname = new URL(c.req.url).hostname

  if (c.env.DEV_AUTH_BYPASS === '1' && isLocalHost(hostname)) {
    c.set('accessEmail', 'dev@localhost')
    return next()
  }

  const team = c.env.ACCESS_TEAM_DOMAIN
  const audience = c.env.ACCESS_AUD
  if (!team || !audience) {
    return c.json(
      {
        error: 'access_not_configured',
        message: 'Cloudflare Access is not configured for this Worker.',
      },
      503,
    )
  }

  const token = c.req.header('cf-access-jwt-assertion')
  if (!token) {
    return c.json(
      {
        error: 'unauthorized',
        message: 'Cloudflare Access login is required.',
      },
      401,
    )
  }

  try {
    const origin = teamOrigin(team)
    const { payload } = await jwtVerify(token, getJwks(origin), {
      issuer: origin,
      audience,
    })

    const email = typeof payload.email === 'string' ? payload.email : ''
    c.set('accessEmail', email)
    await next()
  } catch {
    return c.json(
      {
        error: 'unauthorized',
        message: 'Invalid Cloudflare Access token.',
      },
      401,
    )
  }
}
