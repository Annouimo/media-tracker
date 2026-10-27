import type { WorkStatus } from './types'

export const APP_TIME_ZONE = 'Asia/Shanghai'

export const STATUS_LABELS: Record<WorkStatus, string> = {
  wish: '想读',
  reading: '在读',
  done: '读完',
  paused: '搁置',
  dropped: '弃读',
}

export const STATUS_ORDER: WorkStatus[] = ['reading', 'wish', 'done', 'paused', 'dropped']

export const DEFAULT_TYPE = 'Book'
export const DEFAULT_TOTAL_PROGRESS = 1

export const MAX_PROGRESS = 10000
export const MAX_TITLE_LENGTH = 300
export const MAX_CREATOR_LENGTH = 300
export const MAX_TYPE_LENGTH = 50
export const MAX_SHORT_REVIEW_LENGTH = 5000
export const MAX_LONG_REVIEW_URL_LENGTH = 2048
export const MAX_RELEASE_YEAR = 3000

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
