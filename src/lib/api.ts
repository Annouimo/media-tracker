import type { PublicHome, PublicWorkDetail } from '../../shared/types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    let message = response.status === 404 ? '没有找到这个作品' : `请求失败（${response.status}）`
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // Keep the generic message if the response is not JSON.
    }
    throw new ApiError(response.status, message)
  }

  return (await response.json()) as T
}

export function getPublicHome(): Promise<PublicHome> {
  return getJson<PublicHome>('/api/public/home')
}

export function getPublicWork(id: string): Promise<PublicWorkDetail> {
  return getJson<PublicWorkDetail>(`/api/public/works/${encodeURIComponent(id)}`)
}
