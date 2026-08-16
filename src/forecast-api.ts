import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'

export interface SolarForecastPoint {
  at: string
  minute_of_day: number
  phase: 'observed' | 'forecast'
  observed_w?: number | null
  p10_w?: number | null
  p50_w?: number | null
  p90_w?: number | null
  training_samples?: number
}

export interface SolarEnergyForecast {
  observed_input_wh?: number | null
  expected_so_far_p50_wh?: number | null
  progress_ratio?: number | null
  remaining_p10_wh?: number | null
  remaining_p50_wh?: number | null
  remaining_p90_wh?: number | null
  eod_p10_wh?: number | null
  eod_p50_wh?: number | null
  eod_p90_wh?: number | null
  integration_semantics?: string
}

export interface SolarForecast {
  system_uid: string
  metric: string
  unit: string
  status: string
  generated_at: string
  current_power_w?: number | null
  training_days: number
  history_days: number
  coverage_fraction_today?: number | null
  confidence: string
  productive_window?: {
    start?: string | null
    end?: string | null
    threshold_w?: number
  }
  energy: SolarEnergyForecast
  curve: SolarForecastPoint[]
  provenance: {
    source?: string
    model?: string
    resolution?: string
    weather_used?: boolean
    internet_required?: boolean
  }
}

export interface ChargeForecast {
  controller_uid: string
  status: string
  generated_at: string
  current_state?: string | null
  float_probability?: number | null
  historical_float_probability?: number | null
  expected_float_at?: string | null
  training_days: number
  float_days: number
  confidence: string
  model?: string
  provenance?: string
}

export interface SystemForecast {
  system_uid: string
  generated_at: string
  status: string
  confidence: string
  solar: SolarForecast
  charge: {
    controllers: ChargeForecast[]
    all_controllers_float_probability?: number | null
    expected_all_controllers_float_at?: string | null
  }
  model: {
    name?: string
    version?: number
    offline?: boolean
    weather_used?: boolean
  }
  semantics?: string
}

export interface ForecastAccuracyDay {
  day: string
  actual_wh?: number | null
  p10_wh?: number | null
  p50_wh?: number | null
  p90_wh?: number | null
  absolute_error_percent?: number | null
  inside_p10_p90?: boolean
  training_days?: number
}

export interface ForecastAccuracy {
  system_uid: string
  model: string
  status: string
  evaluated_days: number
  median_absolute_error_percent?: number | null
  mean_absolute_error_percent?: number | null
  p90_absolute_error_percent?: number | null
  p10_p90_interval_coverage?: number | null
  days: ForecastAccuracyDay[]
  methodology?: string
}

const visibleInterval = (milliseconds: number) => () =>
  document.visibilityState === 'visible' ? milliseconds : false

function systemPath(systemUid: string, suffix: string): string {
  return `/v1/systems/${encodeURIComponent(systemUid)}${suffix}`
}

function controllerPath(controllerUid: string, suffix: string): string {
  return `/v1/controllers/${encodeURIComponent(controllerUid)}${suffix}`
}

export function useSystemForecast(systemUid?: string) {
  return useQuery({
    queryKey: ['system-forecast', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemForecast>(systemPath(systemUid ?? '', '/forecast'), undefined, signal),
    refetchInterval: visibleInterval(60_000),
    retry: 1,
  })
}

export function useForecastAccuracy(systemUid?: string) {
  return useQuery({
    queryKey: ['system-forecast-accuracy', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<ForecastAccuracy>(systemPath(systemUid ?? '', '/forecast/accuracy'), undefined, signal),
    staleTime: 15 * 60_000,
    retry: 1,
  })
}

export function useControllerChargeForecast(controllerUid?: string) {
  return useQuery({
    queryKey: ['controller-charge-forecast', controllerUid],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<ChargeForecast>(
        controllerPath(controllerUid ?? '', '/charge-forecast'),
        undefined,
        signal,
      ),
    refetchInterval: visibleInterval(60_000),
    retry: 1,
  })
}
