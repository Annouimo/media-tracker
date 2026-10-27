import { categoryForType, findCategory } from '../../shared/categories'
import type {
  AdminState,
  Log,
  LogEvent,
  LogSource,
  PublicHome,
  PublicLog,
  PublicWork,
  PublicWorkDetail,
  Work,
  WorkStatus,
  WorkWithState,
} from '../../shared/types'
import { notFound } from '../domain/errors'
import { isPublicWork } from '../domain/state'

const WORK_SELECT = `
  SELECT
    w.id, w.title, w.creator, w.release_year, w.type, w.total_progress,
    w.short_review, w.long_review_url, w.added_at, w.created_at, w.updated_at,
    w.legacy_id, w.deleted_at,
    l.seq AS latest_seq,
    l.event AS latest_event,
    l.status AS latest_status,
    l.progress AS latest_progress,
    l.total_snapshot AS latest_total_snapshot,
    l.round AS latest_round,
    l.logged_on AS latest_logged_on,
    l.logged_at AS latest_logged_at,
    (
      SELECT MAX(l2.logged_on)
      FROM logs l2
      WHERE l2.work_id = w.id AND l2.status = 'done'
    ) AS finished_on
  FROM works w
  LEFT JOIN logs l
    ON l.work_id = w.id
   AND l.seq = (SELECT MAX(l3.seq) FROM logs l3 WHERE l3.work_id = w.id)
  WHERE w.deleted_at IS NULL
`

type WorkStateRow = {
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
  latest_seq: number | null
  latest_event: LogEvent | null
  latest_status: WorkStatus | null
  latest_progress: number | null
  latest_total_snapshot: number | null
  latest_round: number | null
  latest_logged_on: string | null
  latest_logged_at: number | null
  finished_on: string | null
}

type LogRow = {
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
  inferred: number
  created_at: number
}

function toWork(row: WorkStateRow): Work {
  return {
    id: row.id,
    title: row.title,
    creator: row.creator,
    release_year: row.release_year,
    type: row.type,
    total_progress: row.total_progress,
    short_review: row.short_review,
    long_review_url: row.long_review_url,
    added_at: row.added_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    legacy_id: row.legacy_id,
    deleted_at: row.deleted_at,
  }
}

function toWorkWithState(row: WorkStateRow): WorkWithState {
  return {
    ...toWork(row),
    state: {
      status: row.latest_status ?? 'wish',
      progress: row.latest_progress ?? 0,
      totalSnapshot: row.latest_total_snapshot ?? row.total_progress,
      round: row.latest_round ?? 1,
      loggedOn: row.latest_logged_on,
      loggedAt: row.latest_logged_at,
      event: row.latest_event,
      finishedOn: row.finished_on,
    },
  }
}

function toLog(row: LogRow): Log {
  return {
    id: row.id,
    work_id: row.work_id,
    seq: row.seq,
    event: row.event,
    status: row.status,
    progress: row.progress,
    total_snapshot: row.total_snapshot,
    round: row.round,
    logged_on: row.logged_on,
    logged_at: row.logged_at,
    source: row.source,
    inferred: row.inferred === 1 ? 1 : 0,
    created_at: row.created_at,
  }
}

export function toPublicWork(work: WorkWithState): PublicWork {
  return {
    id: work.id,
    title: work.title,
    creator: work.creator,
    release_year: work.release_year,
    type: work.type,
    total_progress: work.total_progress,
    short_review: work.short_review,
    long_review_url: work.long_review_url,
    status: work.state.status,
    progress: work.state.progress,
    finished_on: work.state.finishedOn,
    is_reading: work.state.status === 'reading',
    is_read: work.state.finishedOn !== null,
  }
}

export function toPublicLog(log: Log): PublicLog {
  return {
    event: log.event,
    status: log.status,
    progress: log.progress,
    total_snapshot: log.total_snapshot,
    round: log.round,
    logged_on: log.logged_on,
    logged_at: log.logged_at,
  }
}

export async function listWorksWithState(db: D1Database): Promise<WorkWithState[]> {
  const result = await db.prepare(`${WORK_SELECT} ORDER BY w.id`).all<WorkStateRow>()
  return result.results.map(toWorkWithState)
}

