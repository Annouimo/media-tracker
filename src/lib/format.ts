import { STATUS_LABELS } from '../../shared/constants'
import type { PublicLog, PublicWork } from '../../shared/types'
import type { ZodError } from 'zod'

export function statusLabel(status: PublicWork['status']): string {
  return STATUS_LABELS[status]
}

export function progressSummary(work: PublicWork): string {
  if (work.total_progress > 1) {
    return `${work.progress} / ${work.total_progress} 章`
  }
  if (work.is_read) return '已读完'
  if (work.is_reading) return '在读'
  return '未分章'
}

export function describeLog(log: PublicLog): string {
  const label = STATUS_LABELS[log.status]
  const chapterProgress =
    log.total_snapshot > 1 ? `${log.progress} / ${log.total_snapshot} 章` : null

  if (log.event === 'status') return `状态：${label}`
  if (log.event === 'both') {
    return chapterProgress ? `状态：${label} · 进度：${chapterProgress}` : `状态：${label}`
  }
  if (chapterProgress) return `进度：${chapterProgress}`
  return log.progress >= 1 ? '读完' : '开始阅读'
}

export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
}
