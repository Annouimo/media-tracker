import type {
  CreateWorkInput,
  ProgressInput,
  RoundInput,
  StatusInput,
  UpdateWorkInput,
} from '../../shared/schemas'
import { localDayFromEpoch, resolveLoggedAt } from '../../shared/dates'
import type { Log, LogEvent, Work, WorkStatus, WorkWithState } from '../../shared/types'
import {
  DomainError,
  invalidTotalProgress,
  invalidTransition,
  notFound,
  needsTotalProgress,
} from '../domain/errors'
import {
  assertCanSetStatus,
  assertProgressWithinTotal,
  resolveTotalProgress,
  statusAfterProgress,
} from '../domain/state'
import { getLatestLog, getWorkWithStateOrThrow } from './queries'

function newId(): string {
  return crypto.randomUUID()
}

const WORK_COLUMNS = [
  'id',
  'title',
  'creator',
  'release_year',
  'type',
  'total_progress',
  'short_review',
  'long_review_url',
  'added_at',
  'created_at',
  'updated_at',
  'legacy_id',
  'deleted_at',
] as const

const LOG_COLUMNS = [
  'id',
  'work_id',
  'seq',
  'event',
  'status',
  'progress',
  'total_snapshot',
  'round',
  'logged_on',
  'logged_at',
  'source',
  'inferred',
  'created_at',
] as const

function insertWorkStatement(db: D1Database, work: Work): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO works (${WORK_COLUMNS.join(', ')})
       VALUES (${WORK_COLUMNS.map(() => '?').join(', ')})`,
    )
    .bind(...WORK_COLUMNS.map((column) => work[column]))
}

function insertLogStatement(db: D1Database, log: Log): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO logs (${LOG_COLUMNS.join(', ')})
       VALUES (${LOG_COLUMNS.map(() => '?').join(', ')})`,
    )
    .bind(...LOG_COLUMNS.map((column) => log[column]))
}

function updateTotalStatement(
  db: D1Database,
  workId: string,
  total: number,
  now: number,
): D1PreparedStatement {
  return db
    .prepare('UPDATE works SET total_progress = ?, updated_at = ? WHERE id = ?')
    .bind(total, now, workId)
}

type BuildLogInput = {
  workId: string
  seq: number
  event: LogEvent
  status: WorkStatus
  progress: number
  totalSnapshot: number
  round: number
  loggedOn: string
  loggedAt: number | null
  now: number
}

function buildLog(input: BuildLogInput): Log {
  return {
    id: newId(),
    work_id: input.workId,
    seq: input.seq,
    event: input.event,
    status: input.status,
    progress: input.progress,
    total_snapshot: input.totalSnapshot,
    round: input.round,
    logged_on: input.loggedOn,
    logged_at: input.loggedAt,
    source: 'user',
    inferred: 0,
    created_at: input.now,
  }
}

export async function createWorkWithInitialLog(
  db: D1Database,
  input: CreateWorkInput,
  now = Date.now(),
): Promise<WorkWithState> {
  const status = input.status
  const total = input.total_progress
  const progress = input.progress ?? (status === 'done' ? total : 0)

  if (status === 'reading' && total <= 1 && !input.confirm_binary) {
    throw needsTotalProgress()
  }

  assertProgressWithinTotal(progress, total)

  const work: Work = {
    id: newId(),
    title: input.title,
    creator: input.creator,
    release_year: input.release_year === 0 ? null : (input.release_year ?? null),
    type: input.type,
    total_progress: total,
    short_review: input.short_review,
    long_review_url: input.long_review_url,
    added_at: now,
    created_at: now,
    updated_at: now,
    legacy_id: null,
    deleted_at: null,
  }

  const statements: D1PreparedStatement[] = [insertWorkStatement(db, work)]

  if (status !== 'wish') {
    const logged =
      status === 'done' && input.finished_on
        ? { loggedOn: input.finished_on, loggedAt: null }
        : { loggedOn: localDayFromEpoch(now), loggedAt: now }

    statements.push(
      insertLogStatement(
        db,
        buildLog({
          workId: work.id,
          seq: 1,
          event: 'both',
          status,
          progress,
          totalSnapshot: total,
          round: 1,
          loggedOn: logged.loggedOn,
          loggedAt: logged.loggedAt,
          now,
        }),
      ),
    )
  }

  await db.batch(statements)
  return getWorkWithStateOrThrow(db, work.id)
}

export type MutationResult = {
  work: WorkWithState
  log: Log | null
}

export async function setProgress(
  db: D1Database,
  workId: string,
  input: ProgressInput,
  now = Date.now(),
): Promise<MutationResult> {
  const work = await getWorkWithStateOrThrow(db, workId)
  const current = work.state
  const nextStatus = statusAfterProgress(current.status)

  let total = work.total_progress
  if (nextStatus === 'reading') {
    total = resolveTotalProgress(work, input.total_progress, input.confirm_binary)
  } else if (input.total_progress != null) {
    total = input.total_progress
  }

  assertProgressWithinTotal(input.progress, total)

  const logged = resolveLoggedAt(input.logged_on, now)
  const latest = await getLatestLog(db, workId)
  const log = buildLog({
    workId,
    seq: (latest?.seq ?? 0) + 1,
    event: nextStatus === current.status ? 'progress' : 'both',
    status: nextStatus,
    progress: input.progress,
    totalSnapshot: total,
    round: current.round,
    loggedOn: logged.loggedOn,
    loggedAt: logged.loggedAt,
    now,
  })

  const statements = [insertLogStatement(db, log)]
  if (total !== work.total_progress) {
    statements.push(updateTotalStatement(db, workId, total, now))
  }
  await db.batch(statements)

  return { work: await getWorkWithStateOrThrow(db, workId), log }
}