export async function getWorkWithState(
  db: D1Database,
  id: string,
): Promise<WorkWithState | null> {
  const row = await db
    .prepare(`${WORK_SELECT} AND w.id = ?`)
    .bind(id)
    .first<WorkStateRow>()
  return row ? toWorkWithState(row) : null
}

export async function getWorkWithStateOrThrow(
  db: D1Database,
  id: string,
): Promise<WorkWithState> {
  const work = await getWorkWithState(db, id)
  if (!work) throw notFound()
  return work
}

export async function listLogsForWork(db: D1Database, workId: string): Promise<Log[]> {
  const result = await db
    .prepare(
      `SELECT id, work_id, seq, event, status, progress, total_snapshot, round,
              logged_on, logged_at, source, inferred, created_at
       FROM logs
       WHERE work_id = ?
       ORDER BY seq ASC`,
    )
    .bind(workId)
    .all<LogRow>()
  return result.results.map(toLog)
}

export async function getLatestLog(db: D1Database, workId: string): Promise<Log | null> {
  const row = await db
    .prepare(
      `SELECT id, work_id, seq, event, status, progress, total_snapshot, round,
              logged_on, logged_at, source, inferred, created_at
       FROM logs
       WHERE work_id = ?
       ORDER BY seq DESC
       LIMIT 1`,
    )
    .bind(workId)
    .first<LogRow>()
  return row ? toLog(row) : null
}

export async function getLogById(db: D1Database, id: string): Promise<Log | null> {
  const row = await db
    .prepare(
      `SELECT id, work_id, seq, event, status, progress, total_snapshot, round,
              logged_on, logged_at, source, inferred, created_at
       FROM logs
       WHERE id = ?`,
    )
    .bind(id)
    .first<LogRow>()
  return row ? toLog(row) : null
}

export async function listAllLogs(db: D1Database): Promise<Log[]> {
  const result = await db
    .prepare(
      `SELECT id, work_id, seq, event, status, progress, total_snapshot, round,
              logged_on, logged_at, source, inferred, created_at
       FROM logs
       ORDER BY work_id, seq`,
    )
    .all<LogRow>()
  return result.results.map(toLog)
}

export async function listPublicWorks(db: D1Database): Promise<WorkWithState[]> {
  return (await listWorksWithState(db)).filter(isPublicWork)
}

function splitPublicWorks(works: WorkWithState[]): PublicHome {
  const byActivity = (a: WorkWithState, b: WorkWithState): number =>
    (b.state.loggedOn ?? '').localeCompare(a.state.loggedOn ?? '') ||
    (b.state.loggedAt ?? 0) - (a.state.loggedAt ?? 0)

  const byFinished = (a: WorkWithState, b: WorkWithState): number =>
    (b.state.finishedOn ?? '').localeCompare(a.state.finishedOn ?? '')

  return {
    reading: works
      .filter((work) => work.state.status === 'reading')
      .sort(byActivity)
      .map(toPublicWork),
    reviews: works
      .filter((work) => work.state.finishedOn !== null && work.short_review.trim() !== '')
      .sort(byFinished)
      .map(toPublicWork),
    archive: works
      .filter((work) => work.state.finishedOn !== null && work.short_review.trim() === '')
      .sort(byFinished)
      .map(toPublicWork),
  }
}

/**
 * Public lists for one registered category. Returns null for an unregistered
 * slug so the route can answer 404.
 */
export async function publicCategory(
  db: D1Database,
  slug: string,
): Promise<PublicHome | null> {
  const category = findCategory(slug)
  if (!category) return null

  const works = (await listPublicWorks(db)).filter(
    (work) => categoryForType(work.type)?.slug === category.slug,
  )
  return splitPublicWorks(works)
}

export async function getPublicWork(
  db: D1Database,
  id: string,
): Promise<PublicWorkDetail | null> {
  const work = await getWorkWithState(db, id)
  if (!work || !isPublicWork(work)) return null

  const logs = await listLogsForWork(db, id)
  return {
    work: toPublicWork(work),
    logs: logs.map(toPublicLog),
  }
}

export async function getAdminState(db: D1Database): Promise<AdminState> {
  const [works, logs] = await Promise.all([listWorksWithState(db), listAllLogs(db)])
  return { works, logs }
}
