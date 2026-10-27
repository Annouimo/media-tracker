import type { AdminState } from '../../shared/types'
import { getJson } from './http'

export function getAdminState(): Promise<AdminState> {
  return getJson<AdminState>('/admin/api/state')
}

export function getAccessMe(): Promise<{ email: string }> {
  return getJson<{ email: string }>('/admin/api/me')
}
