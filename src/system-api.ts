import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE, apiGet } from './api'

export interface SystemRecord {
  system_uid: string
  name?: string
  controller_count?: number
  first_seen?: string
  last_seen?: string
  [key: string]: unknown
}

export interface SystemMetricReading {
  value?: number | string | null
  unit?: string | null
  quality?: string
  contributors?: number
  expected_contributors?: number
  status?: string
  source_metric?: string
  resolution?: string
  [key: string]: unknown
}

export interface SystemLatest {
  system_uid?: string
  observed_at?: string | null
  metrics: Record<string, SystemMetricReading>
  [key: string]: unknown
}

export interface SystemEnergy {
  system_uid?: string
  metrics: Record<string, SystemMetricReading>
  [key: string]: unknown
}

export interface SystemHealth {
  system_uid?: string
  status: string
  controller_count?: number
  online_controllers?: number
  active_fault_controllers?: number
  active_alarm_controllers?: number
  [key: string]: unknown
}

export interface SystemEvent {
  id?: string | number
  event_type?: string
  observed_at?: string
  controller_uid?: string
  source_device_id?: string
  severity?: string
  message?: string
  details?: Record<string, unknown>
  [key: string]: unknown
}

export interface SystemHistoryPoint {
  bucket_start?: string
  observed_at?: string
  value?: number | string | null
  min?: number | null
  max?: number | null
  avg?: number | null
  first?: number | string | null
  last?: number | string | null
  quality?: string
  sources?: unknown[]
  [key: string]: unknown
}

export interface SystemHistory {
  system_uid?: string
  metric?: {
    name?: string
    unit?: string | null
    aggregation?: string
    [key: string]: unknown
  }
  resolution?: string
  points: SystemHistoryPoint[]
  [key: string]: unknown
}

export interface SystemMetricDefinition {
  name?: string
  unit?: string | null
  aggregation?: string
  description?: string
  [key: string]: unknown
}

export type SystemPowerFlow = Record<string, unknown>
export type SystemEnergyLedger = Record<string, unknown>
export type SystemTopology = Record<string, unknown>
export type SystemComponentGraph = Record<string, unknown>

const visibleInterval = (milliseconds: number) => () =>
  document.visibilityState === 'visible' ? milliseconds : false

function systemPath(systemUid: string, suffix: string): string {
  return `/v1/systems/${encodeURIComponent(systemUid)}${suffix}`
}

function rangeParams(from?: string, to?: string): URLSearchParams {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return params
}

export function useSystems() {
  return useQuery({
    queryKey: ['systems'],
    queryFn: ({ signal }) => apiGet<SystemRecord[]>('/v1/systems', undefined, signal),
    refetchInterval: visibleInterval(10_000),
    retry: 1,
  })
}

