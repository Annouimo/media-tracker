import { APP_TIME_ZONE, DATE_ONLY_PATTERN } from './constants'

export { APP_TIME_ZONE } from './constants'

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** YYYY-MM-DD in the app time zone, independent of the runtime TZ. */
export function localDayFromEpoch(epochMs: number): string {
  const parts = dayFormatter.formatToParts(new Date(epochMs))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error(`Cannot format local day from ${epochMs}`)
  }
  return `${year}-${month}-${day}`
}

export function todayLocalDay(now = Date.now()): string {
  return localDayFromEpoch(now)
}

export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export type ResolvedLoggedAt = {
  loggedOn: string
  loggedAt: number | null
}

/**
 * A supplied logged_on is treated as date-only (no time).
 * Without it, the event timestamp is the current instant.
 */
export function resolveLoggedAt(loggedOn: string | undefined, now = Date.now()): ResolvedLoggedAt {
  if (loggedOn) {
    if (!isValidDateOnly(loggedOn)) throw new Error(`Invalid date: ${loggedOn}`)
    return { loggedOn, loggedAt: null }
  }
  return { loggedOn: localDayFromEpoch(now), loggedAt: now }
}
