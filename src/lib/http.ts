export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
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

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers })
  return parseResponse<T>(response)
}

export function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path)
}
