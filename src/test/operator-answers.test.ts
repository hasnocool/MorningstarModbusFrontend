import { describe, expect, it } from 'vitest'
import { buildOperatorAnswers, filterOperatorAnswers } from '../operator-answers'
import type { SystemForecast } from '../forecast-api'

const forecast: SystemForecast = {
  system_uid: 'system:test',
  generated_at: '2026-08-16T20:00:00Z',
  status: 'ready',
  confidence: 'medium',
  solar: {
    system_uid: 'system:test',
    metric: 'solar_input_power_w',
    unit: 'W',
    status: 'ready',
    generated_at: '2026-08-16T20:00:00Z',
    current_power_w: 500,
    training_days: 8,
    history_days: 30,
    coverage_fraction_today: 0.96,
    confidence: 'medium',
    energy: {
      observed_input_wh: 2100,
      expected_so_far_p50_wh: 2000,
      progress_ratio: 1.05,
      remaining_p10_wh: 300,
      remaining_p50_wh: 500,
      remaining_p90_wh: 800,
      eod_p10_wh: 2400,
      eod_p50_wh: 2600,
      eod_p90_wh: 2900,
    },
    curve: [],
    provenance: {
      model: 'local-time-of-day-percentile',
      weather_used: false,
      internet_required: false,
    },
  },
  charge: {
    controllers: [
      {
        controller_uid: 'controller:test',
        status: 'ready',
        generated_at: '2026-08-16T20:00:00Z',
        current_state: 'ABSORPTION',
        float_probability: 0.8,
        expected_float_at: '2026-08-16T22:00:00Z',
        training_days: 8,
        float_days: 6,
        confidence: 'medium',
      },
    ],
    all_controllers_float_probability: 0.8,
    expected_all_controllers_float_at: '2026-08-16T22:00:00Z',
  },
  model: {
    name: 'offline-local-history',
    version: 1,
    offline: true,
    weather_used: false,
  },
}

function fixture() {
  return buildOperatorAnswers({
    latestMetrics: {
      solar_input_power_w: { value: 500, unit: 'W', quality: 'observed', contributors: 1, expected_contributors: 1 },
      charge_output_power_w: { value: 470, unit: 'W', quality: 'observed', contributors: 1, expected_contributors: 1 },
      battery_voltage_v: { value: 14.6, unit: 'V', quality: 'observed', contributors: 1, expected_contributors: 1 },
      battery_charge_current_a: { value: 31.2, unit: 'A', quality: 'observed', contributors: 1, expected_contributors: 1 },
      charge_state: { value: 'ABSORPTION', quality: 'observed' },
    },
    health: {
      status: 'online',
      controller_count: 1,
      online_controllers: 1,
      active_fault_controllers: 0,
      active_alarm_controllers: 0,
    },
    healthScore: {
      system_uid: 'system:test',
      score: 94,
      status: 'healthy',
      components: { availability: 20, telemetry: 19, electrical: 19, incidents: 18, history: 18 },
      active_incidents: 0,
      penalties: [],
    },
    incidents: [],
    baseline: {
      status: 'ready',
      current_value: 500,
      expected_low: 350,
      expected_median: 520,
      expected_high: 650,
      comparable_days: 7,
      history_days: 30,
      confidence: 'medium',
      provenance: 'local history',
    },
    forecast,
    accuracy: {
      system_uid: 'system:test',
      model: 'offline-local-history',
      status: 'ready',
      evaluated_days: 7,
      median_absolute_error_percent: 11,
      mean_absolute_error_percent: 13,
      p90_absolute_error_percent: 22,
      p10_p90_interval_coverage: 0.86,
      days: [],
    },
    today: {
      day: '2026-08-16',
      solarInputWh: 2100,
      chargeOutputWh: 1970,
      peakSolarW: 710,
      peakChargeW: 670,
      maxBatteryV: 14.7,
      avgChargeA: 23,
      coverage: 0.96,
      observedBuckets: 60,
      expectedBuckets: 62,
    },
    recentMedian: {
      day: 'Prior 7-day median',
      solarInputWh: 2000,
      chargeOutputWh: 1880,
      peakSolarW: 690,
      peakChargeW: 650,
      maxBatteryV: 14.65,
      avgChargeA: 22,
      coverage: 0.95,
      observedBuckets: 59,
      expectedBuckets: 62,
    },
  })
}

describe('Operator Answers', () => {
  it('builds a broad canonical question catalog from existing evidence', () => {
    const answers = fixture()
    expect(answers).toHaveLength(28)
    expect(answers.find((item) => item.id === 'projected-eod')?.answer).toContain('2.60 kWh')
    expect(answers.find((item) => item.id === 'reach-float')?.answer).toContain('80%')
    expect(answers.find((item) => item.id === 'metric-quality')?.status).toBe('online')
  })

  it('prioritizes a critical incident and deep-links it into replay', () => {
    const answers = buildOperatorAnswers({
      incidents: [
        {
          incident_uid: 'incident:test',
          system_uid: 'system:test',
          detector: 'controller_offline',
          category: 'availability',
          severity: 'critical',
          confidence: 'high',
          state: 'active',
          title: 'Controller offline',
          summary: 'No recent controller telemetry.',
          evidence: [],
          opened_at: '2026-08-16T18:00:00Z',
        },
      ],
    })
    const priority = answers.find((item) => item.id === 'attention-first')
    expect(priority?.status).toBe('critical')
    expect(priority?.answer).toBe('Controller offline')
    expect(priority?.href).toContain('/site/replay?')
  })

  it('keeps unsupported and missing measurements distinct from healthy data', () => {
    const answers = buildOperatorAnswers({
      latestMetrics: {
        solar_input_power_w: { value: 300, expected_contributors: 1, contributors: 1 },
        charge_output_power_w: { value: null, expected_contributors: 1, contributors: 0 },
        battery_voltage_v: { value: null, expected_contributors: 0, contributors: 0 },
        battery_charge_current_a: { value: 20, expected_contributors: 1, contributors: 1 },
      },
    })
    const quality = answers.find((item) => item.id === 'metric-quality')
    expect(quality?.answer).toContain('1 unsupported')
    expect(quality?.answer).toContain('1 temporarily unavailable')
    expect(quality?.status).toBe('warning')
  })

  it('searches question text, answers, categories, and keywords', () => {
    const answers = fixture()
    expect(filterOperatorAnswers(answers, 'float')).toHaveLength(2)
    expect(filterOperatorAnswers(answers, 'telemetry', 'Data quality').map((item) => item.id)).toContain(
      'telemetry-coverage',
    )
    expect(filterOperatorAnswers(answers, '', 'Forecast').every((item) => item.category === 'Forecast')).toBe(true)
  })
})
