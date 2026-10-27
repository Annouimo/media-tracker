export const WORK_STATUSES = ['wish', 'reading', 'done', 'paused', 'dropped'] as const
export type WorkStatus = (typeof WORK_STATUSES)[number]

export const LOG_EVENTS = ['progress', 'status', 'both'] as const
export type LogEvent = (typeof LOG_EVENTS)[number]

export const LOG_SOURCES = ['user', 'migration'] as const
export type LogSource = (typeof LOG_SOURCES)[number]

export type Work = {
  id: string
  title: string
  creator: string
  release_year: number | null
  type: string
  total_progress: number
  short_review: string
  long_review_url: string
  added_at: number | null
  created_at: number
  updated_at: number
  legacy_id: number | null
  deleted_at: number | null
}

export type Log = {
  id: string
  work_id: string
  seq: number
  event: LogEvent
  status: WorkStatus
  progress: number
  total_snapshot: number
  round: number
  logged_on: string
  logged_at: number | null
  source: LogSource
  inferred: 0 | 1
  created_at: number
}

export type WorkState = {
  status: WorkStatus
  progress: number
  totalSnapshot: number
  round: number
  loggedOn: string | null
  loggedAt: number | null
  event: LogEvent | null
  finishedOn: string | null
}

export type WorkWithState = Work & {
  state: WorkState
}

export type PublicWork = {
  id: string
  title: string
  creator: string
  release_year: number | null
  type: string
  total_progress: number
  short_review: string
  long_review_url: string
  status: WorkStatus
  progress: number
  finished_on: string | null
  is_reading: boolean
  is_read: boolean
}

export type PublicLog = {
  event: LogEvent
  status: WorkStatus
  progress: number
  total_snapshot: number
  round: number
  logged_on: string
  logged_at: number | null
}

export type PublicWorkDetail = {
  work: PublicWork
  logs: PublicLog[]
}

export type PublicHome = {
  reading: PublicWork[]
  reviews: PublicWork[]
  archive: PublicWork[]
}

export type AdminState = {
  works: WorkWithState[]
  logs: Log[]
}

export type AdminWorkDetail = {
  work: WorkWithState
  logs: Log[]
}

export type AdminMutationResult = {
  work: WorkWithState
  log: Log | null
}

export type AdminUndoResult = {
  work: WorkWithState
  deleted: Log
}

export type ApiErrorBody = {
  error: string
  message: string
  details?: Record<string, unknown>
}
