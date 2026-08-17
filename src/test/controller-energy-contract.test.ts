import { describe, expect, it } from 'vitest'
import {
  normalizeControllerEnergyDaily,
  normalizeControllerEnergySummary,
} from '../controller-data'

describe('controller energy wire contract', () => {
  it('preserves the API difference sign for daily energy comparisons', () => {
    const payload = normalizeControllerEnergyDaily({
      controller_uid: 'ctrl_example',
      days: [
        {
          date: '2026-08-16',
          energy: {
            controller_reported_wh: 2500,
            integrated_output_wh: 2400,
            difference_wh: -100,
            difference_percent: -4,
          },
        },
      ],
    })

    expect(payload.days[0]?.energy?.difference_wh).toBe(-100)
    expect(payload.days[0]?.energy?.discrepancy_wh).toBe(-100)
    expect(payload.days[0]?.energy?.difference_percent).toBe(-4)
    expect(payload.days[0]?.energy?.discrepancy_percent).toBe(-4)
  })

  it('normalizes summary responses without recomputing the upstream comparison', () => {
    const payload = normalizeControllerEnergySummary({
      controller_uid: 'ctrl_example',
      energy: {
        controller_reported_wh: 10_000,
        integrated_output_wh: 10_250,
        difference_wh: 250,
        difference_percent: 2.5,
      },
    })

    expect(payload.energy?.difference_wh).toBe(250)
    expect(payload.energy?.discrepancy_wh).toBe(250)
    expect(payload.energy?.difference_percent).toBe(2.5)
    expect(payload.energy?.discrepancy_percent).toBe(2.5)
  })
})
