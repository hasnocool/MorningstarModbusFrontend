import { useQuery } from '@tanstack/react-query'

export interface DeviceRecord {
  id: string
  stable_key?: string
  transport: string
  target: string
  port?: number | null
  unit_id: number
  vendor_name?: string
  product_code?: string
  revision?: string
  profile: string
  status: string
  first_seen?: string
  last_seen?: string
  last_error?: string | null
}

export interface RegisterValue {
  register_name: string
  address: number
  function: string
  raw?: unknown
  raw_json?: string
  numeric_value?: number | null
  text_value?: string | null
  value?: number | string | null
  unit?: string | null
  kind?: 'numeric' | 'text'
  observed_at?: string
}

export interface LatestSample {
  id: number
  device_id: string
  observed_at: string
  latency_ms: number
  profile: string
  values: RegisterValue[]
}

export interface IntelligenceRecord {
  device_id?: string
  profile: string
  family?: string
  model?: string
  serial_number?: string
  firmware?: string
  hardware_revision?: string
  catalog_revision?: string
  confidence?: number
  intelligence_status?: string
  status?: string
  capabilities?: string[]
  network?: Record<string, unknown>
  evidence?: Array<Record<string, unknown>>
  warnings?: Array<Record<string, unknown>>
  metadata?: Record<string, unknown>
  updated_at?: string
}

export interface HistoryPoint {
  observed_at?: string
  bucket_start?: string
  value?: number | string | null
  min?: number | null
  max?: number | null
  avg?: number | null
  first?: number | string | null
  last?: number | string | null
  count?: number
  transitions?: number
}

export interface HistorySeries {
  name: string
  unit?: string | null
  kind?: string
  points: HistoryPoint[]
}

export interface HistoryResponse {
  device_id: string
  from?: string | null
  to?: string | null
  resolution: string
  series: HistorySeries[]
}

export interface HistorySummary {
  device_id?: string
  first_observation?: string | null
  last_observation?: string | null
  poll_sample_count?: number
  register_observation_count?: number
  error_count?: number
  distinct_register_count?: number
  observed_duration_seconds?: number | null
  database_bytes?: number
  poll_latency_ms?: {
    min?: number | null
    max?: number | null
    avg?: number | null
  }
  [key: string]: unknown
}

export interface RegisterStat {
  name?: string
  register_name?: string
  kind?: string
  unit?: string | null
  count?: number
  min?: number | null
  max?: number | null
  avg?: number | null
  first?: number | string | null
  last?: number | string | null
  delta?: number | null
  transitions?: number
  state_counts?: Record<string, number>
  [key: string]: unknown
}

export interface RegisterStatsResponse {
  device_id: string
  from?: string | null
  to?: string | null
  registers: RegisterStat[]
}

export interface Health {
  status: string
  version?: string
}

export interface PollingPerformance {
  poll_rate_hz?: number
  poll_latency_p50_ms?: number
  poll_latency_p95_ms?: number
  poll_latency_p99_ms?: number
  deadline_misses?: number
  deadline_miss_rate?: number
  modbus_requests_per_second?: number
  modbus_bytes_per_second?: number
  request_failure_rate?: number
  success_rate?: number
  bus_utilization_avg_percent?: number | null
  bus_utilization_max_percent?: number | null
  sample_count?: number
  [key: string]: unknown
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

function urlFor(path: string, params?: URLSearchParams): string {
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
  const suffix = params && params.size ? `?${params.toString()}` : ''
  return `${base}${path}${suffix}`
}

export async function apiGet<T>(
  path: string,
  params?: URLSearchParams,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(urlFor(path, params), {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    let detail: unknown
    try {
      detail = await response.json()
    } catch {
      detail = await response.text()
    }
    throw new ApiError(`API request failed (${response.status})`, response.status, detail)
  }
  return (await response.json()) as T
}

export function exportUrl(
  deviceId: string,
  names: string[],
  from: string | undefined,
  to: string | undefined,
  resolution: string,
  format: 'csv' | 'jsonl',
): string {
  const params = new URLSearchParams({ device_id: deviceId, resolution, format })
  names.forEach((name) => params.append('name', name))
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return urlFor('/v1/devices/history/export', params)
}

const visibleInterval = (milliseconds: number) => () =>
  document.visibilityState === 'visible' ? milliseconds : false

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet<Health>('/health', undefined, signal),
    refetchInterval: visibleInterval(10_000),
    retry: 1,
  })
}

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: ({ signal }) => apiGet<DeviceRecord[]>('/v1/devices', undefined, signal),
    refetchInterval: visibleInterval(5_000),
    retry: 1,
  })
}

