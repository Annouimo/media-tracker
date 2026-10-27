import type { Log, Work, WorkState, WorkStatus, WorkWithState } from '../../shared/types'
import {
  invalidProgress,
  invalidTotalProgress,
  needsTotalProgress,
  useNewRound,
  invalidTransition,
} from './errors'

export const ALLOWED_STATUS_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  wish: ['reading', 'done', 'paused', 'dropped'],
  reading: ['done', 'paused', 'dropped'],
  paused: ['reading', 'done', 'dropped'],
  dropped: ['reading', 'done', 'paused'],
  // done -> reading must go through the new-round action so round increments.
  done: ['paused', 'dropped'],
}

export function sortLogsBySeq(logs: Log[]): Log[] {
  return [...logs].sort((a, b) => a.seq - b.seq)
}

export function latestLog(logs: Log[]): Log | null {
  let latest: Log | null = null
  for (const log of logs) {
    if (!latest || log.seq > latest.seq) latest = log
  }
  return latest
}

export function deriveState(work: Work, logs: Log[]): WorkState {
  const latest = latestLog(logs)
  const doneDates = logs
    .filter((log) => log.status === 'done')
    .map((log) => log.logged_on)
    .sort()

  return {
    status: latest?.status ?? 'wish',
    progress: latest?.progress ?? 0,
    totalSnapshot: latest?.total_snapshot ?? work.total_progress,
    round: latest?.round ?? 1,
    loggedOn: latest?.logged_on ?? null,
    loggedAt: latest?.logged_at ?? null,
    event: latest?.event ?? null,
    finishedOn: doneDates.at(-1) ?? null,
  }
}

export function withState(work: Work, logs: Log[]): WorkWithState {
  return { ...work, state: deriveState(work, logs) }
}

/** Public if the work has ever been done, or is currently reading. */
export function isPublicWork(work: WorkWithState): boolean {
  return work.state.finishedOn !== null || work.state.status === 'reading'
}

export function assertCanSetStatus(current: WorkStatus, next: WorkStatus): void {
  if (current === next) return
  if (!ALLOWED_STATUS_TRANSITIONS[current].includes(next)) {
    throw invalidTransition(current, next)
  }
}

/** Status after a progress event. Done requires a new round. */
export function statusAfterProgress(current: WorkStatus): WorkStatus {
  if (current === 'done') throw useNewRound()
  return current === 'wish' ? 'reading' : current
}

/**
 * Resolve the total chapter count for an operation that enters reading.
 * A binary work (total_progress = 1) must provide a chapter count or
 * explicitly confirm that it should stay binary.
 */
export function resolveTotalProgress(
  work: Work,
  requested: number | undefined,
  confirmBinary: boolean,
): number {
  if (requested != null) {
    if (!Number.isInteger(requested) || requested < 2) {
      throw invalidTotalProgress('total_progress must be an integer >= 2')
    }
    return requested
  }

  if ((work.total_progress ?? 1) <= 1 && !confirmBinary) {
    throw needsTotalProgress()
  }

  return work.total_progress
}

export function assertProgressWithinTotal(progress: number, total: number): void {
  if (!Number.isInteger(progress) || progress < 0) {
    throw invalidProgress('progress must be an integer >= 0')
  }
  if (progress > total) {
    throw invalidProgress(`progress cannot exceed total_progress (${total})`)
  }
}
