export type DomainErrorCode =
  | 'not_found'
  | 'invalid_transition'
  | 'needs_total_progress'
  | 'use_new_round'
  | 'invalid_progress'
  | 'invalid_total_progress'
  | 'conflict'

export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(
    code: DomainErrorCode,
    message: string,
    status = 409,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function notFound(message = 'Work not found'): DomainError {
  return new DomainError('not_found', message, 404)
}

export function invalidTransition(from: string, to: string): DomainError {
  return new DomainError('invalid_transition', `Cannot change status from ${from} to ${to}`, 409, {
    from,
    to,
  })
}

export function needsTotalProgress(): DomainError {
  return new DomainError(
    'needs_total_progress',
    'This work has no chapter count yet. Provide total_progress or confirm binary mode.',
    409,
    { current_total_progress: 1 },
  )
}

export function useNewRound(): DomainError {
  return new DomainError(
    'use_new_round',
    'This work is already done. Start a new round before recording more progress.',
    409,
  )
}

export function invalidProgress(message: string): DomainError {
  return new DomainError('invalid_progress', message, 422)
}

export function invalidTotalProgress(message: string): DomainError {
  return new DomainError('invalid_total_progress', message, 422)
}