export function useLatest(deviceId?: string) {
  return useQuery({
    queryKey: ['latest', deviceId],
    enabled: Boolean(deviceId),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ device_id: deviceId ?? '' })
      return apiGet<LatestSample>('/v1/devices/latest', params, signal)
    },
    refetchInterval: visibleInterval(1_000),
    retry: 1,
  })
}

export function useIntelligence(deviceId?: string) {
  return useQuery({
    queryKey: ['intelligence', deviceId],
    enabled: Boolean(deviceId),
    queryFn: ({ signal }) =>
      apiGet<IntelligenceRecord>(
        '/v1/devices/intelligence',
        new URLSearchParams({ device_id: deviceId ?? '' }),
        signal,
      ),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useProfileValidation(deviceId?: string) {
  return useQuery({
    queryKey: ['profile-validation', deviceId],
    enabled: Boolean(deviceId),
    queryFn: ({ signal }) =>
      apiGet<Record<string, unknown>>(
        '/v1/devices/profile/validation',
        new URLSearchParams({ device_id: deviceId ?? '' }),
        signal,
      ),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useRegisterMap(deviceId?: string) {
  return useQuery({
    queryKey: ['register-map', deviceId],
    enabled: Boolean(deviceId),
    queryFn: ({ signal }) =>
      apiGet<Record<string, unknown>>(
        '/v1/devices/register-map',
        new URLSearchParams({ device_id: deviceId ?? '' }),
        signal,
      ),
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

export function useHistorySummary(deviceId?: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ['history-summary', deviceId, from, to],
    enabled: Boolean(deviceId),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ device_id: deviceId ?? '' })
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      return apiGet<HistorySummary>('/v1/devices/history/summary', params, signal)
    },
    staleTime: 10_000,
    retry: 1,
  })
}

export function useHistory(
  deviceId: string | undefined,
  names: string[],
  from?: string,
  to?: string,
  resolution = 'raw',
  maxPoints = 20_000,
) {
  return useQuery({
    queryKey: ['history', deviceId, names, from, to, resolution, maxPoints],
    enabled: Boolean(deviceId && names.length),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        device_id: deviceId ?? '',
        resolution,
        order: 'asc',
        max_points: String(maxPoints),
      })
      names.forEach((name) => params.append('name', name))
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      return apiGet<HistoryResponse>('/v1/devices/registers/history', params, signal)
    },
    staleTime: resolution === 'raw' ? 2_000 : 15_000,
    retry: false,
  })
}

export function useRegisterStats(
  deviceId: string | undefined,
  names: string[],
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: ['register-stats', deviceId, names, from, to],
    enabled: Boolean(deviceId && names.length),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ device_id: deviceId ?? '' })
      names.forEach((name) => params.append('name', name))
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      return apiGet<RegisterStatsResponse>('/v1/devices/registers/stats', params, signal)
    },
    staleTime: 10_000,
    retry: 1,
  })
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: ({ signal }) => apiGet<Array<Record<string, unknown>>>('/v1/catalog', undefined, signal),
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

export function useCatalogProfile(profile?: string) {
  return useQuery({
    queryKey: ['catalog-profile', profile],
    enabled: Boolean(profile),
    queryFn: ({ signal }) =>
      apiGet<Record<string, unknown>>(`/v1/catalog/${encodeURIComponent(profile ?? '')}`, undefined, signal),
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

export function usePollingPerformance(deviceId?: string) {
  return useQuery({
    queryKey: ['polling-performance', deviceId],
    enabled: Boolean(deviceId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ device_id: deviceId ?? '' })
      try {
        return await apiGet<PollingPerformance>('/v1/devices/polling/performance', params, signal)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    refetchInterval: visibleInterval(5_000),
    retry: false,
  })
}
