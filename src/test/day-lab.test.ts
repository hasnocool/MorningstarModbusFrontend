import { describe, expect, it } from 'vitest'
import {
  medianCurve,
  medianSummary,
  percentDelta,
  replayUrlForTimestamp,
  summarizeDay,
  type DayLabHistories,
} from '../day-lab'
import type { SystemHistory } from '../system-api'

function history(day: string, values: number[]): SystemHistory {
  return {
    resolution: '15m',
    points: values.map((value, index) => ({
      bucket_start: `${day}T00:${String(index * 15).padStart(2, '0')}:00`,
      avg: value,
    })),
  }
}

describe('Day Lab comparison utilities', () => {
  it('summarizes fixed-resolution power without inventing missing buckets', () => {
    const histories: DayLabHistories = {
      solar: history('2026-08-10', [100, 200, 300, 400]),
      output: history('2026-08-10', [80, 160, 240, 320]),
      voltage: history('2026-08-10', [13.2, 13.4, 13.8, 14.1]),
      current: history('2026-08-10', [5, 10, 15, 20]),
      dailyCharge: history('2026-08-10', [50, 100, 180, 250]),
    }

    const summary = summarizeDay(histories, '2026-08-10', 15, 59)

    expect(summary.solarInputWh).toBe(250)
    expect(summary.chargeOutputWh).toBe(200)
    expect(summary.peakSolarW).toBe(400)
    expect(summary.maxBatteryV).toBe(14.1)
    expect(summary.avgChargeA).toBe(12.5)
    expect(summary.dailyChargeWh).toBe(250)
    expect(summary.coverage).toBe(1)
  })

  it('builds historical medians from prior-day evidence', () => {
    const first = summarizeDay({ solar: history('2026-08-09', [100, 200]) }, '2026-08-09', 15, 29)
    const second = summarizeDay({ solar: history('2026-08-08', [300, 400]) }, '2026-08-08', 15, 29)
    const summary = medianSummary([first, second], 'median')

    expect(summary.solarInputWh).toBe(125)
    expect(percentDelta(150, 100)).toBe(50)

    const combined: SystemHistory = {
      points: [...history('2026-08-09', [100, 300]).points, ...history('2026-08-08', [300, 500]).points],
    }
    expect(medianCurve(combined, ['2026-08-09', '2026-08-08'], 29)).toEqual([
      { minute: 0, value: 200 },
      { minute: 15, value: 400 },
    ])
  })

  it('creates shareable replay windows around evidence timestamps', () => {
    const url = replayUrlForTimestamp('2026-08-10T12:00:00.000Z', 60)
    expect(url).toContain('/site/replay?')
    expect(url).toContain('at=2026-08-10T12%3A00%3A00.000Z')
    expect(url).toContain('from=2026-08-10T11%3A00%3A00.000Z')
    expect(url).toContain('to=2026-08-10T13%3A00%3A00.000Z')
  })
})
