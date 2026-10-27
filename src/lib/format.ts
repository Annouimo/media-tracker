import type { CategoryCopy } from '../../shared/category-copy'
import { todayLocalDay } from '../../shared/dates'
import type { PublicLog, PublicWork, WorkStatus } from '../../shared/types'
import type { ZodError } from 'zod'

export function statusLabel(status: PublicWork['status'], copy: CategoryCopy): string {
  return copy.status[status]
}

/** Progress for one work, using the category's unit and done-without-progress wording. */
export function progressLabel(
  progress: number,
  total: number,
  status: WorkStatus,
  copy: CategoryCopy,
): string {
  if (status === 'done' && total > 1 && progress === 0) {
    return copy.doneUnknownProgress
  }
  if (total > 1) {
    return `${progress} / ${total} ${copy.progressUnit}`
  }
  if (status === 'done') return copy.doneSummary
  if (status === 'reading') return copy.status.reading
  return copy.binary
}

export function progressSummary(work: PublicWork, copy: CategoryCopy): string {
  if (work.is_read && work.total_progress > 1 && work.progress === 0) {
    return copy.doneUnknownProgress
  }
  if (work.total_progress > 1) {
    return `${work.progress} / ${work.total_progress} ${copy.progressUnit}`
  }
  if (work.is_read) return copy.doneSummary
  if (work.is_reading) return copy.status.reading
  return copy.binary
}

export function describeLog(log: PublicLog, copy: CategoryCopy): string {
  const label = copy.status[log.status]
  const progress =
    log.total_snapshot > 1
      ? `${log.progress} / ${log.total_snapshot} ${copy.progressUnit}`
      : null

  if (log.event === 'status') return `状态：${label}`
  if (log.event === 'both') {
    return progress ? `状态：${label} · 进度：${progress}` : `状态：${label}`
  }
  if (progress) return `进度：${progress}`
  return log.progress >= 1 ? copy.doneAction : copy.startReading
}

export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
}

function utcDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}

/**
 * Relative label for a YYYY-MM-DD day: 今天 / 昨天 / N 天前 for the last week,
 * otherwise the original date.
 */
export function relativeDay(day: string, today = todayLocalDay()): string {
  const diff = Math.round((utcDay(today) - utcDay(day)) / 86_400_000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff > 1 && diff < 7) return `${diff} 天前`
  if (diff === -1) return '明天'
  if (diff < -1) return `${-diff} 天后`
  return day
}
