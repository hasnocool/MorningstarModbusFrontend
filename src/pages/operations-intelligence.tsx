import {
  Activity,
  BatteryCharging,
  CheckCircle2,
  Gauge,
  History,
  Radio,
  ShieldCheck,
  Sun,
  TriangleAlert,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useControllers } from '../controller-api'
import {
  useControllerChargeCycle,
  useControllerHealthScore,
  useControllerIncidents,
  useSystemBaselines,
  useSystemHealthScore,
  useSystemIncidents,
  type ChargeCycleSummary,
  type HealthScore,
  type IntelligenceIncident,
  type SolarBaseline,
} from '../intelligence-api'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatusBadge,
  SummaryStat,
} from '../components'
import { formatDuration, formatRelativeTime, formatValue } from '../lib'
import { useSystems, useSystemStream } from '../system-api'

const severityOrder: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function titleize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function NoIntelligenceSystem({ loading, error }: { loading: boolean; error: boolean }) {
  if (loading) return <LoadingState label="Loading site intelligence…" />
  if (error) return <ErrorState title="Site inventory unavailable" />
  return (
    <EmptyState title="No site is available">
      Site intelligence becomes available after MorningstarModbusAPI enrolls at least one system.
    </EmptyState>
  )
}

function ScorePanel({ score, loading }: { score?: HealthScore; loading: boolean }) {
  if (loading) return <LoadingState label="Calculating evidence-backed health score…" />
  if (!score) return <EmptyState title="Health score unavailable" />
  return (
    <div className="intelligence-score-layout">
      <div className={`intelligence-score score-${score.status}`}>
        <span>Site health</span>
        <strong>{score.score}</strong>
        <small>/ 100</small>
        <StatusBadge status={score.status} />
      </div>
      <div className="intelligence-score-components">
        {Object.entries(score.components).map(([name, value]) => (
          <div key={name}>
            <span>{titleize(name)}</span>
            <strong>{value} / 20</strong>
            <div className="score-bar" aria-label={`${titleize(name)} ${value} out of 20`}>
              <i style={{ width: `${Math.max(0, Math.min(100, value * 5))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IncidentCard({
  incident,
  controllerLabel,
}: {
  incident: IntelligenceIncident
  controllerLabel?: string
}) {
  const range =
    incident.expected_low !== null &&
    incident.expected_low !== undefined &&
    incident.expected_high !== null &&
    incident.expected_high !== undefined
      ? `${formatValue(incident.expected_low, incident.unit)} – ${formatValue(incident.expected_high, incident.unit)}`
      : null
  return (
    <article className={`incident-card incident-${incident.severity}`}>
      <div className="incident-card-head">
        <div>
          <div className="incident-badges">
            <StatusBadge status={incident.severity} />
            <StatusBadge status={incident.state === 'active' ? 'warning' : 'online'} label={incident.state} />
            <span>{incident.confidence} confidence</span>
          </div>
          <h3>{incident.title}</h3>
          <p>{incident.summary}</p>
        </div>
        {incident.state === 'resolved' ? <CheckCircle2 size={24} /> : <TriangleAlert size={24} />}
      </div>
      <div className="incident-metrics">
        <div>
          <span>Observed</span>
          <strong>{formatValue(incident.observed_value, incident.unit)}</strong>
        </div>
        <div>
          <span>Expected</span>
          <strong>{range || 'evidence rule'}</strong>
        </div>
        <div>
          <span>{incident.state === 'resolved' ? 'Resolved' : 'Opened'}</span>
          <strong>{formatRelativeTime(incident.resolved_at || incident.opened_at)}</strong>
        </div>
        <div>
          <span>Scope</span>
          <strong>{controllerLabel || incident.controller_uid || 'whole site'}</strong>
        </div>
      </div>
      {!!incident.evidence?.length && (
        <details className="incident-evidence">
          <summary>{incident.evidence.length} evidence item(s)</summary>
          <div>
            {incident.evidence.map((evidence, index) => (
              <div key={`${evidence.code || 'evidence'}-${index}`}>
                <span>{evidence.message || titleize(evidence.code || 'evidence')}</span>
                <strong>{formatValue(evidence.value, evidence.unit)}</strong>
                <small>{evidence.source || 'telemetry'}</small>
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  )
}

function IncidentList({
  incidents,
  controllerNames,
  emptyTitle,
}: {
  incidents: IntelligenceIncident[]
  controllerNames: Map<string, string>
  emptyTitle: string
}) {
  if (!incidents.length) {
    return (
      <EmptyState title={emptyTitle}>
        No incidents match this state. Findings only appear when a detector has sufficient evidence.
      </EmptyState>
    )
  }
  return (
    <div className="incident-list">
      {[...incidents]
        .sort(
          (a, b) =>
            (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) ||
            b.opened_at.localeCompare(a.opened_at),
        )
        .map((incident) => (
          <IncidentCard
            key={incident.incident_uid}
            incident={incident}
            controllerLabel={
              incident.controller_uid ? controllerNames.get(incident.controller_uid) : undefined
            }
          />
        ))}
    </div>
  )
}

function BaselinePanel({ baseline }: { baseline?: SolarBaseline }) {
  if (!baseline) return <LoadingState label="Building local baseline…" />
  const ready = baseline.status === 'ready'
  return (
    <div className="baseline-layout">
      <div className="baseline-current">
        <span>Current solar input</span>
        <strong>{formatValue(baseline.current_value, baseline.unit)}</strong>
        <StatusBadge status={ready ? 'online' : 'warning'} label={baseline.status.replace(/_/g, ' ')} />
      </div>
      <div className="baseline-band">
        <div>
          <span>P10</span>
          <strong>{formatValue(baseline.expected_low, baseline.unit)}</strong>
        </div>
        <div>
          <span>Median</span>
          <strong>{formatValue(baseline.expected_median, baseline.unit)}</strong>
        </div>
        <div>
          <span>P90</span>
          <strong>{formatValue(baseline.expected_high, baseline.unit)}</strong>
        </div>
      </div>
      <p>
        {baseline.comparable_days ?? 0} comparable prior day(s) · {baseline.confidence || 'low'} confidence ·{' '}
        {baseline.provenance || 'local history'}
      </p>
    </div>
  )
}

function ChargeCycleCard({
  cycle,
  controllerLabel,
}: {
  cycle: ChargeCycleSummary
  controllerLabel: string
}) {
  const durations = Object.entries(cycle.duration_seconds_by_state ?? {})
  return (
    <div className="charge-cycle-card">
      <div className="charge-cycle-head">
        <div>
          <span>{controllerLabel}</span>
          <strong>{cycle.transition_count ?? 0} transitions</strong>
        </div>
        <Activity size={21} />
      </div>
      <div className="charge-cycle-stats">
        <div>
          <span>Absorption entries</span>
          <strong>{cycle.absorption_entries ?? 0}</strong>
        </div>
        <div>
          <span>Float entries</span>
          <strong>{cycle.float_entries ?? 0}</strong>
        </div>
        <div>
          <span>Samples</span>
          <strong>{cycle.observed_samples ?? 0}</strong>
        </div>
      </div>
      <div className="stage-sequence">
        {(cycle.stage_sequence ?? []).length
          ? cycle.stage_sequence?.map((stage, index) => (
              <span key={`${stage}-${index}`}>{stage}</span>
            ))
          : <small>No charge-stage transitions are available.</small>}
      </div>
      {!!durations.length && (
        <div className="charge-duration-list">
          {durations.map(([stage, seconds]) => (
            <span key={stage}>{stage}: {formatDuration(seconds)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export function OperationsIntelligencePage() {
  const systems = useSystems()
  const systemUid = systems.data?.[0]?.system_uid
  const controllers = useControllers()
  const health = useSystemHealthScore(systemUid)
  const active = useSystemIncidents(systemUid, 'active', undefined, 100)
  const resolved = useSystemIncidents(systemUid, 'resolved', undefined, 20)
  const baselines = useSystemBaselines(systemUid)
  const streamState = useSystemStream(systemUid)

  if (!systemUid) {
    return <NoIntelligenceSystem loading={systems.isLoading} error={systems.isError} />
  }

  const controllerNames = new Map(
    (controllers.data ?? []).map((controller) => [
      controller.controller_uid,
      controller.model || controller.product_code || controller.profile || controller.controller_uid,
    ]),
  )
  const activeIncidents = active.data ?? []
  const critical = activeIncidents.filter((incident) => incident.severity === 'critical').length
  const warning = activeIncidents.filter((incident) => incident.severity === 'warning').length

  return (
    <div className="page intelligence-page">
      <div className="page-heading site-heading">
        <div>
          <span className="eyebrow">Proactive evidence-backed operations</span>
          <h1>Operations intelligence</h1>
          <p>
            Persistent incidents explain what changed, how serious it is, and which measurements support
            the finding. Missing evidence never counts as recovery and health scores remain decomposable.
          </p>
        </div>
        <StatusBadge
          status={streamState === 'connected' ? 'online' : 'warning'}
          label={`SSE ${streamState}`}
        />
      </div>

      {(health.isError || active.isError) && (
        <ErrorState
          title="Operations intelligence is unavailable"
          detail="MorningstarModbusAPI must include the site-intelligence endpoints from the companion API PR."
        />
      )}

      <div className="site-summary-grid">
        <SummaryStat label="Health score" value={health.data?.score ?? '—'} helper="transparent / 100" icon={<ShieldCheck size={18} />} />
        <SummaryStat label="Active incidents" value={activeIncidents.length} helper={`${critical} critical`} icon={<TriangleAlert size={18} />} />
        <SummaryStat label="Warnings" value={warning} helper="active evidence-backed warnings" icon={<Activity size={18} />} />
        <SummaryStat label="Comparable days" value={baselines.data?.solar_input_power.comparable_days ?? 0} helper="solar baseline evidence" icon={<History size={18} />} />
      </div>

      <Panel eyebrow="Decomposable score" title="Site health">
        <ScorePanel score={health.data} loading={health.isLoading} />
      </Panel>

      <Panel eyebrow="Needs attention" title="Active incidents">
        {active.isLoading ? (
          <LoadingState />
        ) : (
          <IncidentList incidents={activeIncidents} controllerNames={controllerNames} emptyTitle="No active incidents" />
        )}
      </Panel>

      <div className="site-section-grid">
        <Panel eyebrow="Offline historical baseline" title="Expected solar production">
          {baselines.isError ? (
            <ErrorState title="Baseline unavailable" />
          ) : (
            <BaselinePanel baseline={baselines.data?.solar_input_power} />
          )}
        </Panel>
        <Panel eyebrow="24-hour state machine" title="Charge-cycle intelligence">
          {baselines.isLoading ? (
            <LoadingState />
          ) : !baselines.data?.charge_cycles.length ? (
            <EmptyState title="No charge-cycle evidence" />
          ) : (
            <div className="charge-cycle-grid">
              {baselines.data.charge_cycles.map((cycle) => (
                <ChargeCycleCard
                  key={cycle.controller_uid}
                  cycle={cycle}
                  controllerLabel={controllerNames.get(cycle.controller_uid) || cycle.controller_uid}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel eyebrow="Recovered conditions" title="Recently resolved">
        {resolved.isLoading ? (
          <LoadingState />
        ) : (
          <IncidentList incidents={resolved.data ?? []} controllerNames={controllerNames} emptyTitle="No resolved incidents yet" />
        )}
      </Panel>
    </div>
  )
}

export function ControllerOperationsIntelligencePage() {
  const { controllerUid } = useParams()
  const controllers = useControllers()
  const controller = controllers.data?.find((item) => item.controller_uid === controllerUid)
  const health = useControllerHealthScore(controllerUid)
  const active = useControllerIncidents(controllerUid, 'active', 100)
  const resolved = useControllerIncidents(controllerUid, 'resolved', 20)
  const cycle = useControllerChargeCycle(controllerUid)
  const label = controller?.model || controller?.product_code || controller?.profile || controllerUid || 'Controller'
  const names = new Map(controllerUid ? [[controllerUid, label]] : [])

  if (!controllerUid || (!controller && !controllers.isLoading)) {
    return <ErrorState title="Physical controller not found" />
  }

  return (
    <div className="page intelligence-page">
      <div className="page-heading">
        <span className="eyebrow">Physical-controller operations intelligence</span>
        <h1>{label}</h1>
        <p>
          Controller-scoped incidents use immutable identity, so the timeline survives USB path, TCP
          endpoint, and current device-ID changes.
        </p>
      </div>

      <div className="site-summary-grid">
        <SummaryStat label="Health score" value={health.data?.score ?? '—'} helper="controller scope" icon={<Gauge size={18} />} />
        <SummaryStat label="Active incidents" value={active.data?.length ?? '—'} helper="current findings" icon={<TriangleAlert size={18} />} />
        <SummaryStat label="Absorption entries" value={cycle.data?.absorption_entries ?? '—'} helper="last 24 hours" icon={<BatteryCharging size={18} />} />
        <SummaryStat label="Stage transitions" value={cycle.data?.transition_count ?? '—'} helper="last 24 hours" icon={<Radio size={18} />} />
      </div>

      <Panel eyebrow="Controller score" title="Evidence categories">
        <ScorePanel score={health.data} loading={health.isLoading} />
      </Panel>

      <Panel eyebrow="Needs attention" title="Active controller incidents">
        {active.isLoading ? <LoadingState /> : <IncidentList incidents={active.data ?? []} controllerNames={names} emptyTitle="No active incidents" />}
      </Panel>

      <Panel eyebrow="Charge state" title="24-hour charge cycle">
        {cycle.isLoading ? (
          <LoadingState />
        ) : cycle.data ? (
          <ChargeCycleCard cycle={cycle.data} controllerLabel={label} />
        ) : (
          <EmptyState title="No charge-cycle evidence" />
        )}
      </Panel>

      <Panel eyebrow="History" title="Resolved controller incidents">
        {resolved.isLoading ? <LoadingState /> : <IncidentList incidents={resolved.data ?? []} controllerNames={names} emptyTitle="No resolved incidents yet" />}
      </Panel>

      <Link className="button-link" to={`/controllers/${controllerUid}/overview`}>
        Return to controller overview
      </Link>
    </div>
  )
}
