import { useMemo } from 'react'
import {
  Activity,
  BatteryCharging,
  CalendarRange,
  Database,
  Gauge,
  History,
  Radio,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDeviceRoute, useControllerRoute } from '../app'
import { useIntelligence, useRegisterMap } from '../api'
import {
  controllerExportUrl,
  useControllerCoverage,
  useControllerEnergyDaily,
  useControllerEnergySummary,
  useControllerGaps,
  useControllerHistory,
  useControllerHistorySummary,
  useControllerLatest,
  useControllerPollingPerformance,
} from '../controller-data'
import {
  DataFreshness,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  Panel,
  PowerFlow,
  Sparkline,
  StatusBadge,
  SummaryStat,
} from '../components'
import {
  flattenRegisterDefinitions,
  formatBytes,
  formatDuration,
  formatRelativeTime,
  formatValue,
  metric,
  rangeForPreset,
  semanticRegisterValues,
  valueOf,
} from '../lib'

function dailyRange(days: number): { from: string; to: string } {
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() + 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

function useControllerIdentity() {
  const route = useControllerRoute()
  return {
    ...route,
    label: route.controller?.model || route.controller?.product_code || route.controller?.profile || 'Controller',
  }
}

function ControllerUnavailable({ loading }: { loading: boolean }) {
  return loading ? (
    <LoadingState label="Resolving physical controller…" />
  ) : (
    <ErrorState
      title="Physical controller not found"
      detail="The immutable controller UID is no longer present in the backend inventory."
    />
  )
}

export function ControllerOverviewPage() {
  const route = useControllerIdentity()
  const latest = useControllerLatest(route.controllerUid)
  const summary = useControllerHistorySummary(route.controllerUid)
  const daily = dailyRange(30)
  const coverage = useControllerCoverage(route.controllerUid, daily.from, daily.to)
  const energy = useControllerEnergySummary(route.controllerUid, daily.from, daily.to)

  if (!route.controllerUid || !route.controller) return <ControllerUnavailable loading={route.isLoading} />

  const batteryVoltage = metric(latest.data, 'batteryVoltage')
  const batterySenseVoltage = metric(latest.data, 'batterySenseVoltage')
  const dailyChargeWh = metric(latest.data, 'dailyChargeWh')
  const outputPower = metric(latest.data, 'outputPower') ?? metric(latest.data, 'inputPower')
  const chargeCurrent = metric(latest.data, 'chargeCurrent')
  const chargeState = metric(latest.data, 'chargeState')

  return (
    <div className="page controller-native-page">
      <div className="controller-native-heading">
        <div>
          <span className="eyebrow">Physical controller · immutable identity</span>
          <h1>{route.label}</h1>
          <div className="headline-meta">
            <StatusBadge status={route.controller.status} />
            <span>{route.controller.controller_uid}</span>
            {route.controller.serial_number && <span>Serial {route.controller.serial_number}</span>}
            <span>{route.controller.connection_count} known connections</span>
          </div>
        </div>
        <div className="controller-native-provenance">
          <span>Current source</span>
          <code>{latest.data?.device_id || route.controller.current_device_id}</code>
        </div>
      </div>

      {latest.isError && (
        <ErrorState
          title="Latest controller telemetry is unavailable"
          detail="Unified historical data remains addressable by controller UID."
        />
      )}
      {latest.data && <DataFreshness sample={latest.data} />}

      <Panel eyebrow="Controller-native live view" title="Array → controller → battery">
        {latest.isLoading ? <LoadingState /> : <PowerFlow sample={latest.data} />}
      </Panel>

      <div className="metric-grid">
        <MetricCard label="Generated today" register={dailyChargeWh} accent="solar" icon={<Zap size={17} />} />
        <MetricCard label="Battery voltage" register={batteryVoltage} accent="battery" icon={<BatteryCharging size={17} />} />
        <MetricCard label="Battery sense" register={batterySenseVoltage} accent="battery" icon={<BatteryCharging size={17} />} />
        <MetricCard label="Charge current" register={chargeCurrent} accent="charge" icon={<Activity size={17} />} />
        <MetricCard label="Output power" register={outputPower} accent="solar" icon={<Zap size={17} />} />
        <MetricCard label="Charge stage" register={chargeState} icon={<Radio size={17} />} />
      </div>

      <div className="summary-grid">
        <SummaryStat
          label="30-day evidence coverage"
          value={formatValue(coverage.data?.daily_evidence?.coverage_percent, '%')}
          helper={`${coverage.data?.daily_evidence?.recovered_days ?? 0} recovered days`}
          icon={<CalendarRange size={18} />}
        />
        <SummaryStat
          label="Controller energy"
          value={formatValue(energy.data?.energy?.controller_reported_wh, 'Wh')}
          helper="30-day source-backed total when available"
          icon={<Zap size={18} />}
        />
        <SummaryStat
          label="Local integrated energy"
          value={formatValue(energy.data?.energy?.integrated_output_wh, 'Wh')}
          helper="integrated from persisted output-power observations"
          icon={<Activity size={18} />}
        />
        <SummaryStat
          label="Stored history"
          value={formatDuration(summary.data?.observed_duration_seconds)}
          helper={`${summary.data?.poll_sample_count ?? 0} poll samples`}
          icon={<Database size={18} />}
        />
      </div>
    </div>
  )
}

export function ControllerHistoryPage() {
  const route = useControllerIdentity()
  const latest = useControllerLatest(route.controllerUid)
  const registerMap = useRegisterMap(route.deviceId)
  const daily = dailyRange(30)
  const coverage = useControllerCoverage(route.controllerUid, daily.from, daily.to)
  const gaps = useControllerGaps(route.controllerUid, daily.from, daily.to)
  const range = rangeForPreset('7d')
  const battery = metric(latest.data, 'batteryVoltage')
  const history = useControllerHistory(
    route.controllerUid,
    battery?.register_name ? [battery.register_name] : [],
    range.from,
    range.to,
    '1h',
    2_000,
  )

  const values = useMemo(
    () =>
      (history.data?.series[0]?.points ?? [])
        .map((point) => {
          const candidate = point.avg ?? point.value ?? point.last
          return typeof candidate === 'number' ? candidate : null
        })
        .filter((value): value is number => value !== null),
    [history.data],
  )

  if (!route.controllerUid || !route.controller) return <ControllerUnavailable loading={route.isLoading} />

  const definitions = flattenRegisterDefinitions(registerMap.data)
  const semanticValues = semanticRegisterValues(latest.data?.values ?? [], definitions)

  return (
    <div className="page controller-native-page">
      <div className="page-heading">
        <span className="eyebrow">Unified physical-controller history</span>
        <h1>History integrity</h1>
        <p>
          History follows {route.label} across endpoint and device-ID changes. Recovered daily records are
          shown as controller evidence and are never expanded into synthetic intra-day samples.
        </p>
      </div>

      <div className="controller-coverage-grid">
        <SummaryStat
          label="Live-sample coverage"
          value={formatValue(coverage.data?.realtime?.coverage_percent, '%')}
          helper={`${coverage.data?.realtime?.days_with_samples ?? 0} days with local samples`}
          icon={<Activity size={18} />}
        />
        <SummaryStat
          label="Evidence coverage"
          value={formatValue(coverage.data?.daily_evidence?.coverage_percent, '%')}
          helper={`${coverage.data?.daily_evidence?.covered_days ?? 0} covered days`}
          icon={<History size={18} />}
        />
        <SummaryStat
          label="Recovered days"
          value={coverage.data?.daily_evidence?.recovered_days ?? '—'}
          helper="complete retained controller records"
          icon={<Database size={18} />}
        />
        <SummaryStat
          label="Missing days"
          value={coverage.data?.daily_evidence?.missing_days ?? '—'}
          helper="no defensible evidence"
          icon={<CalendarRange size={18} />}
        />
      </div>

      <Panel eyebrow="7-day controller-native trend" title="Battery voltage">
        {history.isLoading ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState title="Unified history unavailable" />
        ) : (
          <>
            <Sparkline values={values} label={`${route.label} battery voltage trend`} />
            <div className="trend-meta">
              <span>{values.length} hourly buckets</span>
              <span>{semanticValues.length} current semantic registers</span>
            </div>
          </>
        )}
      </Panel>

      <Panel eyebrow="30-day reconciliation" title="Recovered, partial, and missing intervals">
        {gaps.isLoading ? (
          <LoadingState />
        ) : gaps.isError ? (
          <ErrorState title="Gap reconciliation unavailable" />
        ) : !gaps.data?.gaps.length ? (
          <EmptyState title="No gaps detected">The selected range has continuous evidence coverage.</EmptyState>
        ) : (
          <div className="controller-gap-list">
            {gaps.data.gaps.map((gap) => (
              <div className="controller-gap-row" key={`${gap.from}-${gap.to}-${gap.status}`}>
                <StatusBadge status={gap.status} />
                <div>
                  <strong>
                    {gap.from} → {gap.to}
                  </strong>
                  <span>{gap.duration_days} day(s)</span>
                </div>
                <small>{gap.recoverability || 'unknown recoverability'}</small>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

export function ControllerEnergyPage() {
  const route = useControllerIdentity()
  const range = dailyRange(30)
  const summary = useControllerEnergySummary(route.controllerUid, range.from, range.to)
  const daily = useControllerEnergyDaily(route.controllerUid, range.from, range.to)

  if (!route.controllerUid || !route.controller) return <ControllerUnavailable loading={route.isLoading} />

  const controllerWh = summary.data?.energy?.controller_reported_wh
  const integratedWh = summary.data?.energy?.integrated_output_wh
  const difference =
    typeof controllerWh === 'number' && typeof integratedWh === 'number'
      ? controllerWh - integratedWh
      : summary.data?.energy?.discrepancy_wh
  const percent =
    summary.data?.energy?.discrepancy_percent ??
    (typeof difference === 'number' && typeof controllerWh === 'number' && controllerWh !== 0
      ? (difference / controllerWh) * 100
      : null)

  return (
    <div className="page controller-native-page">
      <div className="page-heading">
        <span className="eyebrow">Energy truth and reconciliation</span>
        <h1>Controller energy</h1>
        <p>
          Controller-retained energy and locally integrated output power remain separate evidence classes,
          making discrepancies and missing local runtime visible instead of silently blending them.
        </p>
      </div>
      <div className="controller-coverage-grid">
        <SummaryStat label="Controller reported" value={formatValue(controllerWh, 'Wh')} icon={<Gauge size={18} />} />
        <SummaryStat label="Locally integrated" value={formatValue(integratedWh, 'Wh')} icon={<Activity size={18} />} />
        <SummaryStat label="Difference" value={formatValue(difference, 'Wh')} icon={<Zap size={18} />} />
        <SummaryStat label="Difference percent" value={formatValue(percent, '%')} icon={<History size={18} />} />
      </div>
      <Panel eyebrow="Last 30 controller days" title="Daily evidence comparison">
        {daily.isLoading ? (
          <LoadingState />
        ) : daily.isError ? (
          <ErrorState title="Daily energy reconciliation unavailable" />
        ) : !daily.data?.days.length ? (
          <EmptyState title="No daily energy evidence">No controller or locally integrated energy is available.</EmptyState>
        ) : (
          <div className="controller-energy-table-wrap">
            <table className="controller-energy-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Controller</th>
                  <th>Integrated</th>
                  <th>Difference</th>
                  <th>Provenance</th>
                </tr>
              </thead>
              <tbody>
                {daily.data.days.map((day) => {
                  const reported = day.energy?.controller_reported_wh
                  const integrated = day.energy?.integrated_output_wh
                  const delta =
                    day.energy?.discrepancy_wh ??
                    (typeof reported === 'number' && typeof integrated === 'number' ? reported - integrated : null)
                  return (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td>{formatValue(reported, 'Wh')}</td>
                      <td>{formatValue(integrated, 'Wh')}</td>
                      <td>{formatValue(delta, 'Wh')}</td>
                      <td>{day.quality?.provenance?.join(', ') || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

export function ControllerDiagnosticsPage() {
  const route = useControllerIdentity()
  const polling = useControllerPollingPerformance(route.controllerUid)
  const summary = useControllerHistorySummary(route.controllerUid)
  const range = dailyRange(30)
  const coverage = useControllerCoverage(route.controllerUid, range.from, range.to)
  const deviceRoute = useDeviceRoute()
  const intelligence = useIntelligence(deviceRoute.deviceId)

  if (!route.controllerUid || !route.controller) return <ControllerUnavailable loading={route.isLoading} />

  return (
    <div className="page controller-native-page">
      <div className="page-heading">
        <span className="eyebrow">Physical-controller diagnostics</span>
        <h1>Diagnostics</h1>
        <p>
          Polling performance and history coverage are resolved across the physical controller. Current
          device intelligence remains endpoint-scoped because the backend exposes that engineering surface
          per active device connection.
        </p>
      </div>
      <div className="controller-coverage-grid">
        <SummaryStat label="Poll rate" value={formatValue(polling.data?.poll_rate_hz, 'Hz')} icon={<Activity size={18} />} />
        <SummaryStat label="p95 latency" value={formatValue(polling.data?.poll_latency_p95_ms, 'ms')} icon={<Gauge size={18} />} />
        <SummaryStat label="Success rate" value={formatValue(polling.data?.success_rate, '%')} icon={<Radio size={18} />} />
        <SummaryStat
          label="Evidence coverage"
          value={formatValue(coverage.data?.daily_evidence?.coverage_percent, '%')}
          icon={<History size={18} />}
        />
      </div>
      <div className="site-section-grid">
        <Panel eyebrow="Persistence" title="Unified history summary">
          <div className="controller-detail-list">
            <div><span>Samples</span><strong>{summary.data?.poll_sample_count ?? '—'}</strong></div>
            <div><span>Register observations</span><strong>{summary.data?.register_observation_count ?? '—'}</strong></div>
            <div><span>Errors</span><strong>{summary.data?.error_count ?? '—'}</strong></div>
            <div><span>Database</span><strong>{formatBytes(summary.data?.database_bytes)}</strong></div>
          </div>
        </Panel>
        <Panel eyebrow="Current connection" title="Device intelligence seam">
          {intelligence.isLoading ? (
            <LoadingState />
          ) : intelligence.isError ? (
            <ErrorState title="Current device intelligence unavailable" />
          ) : (
            <div className="controller-detail-list">
              <div><span>Profile</span><strong>{intelligence.data?.profile || route.controller.profile}</strong></div>
              <div><span>Model</span><strong>{intelligence.data?.model || route.controller.model || '—'}</strong></div>
              <div><span>Firmware</span><strong>{intelligence.data?.firmware || route.controller.firmware || '—'}</strong></div>
              <div><span>Confidence</span><strong>{formatValue(intelligence.data?.confidence, '%')}</strong></div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

export function ControllerDataPage() {
  const route = useControllerIdentity()
  const range = rangeForPreset('30d')

  if (!route.controllerUid || !route.controller) return <ControllerUnavailable loading={route.isLoading} />

  const csv = controllerExportUrl(route.controllerUid, 'csv', range.from, range.to, '1h')
  const jsonl = controllerExportUrl(route.controllerUid, 'jsonl', range.from, range.to, 'raw')

  return (
    <div className="page controller-native-page">
      <div className="page-heading">
        <span className="eyebrow">Controller-scoped provenance export</span>
        <h1>Data export</h1>
        <p>
          Exports span every historical device ID belonging to this physical controller. Raw exports retain
          source_device_id so endpoint changes never erase provenance.
        </p>
      </div>
      <Panel eyebrow="Streaming export" title="Last 30 days">
        <div className="controller-export-grid">
          <a className="primary-button" href={csv}>
            Download hourly CSV
          </a>
          <a className="secondary-button" href={jsonl}>
            Download raw JSONL
          </a>
        </div>
        <div className="controller-export-note">
          <Database size={18} />
          <div>
            <strong>{route.controller.controller_uid}</strong>
            <span>
              {route.controller.history_device_ids?.length ?? route.controller.connection_count} historical
              source ID(s) included by backend scope resolution.
            </span>
          </div>
        </div>
      </Panel>
      <Panel eyebrow="Engineering views" title="Connection-specific evidence">
        <p className="muted">
          Register-map, firmware validation, and device-intelligence metadata still describe the active device
          connection. Those views remain available without weakening the controller-native history model.
        </p>
        <div className="controller-export-grid">
          <Link className="secondary-button" to={`/controllers/${route.controllerUid}/registers`}>Open registers</Link>
          <Link className="secondary-button" to={`/controllers/${route.controllerUid}/intelligence`}>Open intelligence</Link>
        </div>
      </Panel>
    </div>
  )
}