export function useSystem(systemUid?: string) {
  return useQuery({
    queryKey: ['system', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemRecord>(systemPath(systemUid ?? '', ''), undefined, signal),
    refetchInterval: visibleInterval(10_000),
    retry: 1,
  })
}

export function useSystemLatest(systemUid?: string) {
  return useQuery({
    queryKey: ['system-latest', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemLatest>(systemPath(systemUid ?? '', '/latest'), undefined, signal),
    refetchInterval: visibleInterval(5_000),
    retry: 1,
  })
}

export function useSystemEnergy(systemUid?: string) {
  return useQuery({
    queryKey: ['system-energy', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemEnergy>(systemPath(systemUid ?? '', '/energy'), undefined, signal),
    refetchInterval: visibleInterval(15_000),
    retry: 1,
  })
}

export function useSystemHealth(systemUid?: string) {
  return useQuery({
    queryKey: ['system-health', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemHealth>(systemPath(systemUid ?? '', '/health'), undefined, signal),
    refetchInterval: visibleInterval(10_000),
    retry: 1,
  })
}

export function useSystemPowerFlow(systemUid?: string) {
  return useQuery({
    queryKey: ['system-power-flow', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemPowerFlow>(systemPath(systemUid ?? '', '/power-flow'), undefined, signal),
    refetchInterval: visibleInterval(5_000),
    retry: 1,
  })
}

export function useSystemEnergyLedger(systemUid?: string) {
  return useQuery({
    queryKey: ['system-energy-ledger', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemEnergyLedger>(systemPath(systemUid ?? '', '/energy-ledger'), undefined, signal),
    refetchInterval: visibleInterval(15_000),
    retry: 1,
  })
}

export function useSystemEvents(systemUid?: string, from?: string, to?: string, limit = 500) {
  return useQuery({
    queryKey: ['system-events', systemUid, from, to, limit],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) => {
      const params = rangeParams(from, to)
      params.set('limit', String(limit))
      return apiGet<SystemEvent[]>(systemPath(systemUid ?? '', '/events'), params, signal)
    },
    refetchInterval: visibleInterval(10_000),
    retry: 1,
  })
}

export function useSystemTopology(systemUid?: string) {
  return useQuery({
    queryKey: ['system-topology', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemTopology>(systemPath(systemUid ?? '', '/topology'), undefined, signal),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useSystemComponentGraph(systemUid?: string) {
  return useQuery({
    queryKey: ['system-component-graph', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemComponentGraph>(systemPath(systemUid ?? '', '/component-graph'), undefined, signal),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useSystemMetricCatalog() {
  return useQuery({
    queryKey: ['system-metric-catalog'],
    queryFn: ({ signal }) => apiGet<SystemMetricDefinition[]>('/v1/systems/metrics/catalog', undefined, signal),
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

export function useSystemHistory(
  systemUid: string | undefined,
  metric: string,
  from?: string,
  to?: string,
  resolution = '5m',
  maxPoints = 20_000,
) {
  return useQuery({
    queryKey: ['system-history', systemUid, metric, from, to, resolution, maxPoints],
    enabled: Boolean(systemUid && metric),
    queryFn: ({ signal }) => {
      const params = rangeParams(from, to)
      params.set('metric', metric)
      params.set('resolution', resolution)
      params.set('max_points', String(maxPoints))
      return apiGet<SystemHistory>(systemPath(systemUid ?? '', '/history'), params, signal)
    },
    staleTime: 15_000,
    retry: false,
  })
}

function streamUrl(systemUid: string): string {
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
  return `${base}${systemPath(systemUid, '/stream')}`
}

export type SystemStreamState = 'disabled' | 'connecting' | 'connected' | 'reconnecting'

export function useSystemStream(systemUid?: string): SystemStreamState {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SystemStreamState>(systemUid ? 'connecting' : 'disabled')

  useEffect(() => {
    if (!systemUid) {
      setState('disabled')
      return
    }

    setState('connecting')
    const source = new EventSource(streamUrl(systemUid))

    const refreshTelemetry = () => {
      setState('connected')
      void queryClient.invalidateQueries({ queryKey: ['system-latest', systemUid] })
      void queryClient.invalidateQueries({ queryKey: ['system-power-flow', systemUid] })
      void queryClient.invalidateQueries({ queryKey: ['system-energy', systemUid] })
      void queryClient.invalidateQueries({ queryKey: ['system-energy-ledger', systemUid] })
      void queryClient.invalidateQueries({ queryKey: ['system-health', systemUid] })
    }

    const refreshEvents = () => {
      setState('connected')
      void queryClient.invalidateQueries({ queryKey: ['system-events', systemUid] })
    }

    source.addEventListener('telemetry', refreshTelemetry)
    source.addEventListener('system_event', refreshEvents)
    source.onopen = () => setState('connected')
    source.onerror = () => setState('reconnecting')

    return () => {
      source.removeEventListener('telemetry', refreshTelemetry)
      source.removeEventListener('system_event', refreshEvents)
      source.close()
    }
  }, [queryClient, systemUid])

  return state
}
