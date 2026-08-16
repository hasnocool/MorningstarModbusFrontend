import { useQuery } from '@tanstack/react-query'
import {
  API_BASE,
  apiGet,
  type HistorySeries,
  type HistorySummary,
  type LatestSample,
  type PollingPerformance,
  type RegisterStat,
} from './api'
import type { ControllerRecord } from './controller-api'

export interface ControllerHistoryResponse {
  controller_uid: string
  controller_id: string
  canonical_device_id: string
  history_device_ids: string[]
  from?: string | null
  to?: string | null
  resolution: string
  series: HistorySeries[]
}

export interface ControllerStatsResponse {
  controller_uid: string
  controller_id: string
  canonical_device_id: string
  history_device_ids: string[]
  from?: string | null
  to?: string | null
  registers: RegisterStat[]
}

export interface ControllerCoverage {
  controller_uid?: string
  from?: string | null
  to?: string | null
  realtime?: {
    days_with_samples?: number
    coverage_percent?: number
    [key: string]: unknown
  }
  daily_evidence?: {
    covered_days?: number
    recovered_days?: number
    partial_days?: number
    missing_days?: number
    coverage_percent?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ControllerGap {
  from: string
  to: string
  duration_days: number
  status: string
  recoverability?: string
  controller_record_count?: number
}

export interface ControllerGaps {
  controller_uid?: string
  gaps: ControllerGap[]
  [key: string]: unknown
}

export interface ControllerEnergyDay {
  date: string
  energy?: {
    controller_reported_wh?: number | null
    integrated_output_wh?: number | null
    discrepancy_wh?: number | null
    discrepancy_percent?: number | null
    [key: string]: unknown
  }
  quality?: {
    provenance?: string[]
    integrated_seconds?: number | null
    skipped_seconds?: number | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ControllerEnergyDaily {
  controller_uid?: string
  days: ControllerEnergyDay[]
  [key: string]: unknown
}

export interface ControllerEnergySummary {
  controller_uid?: string
  energy?: {
    controller_reported_wh?: number | null
    integrated_output_wh?: number | null
    discrepancy_wh?: number | null
    discrepancy_percent?: number | null
    [key: string]: unknown
  }
  quality?: Record<string, unknown>
  [key: string]: unknown
}

type ControllerLatestWire = Omit<LatestSample, 'device_id'> & {
  controller_uid: string
  controller_id: string
  canonical_device_id: string
  history_device_ids: string[]
  source_device_id: string
}

const visibleInterval = (milliseconds: number) => () =>
  document.visibilityState === 'visible' ? milliseconds : false

function controllerPath(controllerUid: string, suffix: string): string {
  return `/v1/controllers/${encodeURIComponent(controllerUid)}${suffix}`
}

function rangeParams(from?: string, to?: string): URLSearchParams {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return params
}

export function useController(controllerUid?: string) {
  return useQuery({
    queryKey: ['controller', controllerUid],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<ControllerRecord>(controllerPath(controllerUid ?? '', ''), undefined, signal),
    refetchInterval: visibleInterval(5_000),
    retry: 1,
  })
}

export function useControllerLatest(controllerUid?: string) {
  return useQuery({
    queryKey: ['controller-latest', controllerUid],
    enabled: Boolean(controllerUid),
    queryFn: async ({ signal }) => {
      const sample = await apiGet<ControllerLatestWire>(
        controllerPath(controllerUid ?? '', '/latest'),
        undefined,
        signal,
      )
      return { ...sample, device_id: sample.source_device_id } satisfies LatestSample
    },
    refetchInterval: visibleInterval(1_000),
    retry: 1,
  })
}

export function useControllerHistorySummary(
  controllerUid?: string,
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: ['controller-history-summary', controllerUid, from, to],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<HistorySummary>(
        controllerPath(controllerUid ?? '', '/history/summary'),
        rangeParams(from, to),
        signal,
      ),
    staleTime: 10_000,
    retry: 1,
  })
}

export function useControllerHistory(
  controllerUid: string | undefined,
  names: string[],
  from?: string,
  to?: string,
  resolution = 'raw',
  maxPoints = 20_000,
) {
  return useQuery({
    queryKey: ['controller-history', controllerUid, names, from, to, resolution, maxPoints],
    enabled: Boolean(controllerUid && names.length),
    queryFn: ({ signal }) => {
      const params = rangeParams(from, to)
      params.set('resolution', resolution)
      params.set('order', 'asc')
      params.set('max_points', String(maxPoints))
      names.forEach((name) => params.append('name', name))
      return apiGet<ControllerHistoryResponse>(
        controllerPath(controllerUid ?? '', '/registers/history'),
        params,
        signal,
      )
    },
    staleTime: resolution === 'raw' ? 2_000 : 15_000,
    retry: false,
  })
}

export function useControllerRegisterStats(
  controllerUid: string | undefined,
  names: string[],
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: ['controller-register-stats', controllerUid, names, from, to],
    enabled: Boolean(controllerUid && names.length),
    queryFn: ({ signal }) => {
      const params = rangeParams(from, to)
      names.forEach((name) => params.append('name', name))
      return apiGet<ControllerStatsResponse>(
        controllerPath(controllerUid ?? '', '/registers/stats'),
        params,
        signal,
      )
    },
    staleTime: 10_000,
    retry: 1,
  })
}

