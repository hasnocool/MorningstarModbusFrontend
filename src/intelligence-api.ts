import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'

export type IncidentState = 'active' | 'resolved'
export type IncidentSeverity = 'info' | 'warning' | 'critical'

export interface IncidentEvidence {
  code?: string
  message?: string
  value?: unknown
  unit?: string | null
  source?: string
}

export interface IntelligenceIncident {
  incident_uid: string
  system_uid: string
  controller_uid?: string | null
  detector: string
  evaluation_key?: string
  category: string
  severity: IncidentSeverity
  confidence: string
  state: IncidentState
  title: string
  summary: string
  observed_value?: number | null
  expected_low?: number | null
  expected_high?: number | null
  unit?: string | null
  evidence: IncidentEvidence[]
  opened_at: string
  last_observed_at?: string
  updated_at?: string
  resolved_at?: string | null
  occurrence_count?: number
}

export interface HealthScore {
  system_uid: string
  controller_uid?: string | null
  score: number
  status: string
  components: Record<string, number>
  active_incidents: number
  penalties: Array<{
    incident_uid?: string
    category?: string
    severity?: string
    penalty?: number
    title?: string
  }>
  semantics?: string
}

export interface SolarBaseline {
  system_uid?: string
  metric?: string
  unit?: string | null
  status: string
  observed_at?: string | null
  current_value?: number | null
  expected_low?: number | null
  expected_median?: number | null
  expected_high?: number | null
  comparable_days?: number
  window_minutes?: number
  history_days?: number
  confidence?: string
  provenance?: string
}

export interface ChargeCycleSummary {
  controller_uid: string
  period_hours?: number
  observed_samples?: number
  transition_count?: number
  absorption_entries?: number
  float_entries?: number
  stage_sequence?: string[]
  duration_seconds_by_state?: Record<string, number>
}

export interface SystemBaselines {
  system_uid: string
  solar_input_power: SolarBaseline
  charge_cycles: ChargeCycleSummary[]
}

const visibleInterval = (milliseconds: number) => () =>
  document.visibilityState === 'visible' ? milliseconds : false

function systemPath(systemUid: string, suffix: string): string {
  return `/v1/systems/${encodeURIComponent(systemUid)}${suffix}`
}

function controllerPath(controllerUid: string, suffix: string): string {
  return `/v1/controllers/${encodeURIComponent(controllerUid)}${suffix}`
}

function incidentParams(state?: IncidentState, severity?: IncidentSeverity, limit = 500) {
  const params = new URLSearchParams()
  if (state) params.set('state', state)
  if (severity) params.set('severity', severity)
  params.set('limit', String(limit))
  return params
}

export function useSystemIncidents(
  systemUid?: string,
  state?: IncidentState,
  severity?: IncidentSeverity,
  limit = 500,
) {
  return useQuery({
    queryKey: ['system-incidents', systemUid, state, severity, limit],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<IntelligenceIncident[]>(
        systemPath(systemUid ?? '', '/incidents'),
        incidentParams(state, severity, limit),
        signal,
      ),
    refetchInterval: visibleInterval(30_000),
    retry: 1,
  })
}

export function useSystemHealthScore(systemUid?: string) {
  return useQuery({
    queryKey: ['system-health-score', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<HealthScore>(systemPath(systemUid ?? '', '/health-score'), undefined, signal),
    refetchInterval: visibleInterval(30_000),
    retry: 1,
  })
}

export function useSystemBaselines(systemUid?: string) {
  return useQuery({
    queryKey: ['system-baselines', systemUid],
    enabled: Boolean(systemUid),
    queryFn: ({ signal }) =>
      apiGet<SystemBaselines>(systemPath(systemUid ?? '', '/baselines'), undefined, signal),
    refetchInterval: visibleInterval(60_000),
    retry: 1,
  })
}

export function useControllerIncidents(
  controllerUid?: string,
  state?: IncidentState,
  limit = 500,
) {
  return useQuery({
    queryKey: ['controller-incidents', controllerUid, state, limit],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<IntelligenceIncident[]>(
        controllerPath(controllerUid ?? '', '/incidents'),
        incidentParams(state, undefined, limit),
        signal,
      ),
    refetchInterval: visibleInterval(30_000),
    retry: 1,
  })
}

export function useControllerHealthScore(controllerUid?: string) {
  return useQuery({
    queryKey: ['controller-health-score', controllerUid],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<HealthScore>(controllerPath(controllerUid ?? '', '/health-score'), undefined, signal),
    refetchInterval: visibleInterval(30_000),
    retry: 1,
  })
}

export function useControllerChargeCycle(controllerUid?: string) {
  return useQuery({
    queryKey: ['controller-charge-cycle', controllerUid],
    enabled: Boolean(controllerUid),
    queryFn: ({ signal }) =>
      apiGet<ChargeCycleSummary>(controllerPath(controllerUid ?? '', '/charge-cycle'), undefined, signal),
    refetchInterval: visibleInterval(60_000),
    retry: 1,
  })
}
