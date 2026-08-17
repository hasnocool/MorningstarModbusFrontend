import { useMemo, useState } from 'react'
import {
  localDayKey,
  medianSummary,
  shiftDay,
  summarizeDay,
  type DayLabHistories,
  type DaySummary,
} from './day-lab'
import { useForecastAccuracy, useSystemForecast } from './forecast-api'
import {
  useSystemBaselines,
  useSystemHealthScore,
  useSystemIncidents,
} from './intelligence-api'
import { buildOperatorAnswers, type OperatorAnswer } from './operator-answers'
import {
  useSystemHealth,
  useSystemHistory,
  useSystemLatest,
  useSystems,
} from './system-api'

export interface OperatorAnswersDataOptions {
  includeComparisons?: boolean
}

export interface OperatorAnswersData {
  systemUid?: string
  systemsLoading: boolean
  systemsError: boolean
  answers: OperatorAnswer[]
  answeredCount: number
  unknownCount: number
  activeIncidentCount: number
  errorCount: number
  loading: boolean
  healthScore?: number
  healthStatus?: string
  todaySummary?: DaySummary
  recentMedian?: DaySummary
}

function dayStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString()
}

export function useOperatorAnswersData(
  options: OperatorAnswersDataOptions = {},
): OperatorAnswersData {
  const includeComparisons = options.includeComparisons ?? true
  const systems = useSystems()
  const systemUid = systems.data?.[0]?.system_uid
  const [now] = useState(() => new Date())
  const today = localDayKey(now)
  const throughMinute = now.getHours() * 60 + now.getMinutes()
  const queryFrom = dayStart(shiftDay(today, -7))
  const queryTo = now.toISOString()

  const latest = useSystemLatest(systemUid)
  const health = useSystemHealth(systemUid)
  const forecast = useSystemForecast(systemUid)
  const accuracy = useForecastAccuracy(systemUid)
  const healthScore = useSystemHealthScore(systemUid)
  const incidents = useSystemIncidents(systemUid, 'active', undefined, 200)
  const baselines = useSystemBaselines(systemUid)

  const comparisonSystemUid = includeComparisons ? systemUid : undefined
  const solarHistory = useSystemHistory(
    comparisonSystemUid,
    'solar_input_power_w',
    queryFrom,
    queryTo,
    '15m',
    1200,
  )
  const outputHistory = useSystemHistory(
    comparisonSystemUid,
    'charge_output_power_w',
    queryFrom,
    queryTo,
    '15m',
    1200,
  )
  const voltageHistory = useSystemHistory(
    comparisonSystemUid,
    'battery_voltage_v',
    queryFrom,
    queryTo,
    '15m',
    1200,
  )
  const currentHistory = useSystemHistory(
    comparisonSystemUid,
    'battery_charge_current_a',
    queryFrom,
    queryTo,
    '15m',
    1200,
  )

  const histories: DayLabHistories = useMemo(
    () => ({
      solar: solarHistory.data,
      output: outputHistory.data,
      voltage: voltageHistory.data,
      current: currentHistory.data,
    }),
    [currentHistory.data, outputHistory.data, solarHistory.data, voltageHistory.data],
  )

  const todaySummary = useMemo(
    () =>
      includeComparisons
        ? summarizeDay(histories, today, 15, throughMinute)
        : undefined,
    [histories, includeComparisons, throughMinute, today],
  )

  const recentMedian = useMemo(() => {
    if (!includeComparisons) return undefined
    const summaries = Array.from({ length: 7 }, (_, index) =>
      summarizeDay(histories, shiftDay(today, -(index + 1)), 15, throughMinute),
    ).filter((summary) => summary.observedBuckets > 0)
    return medianSummary(summaries, 'Prior 7-day median')
  }, [histories, includeComparisons, throughMinute, today])

  const answers = useMemo(
    () =>
      buildOperatorAnswers({
        latestMetrics: latest.data?.metrics,
        health: health.data,
        healthScore: healthScore.data,
        incidents: incidents.data,
        baseline: baselines.data?.solar_input_power,
        forecast: forecast.data,
        accuracy: accuracy.data,
        today: todaySummary,
        recentMedian,
      }),
    [
      accuracy.data,
      baselines.data?.solar_input_power,
      forecast.data,
      health.data,
      healthScore.data,
      incidents.data,
      latest.data?.metrics,
      recentMedian,
      todaySummary,
    ],
  )

  const answeredCount = answers.filter((item) => item.status !== 'unknown').length
  const unknownCount = answers.length - answeredCount
  const activeIncidentCount = incidents.data?.length ?? 0
  const baseErrors = [
    latest.isError,
    health.isError,
    forecast.isError,
    accuracy.isError,
    healthScore.isError,
    incidents.isError,
    baselines.isError,
  ]
  const comparisonErrors = includeComparisons
    ? [solarHistory.isError, outputHistory.isError, voltageHistory.isError, currentHistory.isError]
    : []
  const errorCount = [...baseErrors, ...comparisonErrors].filter(Boolean).length
  const loading = [
    latest.isLoading,
    health.isLoading,
    forecast.isLoading,
    healthScore.isLoading,
    incidents.isLoading,
    baselines.isLoading,
  ].some(Boolean)

  return {
    systemUid,
    systemsLoading: systems.isLoading,
    systemsError: systems.isError,
    answers,
    answeredCount,
    unknownCount,
    activeIncidentCount,
    errorCount,
    loading,
    healthScore: healthScore.data?.score,
    healthStatus: healthScore.data?.status,
    todaySummary,
    recentMedian,
  }
}
