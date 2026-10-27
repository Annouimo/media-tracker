import { STATUS_LABELS } from './constants'
import type { WorkStatus } from './types'

/**
 * All display strings that change with the category.
 *
 * The status enum and the database fields are category-neutral; only the copy
 * is not. Components consume a CategoryCopy instead of branching on type.
 */
export type CategoryCopy = {
  status: Readonly<Record<WorkStatus, string>>
  /** Countable unit, e.g. 本 / 部. */
  unit: string
  /** Unit for a single progress step, e.g. 章 / 话. */
  progressUnit: string
  readingLine: string
  readSection: string
  emptyRead: string
  searchPlaceholder: string
  finishedOn: string
  finishedLabel: string
  doneSummary: string
  doneUnknownProgress: string
  doneAction: string
  markDone: string
  startReading: string
  continueReading: string
  pause: string
  drop: string
  chapterLabel: string
  chapterAriaPrefix: string
  totalField: string
  totalHint: string
  binary: string
  binaryHint: string
  chapterTitle: string
  chapterHint: string
  chapterInput: string
  chapterError: string
  useChapters: string
  keepBinary: string
  progressHint: string
  creatorLabel: string
}

const bookCopy: CategoryCopy = {
  status: { ...STATUS_LABELS },
  unit: '本',
  progressUnit: '章',
  readingLine: '在读：',
  readSection: '读过',
  emptyRead: '还没有读过作品。',
  searchPlaceholder: '搜索书名、作者、短评',
  finishedOn: '读完于',
  finishedLabel: '读完日期',
  doneSummary: '已读完',
  doneUnknownProgress: '已读完（进度未记录）',
  doneAction: '读完',
  markDone: '标记读完',
  startReading: '开始阅读',
  continueReading: '继续阅读',
  pause: '搁置',
  drop: '弃读',
  chapterLabel: '章节进度',
  chapterAriaPrefix: '标记读到第',
  totalField: '总章节数',
  totalHint: '1 = 未分章',
  binary: '未分章',
  binaryHint: '未分章作品',
  chapterTitle: '设置章节数',
  chapterHint: '这本书还没有章节数。可以输入章节数，或显式保持未分章。',
  chapterInput: '章节数',
  chapterError: '请输入大于等于 2 的章节数。',
  useChapters: '使用章节数',
  keepBinary: '保持未分章',
  progressHint: '点章节只记录进度；最后一章不会自动标记读完。',
  creatorLabel: '作者',
}

const animeCopy: CategoryCopy = {
  status: {
    wish: '想看',
    reading: '在看',
    done: '看过',
    paused: '搁置',
    dropped: '抛弃',
  },
  unit: '部',
  progressUnit: '话',
  readingLine: '在看：',
  readSection: '看过',
  emptyRead: '还没有看过作品。',
  searchPlaceholder: '搜索番名、制作、短评',
  finishedOn: '看完于',
  finishedLabel: '看完日期',
  doneSummary: '已看完',
  doneUnknownProgress: '已看完（进度未记录）',
  doneAction: '看完',
  markDone: '标记看完',
  startReading: '开始观看',
  continueReading: '继续观看',
  pause: '搁置',
  drop: '抛弃',
  chapterLabel: '集数进度',
  chapterAriaPrefix: '标记看到第',
  totalField: '总集数',
  totalHint: '1 = 未分话',
  binary: '未分话',
  binaryHint: '未分话作品',
  chapterTitle: '设置集数',
  chapterHint: '这部动画还没有集数。可以输入集数，或显式保持未分话。',
  chapterInput: '集数',
  chapterError: '请输入大于等于 2 的集数。',
  useChapters: '使用集数',
  keepBinary: '保持未分话',
  progressHint: '点集数只记录进度；最后一集不会自动标记看完。',
  creatorLabel: '制作',
}

export { animeCopy, bookCopy }

/** Labels for the mixed admin list (all categories at once). */
export const NEUTRAL_STATUS: Record<WorkStatus, string> = {
  wish: '未开始',
  reading: '进行中',
  done: '已完成',
  paused: '搁置',
  dropped: '已放弃',
}
