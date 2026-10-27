/**
 * Convert the legacy PocketBase export in archive/ into DBX-importable JSON.
 *
 * Usage:
 *   bun run scripts/transform-legacy.ts
 *
 * Output (all under archive/import/, which is gitignored):
 *   works.json
 *   logs.json
 *   works.sql          // literal INSERT fallback for DBX SQL import
 *   logs.sql
 *   manifest.json      // counts, hashes, warnings, verification results
 *   README.md          // DBX import steps
 *
 * This script is intentionally self-contained and has no runtime dependencies.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const ARCHIVE = join(ROOT, 'archive')
const OUT_DIR = join(ARCHIVE, 'import')
const WORKS_PATH = join(ARCHIVE, '283_works_records.json')
const LOGS_PATH = join(ARCHIVE, '295_logs_records.json')
const APP_TZ = 'Asia/Shanghai'
const LEGACY_IMPORT_CUTOFF = Date.parse('2026-09-12T10:42:18.500Z')

if (!existsSync(WORKS_PATH) || !existsSync(LOGS_PATH)) {
  throw new Error('Expected archive/283_works_records.json and archive/295_logs_records.json')
}

// ---------------------------------------------------------------- legacy types

type LegacyWork = {
  id: string
  title: string
  creator: string
  release_year: number
  type: string
  total_progress: number
  status: string
  date_added: string
  created: string
  updated: string
  legacy_id: number
}

type LegacyLog = {
  id: string
  work: string
  date: string
  snapshot_progress: number
  total_snapshot: number
  round: number
  created: string
  updated: string
}

// ---------------------------------------------------------------- target types

type NewWork = {
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

type NewLog = {
  id: string
  work_id: string
  seq: number
  event: 'progress' | 'status' | 'both'
  status: 'wish' | 'reading' | 'done' | 'paused' | 'dropped'
  progress: number
  total_snapshot: number
  round: number
  logged_on: string
  logged_at: number | null
  source: 'user' | 'migration'
  inferred: 0 | 1
  created_at: number
}

type StatusCounts = Record<'wish' | 'reading' | 'done' | 'paused' | 'dropped', number>

// ---------------------------------------------------------------- helpers

function fail(message: string): never {
  throw new Error(message)
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function parsePbDate(value: string, label: string): Date {
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) fail(`Invalid date for ${label}: ${value}`)
  return date
}

function epoch(value: string, label: string): number {
  return parsePbDate(value, label).getTime()
}

function isDateOnly(value: string): boolean {
  return value.slice(11, 19) === '00:00:00'
}

function localDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const lookup = (type: string): string | undefined =>
    parts.find((part) => part.type === type)?.value

  const year = lookup('year')
  const month = lookup('month')
  const day = lookup('day')
  if (!year || !month || !day) fail(`Cannot format local day for ${date.toISOString()}`)
  return `${year}-${month}-${day}`
}

function emptyCounts(): StatusCounts {
  return { wish: 0, reading: 0, done: 0, paused: 0, dropped: 0 }
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const result = {} as Record<T, number>
  for (const value of values) result[value] = (result[value] ?? 0) + 1
  return result
}

function sqlLiteral(value: string | number | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`Non-finite number in SQL value: ${value}`)
    return String(value)
  }
  return `'${value.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------- load + validate

const worksRaw = JSON.parse(readFileSync(WORKS_PATH, 'utf8')) as LegacyWork[]
const logsRaw = JSON.parse(readFileSync(LOGS_PATH, 'utf8')) as LegacyLog[]

if (!Array.isArray(worksRaw) || worksRaw.length !== 283) {
  fail(`Expected 283 works, got ${worksRaw.length}`)
}
if (!Array.isArray(logsRaw) || logsRaw.length !== 295) {
  fail(`Expected 295 logs, got ${logsRaw.length}`)
}

const workIds = new Set<string>()
for (const work of worksRaw) {
  if (!work.id) fail('Work with empty id')
  if (workIds.has(work.id)) fail(`Duplicate work id: ${work.id}`)
  workIds.add(work.id)
  if (!work.title?.trim()) fail(`Work ${work.id} has empty title`)
  if (!Number.isInteger(work.total_progress) || work.total_progress < 1) {
    fail(`Work ${work.id} has invalid total_progress: ${work.total_progress}`)
  }
  if (!['', 'Done', 'Paused', 'Dropped'].includes(work.status)) {
    fail(`Work ${work.id} has unsupported status: ${work.status}`)
  }
  if (!Number.isInteger(work.legacy_id) || work.legacy_id < 0) {
    fail(`Work ${work.id} has invalid legacy_id: ${work.legacy_id}`)
  }
}

const logIds = new Set<string>()
for (const log of logsRaw) {
  if (!log.id) fail('Log with empty id')
  if (logIds.has(log.id)) fail(`Duplicate log id: ${log.id}`)
  logIds.add(log.id)
  if (!workIds.has(log.work)) fail(`Orphan log ${log.id} -> ${log.work}`)
  if (!Number.isInteger(log.snapshot_progress) || log.snapshot_progress < 0) {
    fail(`Log ${log.id} has invalid snapshot_progress`)
  }
  if (!Number.isInteger(log.total_snapshot) || log.total_snapshot < 1) {
    fail(`Log ${log.id} has invalid total_snapshot`)
  }
  if (!Number.isInteger(log.round) || log.round < 1) {
    fail(`Log ${log.id} has invalid round`)
  }
  if (log.snapshot_progress > log.total_snapshot) {
    fail(`Log ${log.id} has progress > total`)
  }
}

// ---------------------------------------------------------------- works

const works: NewWork[] = worksRaw.map((work) => ({
  id: work.id,
  title: work.title,
  creator: work.creator ?? '',
  release_year: work.release_year === 0 ? null : work.release_year,
  type: work.type || 'Book',
  total_progress: work.total_progress,
  short_review: '',
  long_review_url: '',
  added_at: work.date_added ? epoch(work.date_added, `${work.id}.date_added`) : null,
  created_at: epoch(work.created, `${work.id}.created`),
  updated_at: epoch(work.updated, `${work.id}.updated`),
  legacy_id: work.legacy_id === 0 ? null : work.legacy_id,
  deleted_at: null,
}))

const worksById = new Map(works.map((work) => [work.id, work]))

// ---------------------------------------------------------------- old logs grouped by work

type IndexedLegacyLog = { log: LegacyLog; index: number }

const oldLogsByWork = new Map<string, IndexedLegacyLog[]>()
for (const [index, log] of logsRaw.entries()) {
  const list = oldLogsByWork.get(log.work) ?? []
  list.push({ log, index })
  oldLogsByWork.set(log.work, list)
}

for (const list of oldLogsByWork.values()) {
  list.sort((a, b) => {
    const byDate = a.log.date.localeCompare(b.log.date)
    if (byDate !== 0) return byDate
    const byCreated = a.log.created.localeCompare(b.log.created)
    if (byCreated !== 0) return byCreated
    return a.index - b.index
  })
}

// ---------------------------------------------------------------- logs + synthetic status events

const logs: NewLog[] = []
const oldDerived = new Map<string, NewLog['status']>()
const oldProgress = new Map<string, number>()
const newLatest = new Map<string, NewLog>()

let exactStatusEvents = 0
let inferredStatusEvents = 0
let syntheticStatusEvents = 0

for (const work of worksRaw) {
  const list = oldLogsByWork.get(work.id) ?? []
  const lastOld = list.at(-1)?.log

  if (work.status === '' && list.length === 0) {
    oldDerived.set(work.id, 'wish')
    oldProgress.set(work.id, 0)
  } else if (work.status === '' && lastOld) {
    oldDerived.set(work.id, 'reading')
    oldProgress.set(work.id, lastOld.snapshot_progress)
  } else {
    if (!lastOld) fail(`Work ${work.id} status=${work.status} has no log to snapshot`)
    const derived =
      work.status === 'Done' ? 'done' : work.status === 'Paused' ? 'paused' : 'dropped'
    oldDerived.set(work.id, derived)
    oldProgress.set(work.id, lastOld.snapshot_progress)
  }

  let seq = 0
  for (const { log } of list) {
    const date = parsePbDate(log.date, `${log.id}.date`)
    const dateOnly = isDateOnly(log.date)
    const entry: NewLog = {
      id: log.id,
      work_id: work.id,
      seq: ++seq,
      event: 'progress',
      status: 'reading',
      progress: log.snapshot_progress,
      total_snapshot: log.total_snapshot,
      round: log.round,
      logged_on: localDay(date),
      logged_at: dateOnly ? null : date.getTime(),
      source: 'migration',
      inferred: 0,
      created_at: epoch(log.created, `${log.id}.created`),
    }
    logs.push(entry)
    newLatest.set(work.id, entry)
  }

  if (work.status !== '' && lastOld) {
    const latest = newLatest.get(work.id)
    if (!latest) fail(`Missing latest log for ${work.id}`)
    const updated = parsePbDate(work.updated, `${work.id}.updated`)
    const exact = updated.getTime() > LEGACY_IMPORT_CUTOFF
    const isDone = work.status === 'Done'
    const isPaused = work.status === 'Paused'

    const entry: NewLog = {
      id: `mig_${work.id}_status`,
      work_id: work.id,
      seq: latest.seq + 1,
      event: 'status',
      status: isDone ? 'done' : isPaused ? 'paused' : 'dropped',
      progress: latest.progress,
      total_snapshot: latest.total_snapshot,
      round: latest.round,
      logged_on: exact ? localDay(updated) : latest.logged_on,
      logged_at: exact ? updated.getTime() : null,
      source: 'migration',
      inferred: exact ? 0 : 1,
      // Keep insert-time ordering consistent with seq. For inferred historical
      // statuses, works.updated is the 2026-09-12 import time, which can be
      // earlier than the latest log's created_at.
      created_at: Math.max(updated.getTime(), latest.created_at + 1),
    }

    logs.push(entry)
    newLatest.set(work.id, entry)
    syntheticStatusEvents += 1
    if (exact) exactStatusEvents += 1
    else inferredStatusEvents += 1
  }
}

logs.sort((a, b) => {
  const byWork = a.work_id.localeCompare(b.work_id)
  if (byWork !== 0) return byWork
  return a.seq - b.seq
})

// ---------------------------------------------------------------- verification

const newStatusCounts = emptyCounts()
const oldStatusCounts = emptyCounts()
const mismatches: string[] = []

for (const work of worksRaw) {
  const expectedStatus = oldDerived.get(work.id)
  const actual = newLatest.get(work.id)
  const actualStatus: NewLog['status'] = actual?.status ?? 'wish'
  const actualProgress = actual?.progress ?? 0
  if (!expectedStatus) fail(`Missing derived status for ${work.id}`)
  if (actualStatus !== expectedStatus) {
    mismatches.push(`${work.id} status: ${actualStatus} != ${expectedStatus}`)
  }
  if (actualProgress !== oldProgress.get(work.id)) {
    mismatches.push(`${work.id} progress: ${actualProgress} != ${oldProgress.get(work.id)}`)
  }
  oldStatusCounts[expectedStatus] += 1
  newStatusCounts[actualStatus] += 1
}

if (mismatches.length > 0) fail(`State mismatch:\n${mismatches.join('\n')}`)

const logKeys = new Set<string>()
for (const log of logs) {
  const work = worksById.get(log.work_id)
  if (!work) fail(`Missing work ${log.work_id}`)
  if (!Number.isInteger(log.seq) || log.seq < 1) fail(`Bad seq ${log.id}`)
  const key = `${log.work_id}|${log.seq}`
  if (logKeys.has(key)) fail(`Duplicate (work_id, seq): ${key}`)
  logKeys.add(key)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(log.logged_on)) fail(`Bad logged_on ${log.id}`)
  if (log.total_snapshot < 1) fail(`Bad total_snapshot ${log.id}`)
}

const finalLogIds = new Set(logs.map((log) => log.id))
if (finalLogIds.size !== logs.length) fail('Duplicate log id after synthesis')

const worksWithLogs = new Set(logs.map((log) => log.work_id)).size
const dateOnlyAfter = logs.filter((log) => log.logged_at === null).length
const timestampedAfter = logs.length - dateOnlyAfter
const dateOnlyOriginal = logsRaw.filter((log) => isDateOnly(log.date)).length
const timestampedOriginal = logsRaw.length - dateOnlyOriginal
const orphanLogs = logsRaw.filter((log) => !workIds.has(log.work)).length
const totalMismatches = logsRaw.filter((log) => {
  const work = worksRaw.find((item) => item.id === log.work)
  return work != null && log.total_snapshot !== work.total_progress
})
const sameDayGroups = new Map<string, LegacyLog[]>()
for (const log of logsRaw) {
  const key = `${log.work}|${log.date}`
  const list = sameDayGroups.get(key) ?? []
  list.push(log)
  sameDayGroups.set(key, list)
}
const sameDayDuplicates = [...sameDayGroups.entries()].filter(([, list]) => list.length > 1)
const timelineGroups = new Set(
  logsRaw.map((log) => {
    const date = parsePbDate(log.date, `${log.id}.date`)
    return `${localDay(date)}|${log.work}|${log.round}`
  }),
)
const publicEverDone = worksRaw.filter((work) => oldDerived.get(work.id) === 'done').length
const publicReading = worksRaw.filter((work) => oldDerived.get(work.id) === 'reading').length
const missingAddedAt = worksRaw.filter((work) => !work.date_added).length
const legacyIdPresent = worksRaw.filter((work) => work.legacy_id !== 0).length
const chapterWorks = worksRaw.filter((work) => work.total_progress > 1).length
const binaryWorks = worksRaw.length - chapterWorks
const emptyCreators = worksRaw.filter((work) => !work.creator).length
const typeCounts = countBy(worksRaw.map((work) => work.type))
const roundCounts = countBy(logsRaw.map((log) => String(log.round)))

// ---------------------------------------------------------------- outputs

mkdirSync(OUT_DIR, { recursive: true })

const worksJson = `${JSON.stringify(works, null, 2)}\n`
const logsJson = `${JSON.stringify(logs, null, 2)}\n`

const worksColumns = [
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

const logsColumns = [
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

const worksSql =
  works
    .map((work) => {
      const values = worksColumns.map((column) => sqlLiteral(work[column]))
      return `INSERT INTO works (${worksColumns.join(', ')}) VALUES (${values.join(', ')});`
    })
    .join('\n') + '\n'

const logsSql =
  logs
    .map((log) => {
      const values = logsColumns.map((column) => sqlLiteral(log[column]))
      return `INSERT INTO logs (${logsColumns.join(', ')}) VALUES (${values.join(', ')});`
    })
    .join('\n') + '\n'

const worksSha = sha256(worksJson)
const logsSha = sha256(logsJson)

const manifest = {
  generated_at: new Date().toISOString(),
  source: {
    works: {
      file: 'archive/283_works_records.json',
      count: worksRaw.length,
      sha256: sha256(readFileSync(WORKS_PATH)),
    },
    logs: {
      file: 'archive/295_logs_records.json',
      count: logsRaw.length,
      sha256: sha256(readFileSync(LOGS_PATH)),
    },
  },
  output: {
    works: {
      file: 'archive/import/works.json',
      count: works.length,
      bytes: Buffer.byteLength(worksJson, 'utf8'),
      sha256: worksSha,
    },
    logs: {
      file: 'archive/import/logs.json',
      count: logs.length,
      bytes: Buffer.byteLength(logsJson, 'utf8'),
      sha256: logsSha,
    },
    works_sql: {
      file: 'archive/import/works.sql',
      statements: works.length,
      sha256: sha256(worksSql),
    },
    logs_sql: {
      file: 'archive/import/logs.sql',
      statements: logs.length,
      sha256: sha256(logsSql),
    },
  },
  counts: {
    works: works.length,
    old_logs: logsRaw.length,
    synthetic_status_logs: syntheticStatusEvents,
    logs: logs.length,
    works_with_logs: worksWithLogs,
  },
  status: {
    old: oldStatusCounts,
    new: newStatusCounts,
  },
  logs_breakdown: {
    exact_status_events: exactStatusEvents,
    inferred_status_events: inferredStatusEvents,
    date_only_original: dateOnlyOriginal,
    timestamped_original: timestampedOriginal,
    date_only_after: dateOnlyAfter,
    timestamped_after: timestampedAfter,
    rounds: roundCounts,
  },
  works_breakdown: {
    chapter: chapterWorks,
    binary: binaryWorks,
    missing_added_at: missingAddedAt,
    legacy_id_present: legacyIdPresent,
    empty_creator: emptyCreators,
    types: typeCounts,
  },
  public: {
    ever_done: publicEverDone,
    currently_reading: publicReading,
    union: publicEverDone + publicReading,
  },
  anomalies: {
    total_snapshot_mismatches: totalMismatches.map((log) => ({
      log_id: log.id,
      work_id: log.work,
      title: worksById.get(log.work)?.title ?? null,
      progress: log.snapshot_progress,
      total_snapshot: log.total_snapshot,
      work_total: worksRaw.find((work) => work.id === log.work)?.total_progress ?? null,
    })),
    same_day_groups: sameDayDuplicates.length,
    orphan_logs: orphanLogs,
    timelines: timelineGroups.size,
  },
  dbx: {
    target_tables: ['works', 'logs'],
    import_order: ['works.json', 'logs.json'],
    empty_string_as_null: false,
    recommended_batch_size: 100,
    notes: [
      'Create the schema from migrations/0001_init.sql before importing.',
      'Import works.json before logs.json (foreign key).',
      'Disable "Empty string as NULL" so creator/short_review/long_review_url stay as empty strings.',
      'Use existing-table mode; do not let DBX infer the schema from JSON.',
      'If D1 Table Import is unavailable, use works.sql and logs.sql via SQL File Execution.',
      'DBX imports are batched, not atomic. Verify row counts after each file.',
      'If you see a parameter-limit error, reduce batch size to 10.',
    ],
  },
  checks: {
    state_mismatches: mismatches.length,
    duplicate_work_ids: worksRaw.length - workIds.size,
    duplicate_log_ids: logsRaw.length - logIds.size,
    orphan_logs: orphanLogs,
    duplicate_work_seq: 0,
  },
  warnings: [
    `${inferredStatusEvents} synthetic status events have inferred dates (inferred=1).`,
    `${totalMismatches.length} total_snapshot/work.total_progress mismatches are preserved.`,
    `${sameDayDuplicates.length} same-day 0/1 log groups are preserved; seq keeps start before done.`,
    `${dateOnlyOriginal} original logs are date-only; after synthetic events ${dateOnlyAfter} rows have logged_at=NULL.`,
    `${missingAddedAt} works have added_at=NULL.`,
    'DBX: turn off "Empty string as NULL" before importing.',
    'DBX: import works before logs.',
  ],
}

writeFileSync(join(OUT_DIR, 'works.json'), worksJson)
writeFileSync(join(OUT_DIR, 'logs.json'), logsJson)
writeFileSync(join(OUT_DIR, 'works.sql'), worksSql)
writeFileSync(join(OUT_DIR, 'logs.sql'), logsSql)
writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log('Legacy transform complete')
console.log(`  works: ${works.length}`)
console.log(`  logs:  ${logs.length} (${logsRaw.length} original + ${syntheticStatusEvents} status)`)
console.log(`  status: wish=${newStatusCounts.wish} reading=${newStatusCounts.reading} done=${newStatusCounts.done} paused=${newStatusCounts.paused} dropped=${newStatusCounts.dropped}`)
console.log(`  exact status events: ${exactStatusEvents}`)
console.log(`  inferred status events: ${inferredStatusEvents}`)
console.log(`  date-only after: ${dateOnlyAfter}`)
console.log(`  output: archive/import/`)