export async function setStatus(
  db: D1Database,
  workId: string,
  input: StatusInput,
  now = Date.now(),
): Promise<MutationResult> {
  const work = await getWorkWithStateOrThrow(db, workId)
  const current = work.state

  if (input.status === current.status) {
    return { work, log: null }
  }

  assertCanSetStatus(current.status, input.status)

  let total = work.total_progress
  if (input.status === 'reading') {
    total = resolveTotalProgress(work, input.total_progress, input.confirm_binary)
  } else if (input.total_progress != null) {
    total = input.total_progress
  }

  assertProgressWithinTotal(current.progress, total)

  const logged = resolveLoggedAt(input.logged_on, now)
  const latest = await getLatestLog(db, workId)
  const log = buildLog({
    workId,
    seq: (latest?.seq ?? 0) + 1,
    event: 'status',
    status: input.status,
    progress: current.progress,
    totalSnapshot: total,
    round: current.round,
    loggedOn: logged.loggedOn,
    loggedAt: logged.loggedAt,
    now,
  })

  const statements = [insertLogStatement(db, log)]
  if (total !== work.total_progress) {
    statements.push(updateTotalStatement(db, workId, total, now))
  }
  await db.batch(statements)

  return { work: await getWorkWithStateOrThrow(db, workId), log }
}

export async function startNewRound(
  db: D1Database,
  workId: string,
  input: RoundInput,
  now = Date.now(),
): Promise<MutationResult> {
  const work = await getWorkWithStateOrThrow(db, workId)
  const current = work.state

  if (current.status !== 'done') {
    throw invalidTransition(current.status, 'reading')
  }

  const total = resolveTotalProgress(work, input.total_progress, input.confirm_binary)
  const logged = resolveLoggedAt(input.logged_on, now)
  const latest = await getLatestLog(db, workId)
  const log = buildLog({
    workId,
    seq: (latest?.seq ?? 0) + 1,
    event: 'both',
    status: 'reading',
    progress: 0,
    totalSnapshot: total,
    round: current.round + 1,
    loggedOn: logged.loggedOn,
    loggedAt: logged.loggedAt,
    now,
  })

  const statements = [insertLogStatement(db, log)]
  if (total !== work.total_progress) {
    statements.push(updateTotalStatement(db, workId, total, now))
  }
  await db.batch(statements)

  return { work: await getWorkWithStateOrThrow(db, workId), log }
}

export async function undoLatestLog(
  db: D1Database,
  workId: string,
): Promise<{ work: WorkWithState; deleted: Log }> {
  const latest = await getLatestLog(db, workId)
  if (!latest) throw notFound('No log to undo')

  const result = await db
    .prepare('DELETE FROM logs WHERE id = ? AND work_id = ? AND seq = ?')
    .bind(latest.id, workId, latest.seq)
    .run()

  if (result.meta.changes === 0) {
    throw new DomainError('conflict', 'The latest log changed; refresh and try again', 409)
  }

  return { work: await getWorkWithStateOrThrow(db, workId), deleted: latest }
}

export async function updateWork(
  db: D1Database,
  workId: string,
  input: UpdateWorkInput,
  now = Date.now(),
): Promise<WorkWithState> {
  const work = await getWorkWithStateOrThrow(db, workId)
  const sets: string[] = []
  const values: Array<string | number | null> = []

  if (input.title !== undefined) {
    sets.push('title = ?')
    values.push(input.title)
  }
  if (input.creator !== undefined) {
    sets.push('creator = ?')
    values.push(input.creator)
  }
  if (input.release_year !== undefined) {
    sets.push('release_year = ?')
    values.push(input.release_year === 0 ? null : input.release_year)
  }
  if (input.type !== undefined) {
    sets.push('type = ?')
    values.push(input.type)
  }
  if (input.total_progress !== undefined) {
    if (input.total_progress < work.state.progress) {
      throw invalidTotalProgress(
        `total_progress cannot be lower than the current progress (${work.state.progress})`,
      )
    }
    sets.push('total_progress = ?')
    values.push(input.total_progress)
  }
  if (input.short_review !== undefined) {
    sets.push('short_review = ?')
    values.push(input.short_review)
  }
  if (input.long_review_url !== undefined) {
    sets.push('long_review_url = ?')
    values.push(input.long_review_url)
  }

  sets.push('updated_at = ?')
  values.push(now)

  await db
    .prepare(`UPDATE works SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values, workId)
    .run()

  return getWorkWithStateOrThrow(db, workId)
}
