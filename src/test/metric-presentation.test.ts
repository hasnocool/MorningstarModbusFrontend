import { describe, expect, it } from 'vitest'
import {
  exactKwhFromWh,
  metricAvailability,
  metricPresentationLabel,
  metricPresentationReason,
} from '../metric-presentation'

describe('capability-aware metric presentation', () => {
  it('distinguishes unsupported hardware from temporarily missing evidence', () => {
    const unsupported = {
      value: null,
      quality: 'empty',
      contributors: 0,
      expected_contributors: 0,
    }
    const missing = {
      value: null,
      quality: 'empty',
      contributors: 0,
      expected_contributors: 1,
    }

    expect(metricAvailability(unsupported)).toBe('unsupported')
    expect(metricPresentationLabel(unsupported)).toBe('unsupported by enrolled hardware')
    expect(metricPresentationReason(unsupported)).toContain('No enrolled controller profile')

    expect(metricAvailability(missing)).toBe('unavailable')
    expect(metricPresentationLabel(missing)).toBe('not currently observed')
    expect(metricPresentationReason(missing)).toContain('1 eligible controller')
  })

  it('preserves backend conflict reasons', () => {
    const conflict = {
      value: null,
      quality: 'conflict',
      resolution: 'conflict',
      reason: 'Two whole-system reporters disagree.',
    }

    expect(metricAvailability(conflict)).toBe('conflict')
    expect(metricPresentationLabel(conflict)).toBe('conflicting sources')
    expect(metricPresentationReason(conflict)).toBe('Two whole-system reporters disagree.')
  })

  it('creates an exact kWh display view from a Wh counter', () => {
    const converted = exactKwhFromWh({
      value: 2320,
      unit: 'Wh',
      quality: 'partial',
      contributors: 1,
      expected_contributors: 1,
    })

    expect(converted?.value).toBe(2.32)
    expect(converted?.unit).toBe('kWh')
    expect(converted?.quality).toBe('derived')
    expect(converted?.source_metric).toBe('daily_charge_wh')
    expect(converted?.formula).toBe('daily_charge_wh / 1000')
  })
})
