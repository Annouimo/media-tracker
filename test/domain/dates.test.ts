import { describe, expect, it } from 'vitest'
import { isValidDateOnly, localDayFromEpoch, resolveLoggedAt } from '../../shared/dates'

describe('dates', () => {
  it('groups UTC instants by Asia/Shanghai local day', () => {
    expect(localDayFromEpoch(Date.parse('2026-10-18T23:18:00.910Z'))).toBe('2026-10-19')
    expect(localDayFromEpoch(Date.parse('2026-04-06T00:00:00.000Z'))).toBe('2026-04-06')
  })

  it('validates date-only values', () => {
    expect(isValidDateOnly('2024-02-29')).toBe(true)
    expect(isValidDateOnly('2026-02-29')).toBe(false)
    expect(isValidDateOnly('2026-13-01')).toBe(false)
    expect(isValidDateOnly('2026-1-01')).toBe(false)
  })

  it('keeps supplied dates date-only and timestamps new events', () => {
    const now = Date.parse('2026-10-18T23:18:00.910Z')
    expect(resolveLoggedAt('2026-04-06', now)).toEqual({
      loggedOn: '2026-04-06',
      loggedAt: null,
    })
    expect(resolveLoggedAt(undefined, now)).toEqual({
      loggedOn: '2026-10-19',
      loggedAt: now,
    })
  })
})
