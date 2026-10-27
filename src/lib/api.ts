import type { PublicHome, PublicWorkDetail } from '../../shared/types'
import { getJson } from './http'

export { ApiError } from './http'

export function getPublicHome(): Promise<PublicHome> {
  return getJson<PublicHome>('/api/public/home')
}

export function getPublicWork(id: string): Promise<PublicWorkDetail> {
  return getJson<PublicWorkDetail>(`/api/public/works/${encodeURIComponent(id)}`)
}
