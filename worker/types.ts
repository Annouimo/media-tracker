export type Bindings = {
  MEDIA_TRACKER_DB: D1Database

  // Cloudflare Access (non-secret configuration values).
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string

  // Local-only bypass; ignored unless the request host is localhost.
  DEV_AUTH_BYPASS?: string
}

export type AccessVariables = {
  accessEmail: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: AccessVariables
}
