import type { ProgressInput, RoundInput, StatusInput } from '../../shared/schemas'
import type {
  AdminMutationResult,
  AdminState,
  AdminUndoResult,
  AdminWorkDetail,
} from '../../shared/types'
import { getJson, requestJson } from './http'

export function getAdminState(): Promise<AdminState> {
  return getJson<AdminState>('/admin/api/state')
}

export function getAdminWork(id: string): Promise<AdminWorkDetail> {
  return getJson<AdminWorkDetail>(`/admin/api/works/${encodeURIComponent(id)}`)
}

export function postProgress(id: string, input: ProgressInput): Promise<AdminMutationResult> {
  return requestJson<AdminMutationResult>(`/admin/api/works/${encodeURIComponent(id)}/progress`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function postStatus(id: string, input: StatusInput): Promise<AdminMutationResult> {
  return requestJson<AdminMutationResult>(`/admin/api/works/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function postRound(id: string, input: RoundInput): Promise<AdminMutationResult> {
  return requestJson<AdminMutationResult>(`/admin/api/works/${encodeURIComponent(id)}/rounds`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteLog(id: string): Promise<AdminUndoResult> {
  return requestJson<AdminUndoResult>(`/admin/api/logs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function getAccessMe(): Promise<{ email: string }> {
  return getJson<{ email: string }>('/admin/api/me')
}