export function useControllerCoverage(controllerUid?: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ['controller-coverage', controllerUid, from, to],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<ControllerCoverage>(
        controllerPath(controllerUid ?? '', '/history/coverage'),
        rangeParams(from, to),
        signal,
      ),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useControllerGaps(controllerUid?: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ['controller-gaps', controllerUid, from, to],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<ControllerGaps>(
        controllerPath(controllerUid ?? '', '/history/gaps'),
        rangeParams(from, to),
        signal,
      ),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useControllerEnergyDaily(
  controllerUid?: string,
  from?: string,
  to?: string,
  maxGapSeconds = 300,
) {
  return useQuery({
    queryKey: ['controller-energy-daily', controllerUid, from, to, maxGapSeconds],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) => {
      const params = rangeParams(from, to)
      params.set('max_gap_seconds', String(maxGapSeconds))
      return apiGet<ControllerEnergyDaily>(
        controllerPath(controllerUid ?? '', '/energy/daily'),
        params,
        signal,
      )
    },
    staleTime: 30_000,
    retry: 1,
  })
}

export function useControllerEnergySummary(
  controllerUid?: string,
  from?: string,
  to?: string,
  maxGapSeconds = 300,
) {
  return useQuery({
    queryKey: ['controller-energy-summary', controllerUid, from, to, maxGapSeconds],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) => {
      const params = rangeParams(from, to)
      params.set('max_gap_seconds', String(maxGapSeconds))
      return apiGet<ControllerEnergySummary>(
        controllerPath(controllerUid ?? '', '/energy/summary'),
        params,
        signal,
      )
    },
    staleTime: 30_000,
    retry: 1,
  })
}

export function useControllerPollingPerformance(controllerUid?: string) {
  return useQuery({
    queryKey: ['controller-polling-performance', controllerUid],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<PollingPerformance>(
        controllerPath(controllerUid ?? '', '/polling/performance'),
        undefined,
        signal,
      ),
    refetchInterval: visibleInterval(5_000),
    retry: 1,
  })
}

export function controllerExportUrl(
  controllerUid: string,
  format: 'csv' | 'jsonl',
  from?: string,
  to?: string,
  resolution = 'raw',
  names: string[] = [],
): string {
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
  const params = rangeParams(from, to)
  params.set('format', format)
  params.set('resolution', resolution)
  params.set('order', 'asc')
  names.forEach((name) => params.append('name', name))
  return `${base}${controllerPath(controllerUid, '/history/export')}?${params.toString()}`
}
