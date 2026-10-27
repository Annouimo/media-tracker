/**
 * Export the Bangumi timeline (时间胶囊) into this project's works/logs shape.
 *
 * Usage:
 *   bun run scripts/export-bangumi.ts            # parse archive/bangumi/raw
 *   bun run scripts/export-bangumi.ts --fetch    # re-download raw data first
 *
 * Output (under archive/bangumi/import/, gitignored):
 *   works.json
 *   logs.json
 *   events.json
 *   import.sql
 *   works.sql
 *   logs.sql
 *   manifest.json
 *   README.md
 *
 * Only subject_type = 2 (anime) is exported. Music, games, and books are
 * intentionally dropped. Ratings and creators are kept out of the DB.
 *
 * The HTML timeline is the history source; the collection API is the current
 * state. Episode ids are mapped to subject-relative episode numbers via
 * /v0/episodes?subject_id=...&type=0 so split-cour entries such as
 * "進撃の巨人 The Final Season Part.2" (timeline ep.76-87) become 1-12.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const ROOT = process.cwd()
const RAW_DIR = join(ROOT, 'archive/bangumi/raw')
const OUT_DIR = join(ROOT, 'archive/bangumi/import')
const USER_ID = '793266'
const API_BASE = 'https://api.bgm.tv'
const SITE_BASE = 'https://bgm.tv'
const APP_UA = 'annouimo/media-tracker (https://media-tracker.annouimo.com)'
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const APP_TZ_OFFSET_MS = 8 * 60 * 60 * 1000
const COLLECTION_PAGE_SIZE = 50
const TIMELINE_MAX_PAGES = 200

type Status = 'wish' | 'reading' | 'done' | 'paused' | 'dropped'
type LogEvent = 'progress' | 'status' | 'both'

type CollectionItem = {
  subject_id: number
  subject_type: number
  type: number
  rate: number
  comment: string | null
  tags: string[]
  ep_status: number
  vol_status: number
  private: boolean
  updated_at: string
  subject: {
    id: number
    name: string
    name_cn: string
    date: string
    eps: number | null
    volumes: number | null
    type: number
  }
}

type Anime = {
  sid: string
  title: string
  name: string
  nameCn: string
  date: string
  eps: number
  epStatus: number
  collectionType: number
  updatedAt: number
}

type TimelineEvent = {
  item: string
  kind: 'progress' | 'subject'
  tsMs: number
  text: string
  ids: string[]
  epId: string | null
  ep: number | null
  comp: number | null
  compTotal: number | null
  rating: number | null
  agg: number | null
}

type BuiltLog = {
  seq: number
  event: LogEvent
  status: Status
  progress: number
  total: number
  round: number
  loggedOn: string
  loggedAt: number
  inferred: 0 | 1
  item: string | null
  text: string
}

type LogRow = {
  id: string
  work_id: string
  seq: number
  event: LogEvent
  status: Status
  progress: number
  total_snapshot: number
  round: number
  logged_on: string
  logged_at: number
  source: 'migration'
  inferred: 0 | 1
  created_at: number
}

type WorkRow = {
  id: string
  title: string
  creator: string
  release_year: number | null
  type: 'Anime'
  total_progress: number
  short_review: string
  long_review_url: string
  added_at: null
  created_at: number
  updated_at: number
  legacy_id: null
  deleted_at: null
  source: 'bangumi'
  external_id: string
}

const STATUS_BY_VERB: Record<string, Status> = {
  想看: 'wish',
  在看: 'reading',
  看过: 'done',
  搁置了: 'paused',
  抛弃了: 'dropped',
}

const STATUS_BY_COLLECTION_TYPE: Record<number, Status> = {
  1: 'wish',
  2: 'done',
  3: 'reading',
  4: 'paused',
  5: 'dropped',
}

// ------------------------------------------------------------------ utilities

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fail(message: string): never {
  throw new Error(message)
}

function dayFromMs(ms: number): string {
  return new Date(ms + APP_TZ_OFFSET_MS).toISOString().slice(0, 10)
}

function parseTimelineMs(value: string): number {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2})/.exec(value)
  if (!match) fail(`Unrecognised timeline timestamp: ${value}`)
  const [, year, month, day, hour, minute] = match
  // The page renders Asia/Shanghai wall time without an offset.
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute),
  )
}

function isoToMs(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) fail(`Unrecognised ISO timestamp: ${value}`)
  return parsed
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function sqlLiteral(value: string | number | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`Non-finite SQL number: ${value}`)
    return String(value)
  }
  return `'${value.replace(/'/g, "''")}'`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T
}

function sortedByNumber(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const aNumber = Number(basename(a).replace(/\.(html|json)$/, ''))
    const bNumber = Number(basename(b).replace(/\.(html|json)$/, ''))
    return (Number.isFinite(aNumber) ? aNumber : 0) - (Number.isFinite(bNumber) ? bNumber : 0)
  })
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function getOption(name: string): string | null {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1]
  }
  return null
}

// -------------------------------------------------------------------- fetching

async function request(url: string, userAgent: string): Promise<string> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
      })
      if (!response.ok) fail(`${response.status} ${response.statusText} for ${url}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < 3) await sleep(2_000 * attempt)
    }
  }
  fail(`Request failed after retries: ${url}: ${String(lastError)}`)
}

async function fetchCollections(): Promise<void> {
  const dir = join(RAW_DIR, 'collections')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (let offset = 0; offset < 10_000; offset += COLLECTION_PAGE_SIZE) {
    const url =
      `${API_BASE}/v0/users/${USER_ID}/collections` +
      `?limit=${COLLECTION_PAGE_SIZE}&offset=${offset}`
    const body = await request(url, APP_UA)
    writeFileSync(join(dir, `${offset}.json`), body)
    const parsed = JSON.parse(body) as { data?: unknown[]; total?: number }
    const count = Array.isArray(parsed.data) ? parsed.data.length : 0
    if (count === 0) break
    if (typeof parsed.total === 'number' && offset + count >= parsed.total) break
    await sleep(1_200)
  }
}

async function fetchTimeline(kind: 'progress' | 'subject'): Promise<void> {
  const dir = join(RAW_DIR, 'timeline', kind)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (let page = 1; page <= TIMELINE_MAX_PAGES; page += 1) {
    const url = `${SITE_BASE}/user/${USER_ID}/timeline?type=${kind}&page=${page}`
    const body = await request(url, BROWSER_UA)
    writeFileSync(join(dir, `${page}.html`), body)
    const count = (body.match(/<li id="tml_/g) ?? []).length
    if (count === 0) break
    await sleep(Number(getOption('delay') ?? 1500))
  }
}

async function fetchEpisodes(subjectIds: string[]): Promise<void> {
  const dir = join(RAW_DIR, 'episodes')
  mkdirSync(dir, { recursive: true })
  for (const sid of subjectIds) {
    const file = join(dir, `${sid}.json`)
    if (existsSync(file)) continue
    let offset = 0
    let total = Infinity
    const episodes: unknown[] = []
    while (offset < total) {
      const url =
        `${API_BASE}/v0/episodes?subject_id=${sid}&type=0` +
        `&limit=100&offset=${offset}`
      const body = await request(url, APP_UA)
      const parsed = JSON.parse(body) as { data?: unknown[]; total?: number }
      const data = Array.isArray(parsed.data) ? parsed.data : []
      episodes.push(...data)
      total = typeof parsed.total === 'number' ? parsed.total : offset + data.length
      if (data.length === 0) break
      offset += data.length
      await sleep(1_200)
    }
    writeFileSync(file, JSON.stringify({ data: episodes, total: episodes.length }))
    await sleep(1_200)
  }
}

// --------------------------------------------------------------------- loading

function loadAnime(): Map<string, Anime> {
  const dir = join(RAW_DIR, 'collections')
  if (!existsSync(dir)) fail(`Missing ${dir}; run with --fetch first`)
  const bySid = new Map<string, Anime>()
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const parsed = readJson<{ data?: CollectionItem[] }>(join(dir, file))
    for (const item of parsed.data ?? []) {
      if (item.subject_type !== 2) continue
      const sid = String(item.subject_id)
      bySid.set(sid, {
        sid,
        title: item.subject.name_cn || item.subject.name,
        name: item.subject.name,
        nameCn: item.subject.name_cn,
        date: item.subject.date ?? '',
        eps: item.subject.eps ?? 0,
        epStatus: item.ep_status ?? 0,
        collectionType: item.type,
        updatedAt: isoToMs(item.updated_at),
      })
    }
  }
  return bySid
}

type EpisodeInfo = { ep: number | null; type: number }

function loadEpisodeMaps(): Map<string, Map<string, EpisodeInfo>> {
  const dir = join(RAW_DIR, 'episodes')
  const maps = new Map<string, Map<string, EpisodeInfo>>()
  if (!existsSync(dir)) return maps
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const sid = basename(file, '.json')
    const parsed = readJson<{ data?: Array<{ id: number; ep: number | null; type: number }> }>(
      join(dir, file),
    )
    const map = new Map<string, EpisodeInfo>()
    for (const episode of parsed.data ?? []) {
      map.set(String(episode.id), {
        ep: typeof episode.ep === 'number' ? episode.ep : null,
        type: typeof episode.type === 'number' ? episode.type : 0,
      })
    }
    maps.set(sid, map)
  }
  return maps
}

function parseTimeline(kind: 'progress' | 'subject'): TimelineEvent[] {
  const dir = join(RAW_DIR, 'timeline', kind)
  if (!existsSync(dir)) fail(`Missing ${dir}; run with --fetch first`)
  const files = sortedByNumber(readdirSync(dir).filter((name) => name.endsWith('.html')))
  const events: TimelineEvent[] = []
  for (const file of files) {
    const html = readFileSync(join(dir, file), 'utf8')
    for (const match of html.matchAll(/<li id="tml_(\d+)"[\s\S]*?<\/li>/g)) {
      const block = match[0]
      const timestamp = /title="([^"]+)" class="titleTip"/.exec(block)
      if (!timestamp) continue
      const info = /<span class="info_full clearit">([\s\S]*?)<div class="card/.exec(block)
      const text = stripHtml(info?.[1] ?? block)
      const ids = [
        ...new Set([...block.matchAll(/bgm\.tv\/subject\/(\d+)/g)].map((item) => item[1])),
      ]
      const epId = /bgm\.tv\/subject\/ep\/(\d+)/.exec(block)
      const ep = /ep\.(\d+(?:\.\d+)?)/.exec(text)
      const comp = /完成了 .*? (\d+) of (\d+) 话/.exec(text)
      const rating = /<div class="collectInfo">[\s\S]*?stars(\d+)/.exec(block)
      const agg = /(\d+)\s*部番组/.exec(text)
      events.push({
        item: match[1],
        kind,
        tsMs: parseTimelineMs(timestamp[1]),
        text,
        ids,
        epId: epId?.[1] ?? null,
        ep: ep ? Number(ep[1]) : null,
        comp: comp ? Number(comp[1]) : null,
        compTotal: comp ? Number(comp[2]) : null,
        rating: rating ? Number(rating[1]) : null,
        agg: agg ? Number(agg[1]) : null,
      })
    }
  }
  return events
}

// ---------------------------------------------------------------- reconstruct

function resolveEpisode(
  sid: string,
  event: TimelineEvent,
  episodeMaps: Map<string, Map<string, EpisodeInfo>>,
): { ep: number | null; special: boolean } {
  const map = episodeMaps.get(sid)
  if (map) {
    if (event.epId && map.has(event.epId)) {
      const info = map.get(event.epId) as EpisodeInfo
      return {
        ep: info.ep == null ? null : Math.trunc(info.ep),
        special: info.type !== 0,
      }
    }
    // A subject with a main-episode list but an unknown episode id is an
    // SP/recap/OVA that does not belong to the subject's normal numbering.
    return { ep: null, special: true }
  }
  if (event.ep == null) return { ep: null, special: false }
  return { ep: Math.round(event.ep), special: false }
}

function buildLogs(
  anime: Anime,
  events: TimelineEvent[],
  episodeMaps: Map<string, Map<string, EpisodeInfo>>,
): { logs: BuiltLog[]; anomaly: string | null; specials: number } {
  const sorted = [...events].sort(
    (a, b) => a.tsMs - b.tsMs || Number(a.item) - Number(b.item),
  )
  let logs: BuiltLog[] = []
  let status: Status = 'wish'
  let maxProgress = 0
  let round = 1
  let specials = 0
  let firstWish: TimelineEvent | null = null

  const add = (
    event: LogEvent,
    nextStatus: Status,
    progress: number,
    timestamp: number,
    inferred: 0 | 1,
    item: string | null,
    text: string,
  ): void => {
    logs.push({
      seq: logs.length + 1,
      event,
      status: nextStatus,
      progress,
      total: 0,
      round,
      loggedOn: dayFromMs(timestamp),
      loggedAt: timestamp,
      inferred,
      item,
      text,
    })
  }

  const mergeLast = (progress: number, timestamp: number, text: string): void => {
    const last = logs.at(-1)
    if (!last) return
    last.progress = Math.max(last.progress, progress)
    last.loggedOn = dayFromMs(timestamp)
    last.loggedAt = timestamp
    last.event = 'both'
    last.text = last.text ? `${last.text} | ${text}` : text
  }

  for (const event of sorted) {
    const verb = event.text.split(/\s+/)[0]
    if (event.kind === 'progress') {
      if (event.comp != null) {
        maxProgress = Math.max(maxProgress, event.comp)
        if (status === 'done' && logs.length > 0) {
          mergeLast(event.comp, event.tsMs, event.text)
        } else {
          add('both', 'done', event.comp, event.tsMs, 0, event.item, event.text)
          status = 'done'
        }
        continue
      }
      const resolved = resolveEpisode(anime.sid, event, episodeMaps)
      if (resolved.special) {
        specials += 1
        continue
      }
      if (resolved.ep == null) continue
      const episode = resolved.ep
      maxProgress = Math.max(maxProgress, episode)
      if (status === 'done' && logs.length > 0) {
        // A late episode mark after the work was finished is a correction,
        // not a new round. Only an explicit "在看" starts a new round.
        const last = logs.at(-1) as BuiltLog
        if (episode > last.progress) {
          last.progress = episode
          last.loggedOn = dayFromMs(event.tsMs)
          last.loggedAt = event.tsMs
          last.event = 'both'
          last.text = last.text ? `${last.text} | ${event.text}` : event.text
        }
        continue
      }
      if (status === 'wish') {
        add('both', 'reading', episode, event.tsMs, 0, event.item, event.text)
        status = 'reading'
      } else {
        add('progress', status, episode, event.tsMs, 0, event.item, event.text)
      }
      continue
    }

    const nextStatus = STATUS_BY_VERB[verb]
    if (!nextStatus) continue
    if (nextStatus === 'wish' && !firstWish) firstWish = event
    if (nextStatus === status) continue
    if (status === 'done' && nextStatus === 'wish') continue
    if (status === 'done' && nextStatus === 'reading') {
      round += 1
      maxProgress = 0
    }
    add('status', nextStatus, maxProgress, event.tsMs, 0, event.item, event.text)
    status = nextStatus
  }

  const currentStatus = STATUS_BY_COLLECTION_TYPE[anime.collectionType] ?? 'wish'
  const currentProgress = anime.epStatus || 0
  let anomaly: string | null = null

  if (currentStatus === 'wish' && logs.some((log) => log.status === 'done')) {
    anomaly = 'current wish but timeline has done; reset to wish'
    logs = []
    status = 'wish'
    maxProgress = 0
    round = 1
  }

  if (logs.length === 0) {
    if (currentStatus === 'wish' && firstWish) {
      add('status', 'wish', 0, firstWish.tsMs, 0, firstWish.item, firstWish.text)
    } else {
      maxProgress = Math.max(maxProgress, currentProgress)
      add('status', currentStatus, currentProgress, anime.updatedAt, 1, null, 'collection fallback')
    }
    status = currentStatus
  } else {
    const last = logs.at(-1) as BuiltLog
    if (last.status !== currentStatus) {
      const progress =
        currentStatus === 'done'
          ? Math.max(last.progress, currentProgress)
          : currentProgress
      maxProgress = Math.max(maxProgress, progress)
      if (last.status === 'done' && currentStatus === 'reading') round += 1
      add('status', currentStatus, progress, anime.updatedAt, 1, null, 'collection final')
      status = currentStatus
    } else if (currentStatus === 'done' && currentProgress > last.progress) {
      last.progress = currentProgress
      last.loggedOn = dayFromMs(anime.updatedAt)
      last.loggedAt = anime.updatedAt
      last.event = 'both'
      last.inferred = 1
      last.text = last.text ? `${last.text} | collection progress` : 'collection progress'
      maxProgress = Math.max(maxProgress, currentProgress)
    } else if (currentStatus !== 'done' && currentProgress > last.progress) {
      maxProgress = Math.max(maxProgress, currentProgress)
      add('progress', currentStatus, currentProgress, anime.updatedAt, 1, null, 'collection progress')
    }
  }

  const total = Math.max(anime.eps, maxProgress, 1)
  for (const log of logs) log.total = total
  if (logs.length > 0 && (logs.at(-1) as BuiltLog).status !== currentStatus) {
    add('status', currentStatus, currentProgress, anime.updatedAt, 1, null, 'final safety')
    for (const log of logs) log.total = total
  }

  return { logs, anomaly, specials }
}

// ----------------------------------------------------------------------- build

function buildOutputs(): {
  works: WorkRow[]
  logs: LogRow[]
  events: TimelineEvent[]
  manifest: Record<string, unknown>
} {
  const anime = loadAnime()
  const episodeMaps = loadEpisodeMaps()
  const progress = parseTimeline('progress')
  const subject = parseTimeline('subject')
  const events = [...progress, ...subject]

  const byWork = new Map<string, TimelineEvent[]>()
  for (const event of events) {
    for (const sid of event.ids) {
      if (!anime.has(sid)) continue
      const list = byWork.get(sid) ?? []
      list.push(event)
      byWork.set(sid, list)
    }
  }

  const createdAt = Date.now()
  const works: WorkRow[] = []
  const logs: LogRow[] = []
  const anomalies: Array<{ id: string; title: string; anomaly: string }> = []
  let specials = 0

  for (const [sid, item] of [...anime.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const result = buildLogs(item, byWork.get(sid) ?? [], episodeMaps)
    specials += result.specials
    if (result.anomaly) {
      anomalies.push({ id: sid, title: item.title, anomaly: result.anomaly })
    }
    const maxLogTotal = result.logs.reduce((max, log) => Math.max(max, log.total), 1)
    const totalProgress = Math.max(item.eps, maxLogTotal, 1)
    const yearMatch = /^(\d{4})-\d{2}-\d{2}/.exec(item.date)
    const workId = `bgm-${sid}`

    works.push({
      id: workId,
      title: item.title,
      creator: '',
      release_year: yearMatch ? Number(yearMatch[1]) : null,
      type: 'Anime',
      total_progress: totalProgress,
      short_review: '',
      long_review_url: '',
      added_at: null,
      created_at: createdAt,
      updated_at: item.updatedAt,
      legacy_id: null,
      deleted_at: null,
      source: 'bangumi',
      external_id: sid,
    })

    for (const log of result.logs) {
      logs.push({
        id: `${workId}-${log.seq}`,
        work_id: workId,
        seq: log.seq,
        event: log.event,
        status: log.status,
        progress: log.progress,
        total_snapshot: log.total,
        round: log.round,
        logged_on: log.loggedOn,
        logged_at: log.loggedAt,
        source: 'migration',
        inferred: log.inferred,
        created_at: createdAt,
      })
    }
  }

  const latestByWork = new Map<string, LogRow>()
  for (const log of logs) {
    const previous = latestByWork.get(log.work_id)
    if (!previous || log.seq > previous.seq) latestByWork.set(log.work_id, log)
  }

  const statusCounts = { wish: 0, reading: 0, done: 0, paused: 0, dropped: 0 } as Record<
    Status,
    number
  >
  for (const log of latestByWork.values()) statusCounts[log.status] += 1

  const everDone = new Set(logs.filter((log) => log.status === 'done').map((log) => log.work_id))
  const publicWorks = new Set(
    [...latestByWork.values()]
      .filter((log) => everDone.has(log.work_id) || log.status === 'reading')
      .map((log) => log.work_id),
  )

  const manifest = {
    generated_at: new Date().toISOString(),
    source: {
      account: USER_ID,
      anime: works.length,
      timeline_events: events.length,
      progress_events: progress.length,
      subject_events: subject.length,
      episode_lists: episodeMaps.size,
    },
    output: {
      works: works.length,
      logs: logs.length,
      timeline_logs: logs.filter((log) => log.inferred === 0).length,
      inferred_logs: logs.filter((log) => log.inferred === 1).length,
      specials_skipped: specials,
    },
    status: statusCounts,
    public: {
      ever_done: everDone.size,
      public: publicWorks.size,
      admin_only: works.length - publicWorks.size,
    },
    coverage: {
      works_with_timeline_events: byWork.size,
      fallback_only: works.filter((work) => !byWork.has(work.external_id)).length,
      works_with_progress: new Set(
        progress.flatMap((event) => event.ids.filter((sid) => anime.has(sid))),
      ).size,
    },
    anomalies,
    notes: [
      'Only subject_type=2 (anime) is exported; music, games, and books are dropped.',
      'Timeline HTML is the history source; the collection API is the current-state source.',
      'Episode ids are mapped to subject-relative episode numbers via /v0/episodes?subject_id=...&type=0.',
      'Special/recap episodes outside the main episode list are skipped.',
      'Works without any timeline event use updated_at as an inferred snapshot.',
      'Ratings and creators are intentionally not written to the DB.',
    ],
  }

  return { works, logs, events, manifest }
}

// ------------------------------------------------------------------------- sql

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
  'source',
  'external_id',
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

function insertWorks(works: WorkRow[]): string {
  return works
    .map((work) => {
      const values = WORK_COLUMNS.map((column) => sqlLiteral(work[column])).join(', ')
      return `INSERT OR IGNORE INTO works (${WORK_COLUMNS.join(', ')}) VALUES (${values});`
    })
    .join('\n')
}

function insertLogs(logs: LogRow[]): string {
  return logs
    .map((log) => {
      const values = LOG_COLUMNS.map((column) => sqlLiteral(log[column])).join(', ')
      return `INSERT OR IGNORE INTO logs (${LOG_COLUMNS.join(', ')}) VALUES (${values});`
    })
    .join('\n')
}

function makeImportSql(
  works: WorkRow[],
  logs: LogRow[],
  worksSha: string,
  logsSha: string,
): string {
  const batchId = `bangumi-anime-${worksSha.slice(0, 12)}`
  const batchValues = [
    sqlLiteral(batchId),
    sqlLiteral('bangumi-anime'),
    sqlLiteral(worksSha),
    sqlLiteral(logsSha),
    String(works.length),
    String(logs.length),
    String(Date.now()),
  ].join(', ')
  return [
    '-- Bangumi anime import (works + logs + import_batches).',
    `-- works: ${works.length}; logs: ${logs.length}`,
    '-- Generated by scripts/export-bangumi.ts.',
    '-- Requires migrations/0002_work_sources.sql.',
    'PRAGMA foreign_keys = ON;',
    '',
    '-- works',
    insertWorks(works),
    '',
    '-- logs',
    insertLogs(logs),
    '',
    '-- batch',
    'INSERT OR IGNORE INTO import_batches',
    '  (id, source, works_sha, logs_sha, works_count, logs_count, created_at)',
    `  VALUES (${batchValues});`,
    '',
  ].join('\n')
}

function makeReadme(works: WorkRow[], logs: LogRow[]): string {
  return `# Bangumi 动画导入说明

本目录由 \`scripts/export-bangumi.ts\` 生成并已被 \`.gitignore\` 忽略。

## 数字

| 项目 | 数值 |
|---|---:|
| works | ${works.length} |
| logs | ${logs.length} |

以 \`manifest.json\` 的 \`public\` 和 \`status\` 为准。

## 前置条件

1. 先备份生产 D1（\`wrangler d1 export\` 或 DBX 全量导出）。
2. 应用 0002 迁移：

\`\`\`bash
bunx wrangler d1 migrations apply media-tracker-db --remote
\`\`\`

3. 确认 \`works\` / \`logs\` 当前行数，导入后应分别增加 ${works.length} / ${logs.length}。

## 导入

\`\`\`bash
bunx wrangler d1 execute media-tracker-db --remote --file=archive/bangumi/import/import.sql
\`\`\`

或者用 DBX 执行 \`import.sql\`。脚本使用 \`INSERT OR IGNORE\`，重复执行不会重复插入，但也不会更新已有行。

导入后执行 \`verify.sql\`（只读检查）：
\`\`\`bash
bunx wrangler d1 execute media-tracker-db --remote --file=archive/bangumi/import/verify.sql
\`\`\`

如果 \`import.sql\` 太大，可以按顺序执行 \`works.sql\` 和 \`logs.sql\`；\`import_batches\` 可省略，或用 \`manifest.json\` 的 hash 手工补一行。

\`wrangler d1 execute --file\` 不是严格事务：失败时用备份恢复，不要在半导入库上反复重跑。

## 校验

\`\`\`sql
SELECT COUNT(*) FROM works;
SELECT COUNT(*) FROM logs;
SELECT COUNT(*) FROM works WHERE source = 'bangumi';
SELECT COUNT(*) FROM logs WHERE source = 'migration';

-- 每个作品的最终状态应与 Bangumi 收藏一致：
-- done 163 / wish 108 / paused 8 / dropped 1
SELECT status, COUNT(*) FROM (
  SELECT l.status
  FROM logs l
  JOIN (SELECT work_id, MAX(seq) AS seq FROM logs GROUP BY work_id) latest
    ON latest.work_id = l.work_id AND latest.seq = l.seq
  JOIN works w ON w.id = l.work_id
  WHERE w.source = 'bangumi'
) GROUP BY status;

-- 不应有孤儿、重复 seq、progress > total
SELECT COUNT(*) FROM logs l LEFT JOIN works w ON w.id = l.work_id WHERE w.id IS NULL;
SELECT COUNT(*) FROM (
  SELECT work_id, seq, COUNT(*) AS n FROM logs GROUP BY work_id, seq HAVING n > 1
);
SELECT COUNT(*) FROM logs WHERE progress > total_snapshot;
\`\`\`

## 失败回滚

用导入前的 D1 备份恢复；不要只删 \`import_batches\`，因为 works/logs 可能已经部分写入。
`
}

// ----------------------------------------------------------------------- verify

function makeVerifySql(worksCount: number, logsCount: number): string {
  return `-- Read-only checks after importing the Bangumi anime batch.
-- Expected: ${worksCount} bangumi works, ${logsCount} bangumi logs, 1 new import_batches row.

SELECT COUNT(*) AS bangumi_works FROM works WHERE source = 'bangumi';
SELECT COUNT(*) AS bangumi_logs FROM logs WHERE work_id LIKE 'bgm-%';

-- Latest status per imported work: done 163 / wish 108 / paused 8 / dropped 1
SELECT status, COUNT(*) AS n
FROM (
  SELECT l.status
  FROM logs l
  JOIN (SELECT work_id, MAX(seq) AS seq FROM logs GROUP BY work_id) latest
    ON latest.work_id = l.work_id AND latest.seq = l.seq
  JOIN works w ON w.id = l.work_id
  WHERE w.source = 'bangumi'
)
GROUP BY status;

-- Ever finished or currently reading: 166
SELECT COUNT(*) AS public_works
FROM works w
WHERE w.source = 'bangumi'
  AND (
    EXISTS (SELECT 1 FROM logs l WHERE l.work_id = w.id AND l.status = 'done')
    OR EXISTS (
      SELECT 1 FROM logs l
      WHERE l.work_id = w.id
        AND l.seq = (SELECT MAX(seq) FROM logs WHERE work_id = w.id)
        AND l.status = 'reading'
    )
  );

SELECT COUNT(*) AS inferred_logs FROM logs WHERE work_id LIKE 'bgm-%' AND inferred = 1;
SELECT COUNT(*) AS orphans FROM logs l LEFT JOIN works w ON w.id = l.work_id WHERE w.id IS NULL;
SELECT COUNT(*) AS duplicate_seq FROM (
  SELECT work_id, seq, COUNT(*) AS n FROM logs GROUP BY work_id, seq HAVING n > 1
);
SELECT COUNT(*) AS progress_gt_total FROM logs WHERE progress > total_snapshot;
SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 1;
`
}

// ------------------------------------------------------------------------ main

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  if (hasFlag('--fetch')) {
    await fetchCollections()
    await fetchTimeline('progress')
    await fetchTimeline('subject')
    const anime = loadAnime()
    const progress = parseTimeline('progress')
    const sids = new Set<string>()
    for (const event of progress) {
      for (const sid of event.ids) if (anime.has(sid)) sids.add(sid)
    }
    await fetchEpisodes([...sids].sort((a, b) => Number(a) - Number(b)))
  }

  if (!existsSync(RAW_DIR)) fail(`Missing ${RAW_DIR}; run with --fetch first`)

  const { works, logs, events, manifest } = buildOutputs()
  const worksJson = `${JSON.stringify(works, null, 2)}\n`
  const logsJson = `${JSON.stringify(logs, null, 2)}\n`
  const eventsJson = `${JSON.stringify(events, null, 2)}\n`
  const worksSha = sha256(worksJson)
  const logsSha = sha256(logsJson)
  const importSql = makeImportSql(works, logs, worksSha, logsSha)

  writeFileSync(join(OUT_DIR, 'works.json'), worksJson)
  writeFileSync(join(OUT_DIR, 'logs.json'), logsJson)
  writeFileSync(join(OUT_DIR, 'events.json'), eventsJson)
  writeFileSync(join(OUT_DIR, 'works.sql'), `${insertWorks(works)}\n`)
  writeFileSync(join(OUT_DIR, 'logs.sql'), `${insertLogs(logs)}\n`)
  writeFileSync(join(OUT_DIR, 'import.sql'), importSql)
  writeFileSync(join(OUT_DIR, 'verify.sql'), makeVerifySql(works.length, logs.length))
  writeFileSync(join(OUT_DIR, 'README.md'), makeReadme(works, logs))
  writeFileSync(
    join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify({ ...manifest, sha256: { works: worksSha, logs: logsSha } }, null, 2)}\n`,
  )

  console.log('Bangumi anime export complete')
  console.log(`  works: ${works.length}`)
  console.log(`  logs:  ${logs.length}`)
  console.log(`  events: ${events.length}`)
  console.log(`  output: ${OUT_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
