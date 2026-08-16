import { useMemo, useState } from 'react'
import {
  Activity,
  BatteryCharging,
  Boxes,
  Cable,
  History,
  Network,
  Sun,
  Zap,
} from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  Sparkline,
  StatusBadge,
  SummaryStat,
} from '../components'
import { formatRelativeTime, formatValue, rangeForPreset } from '../lib'
import {
  exactKwhFromWh,
  hasMetricValue,
  metricAvailability,
  metricPresentationLabel,
  metricPresentationReason,
} from '../metric-presentation'
import {
  useSystemComponentGraph,
  useSystemEnergy,
  useSystemEnergyLedger,
  useSystemEvents,
  useSystemHealth,
  useSystemHistory,
  useSystemLatest,
  useSystemMetricCatalog,
  useSystemPowerFlow,
  useSystems,
  useSystemStream,
  useSystemTopology,
  type SystemMetricReading,
} from '../system-api'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asReading(value: unknown): SystemMetricReading | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  if (!('value' in record) && !('status' in record)) return undefined
  return record as SystemMetricReading
}

function readingEntries(value: unknown): Array<[string, SystemMetricReading]> {
  const record = asRecord(value)
  if (!record) return []
  return Object.entries(record)
    .map(([key, item]) => [key, asReading(item)] as const)
    .filter((item): item is [string, SystemMetricReading] => Boolean(item[1]))
}

function titleize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function readingText(reading?: SystemMetricReading, fallbackUnit?: string): string {
  return formatValue(reading?.value, reading?.unit ?? fallbackUnit)
}

function qualityLabel(reading?: SystemMetricReading): string {
  return reading?.quality || reading?.status || 'unknown'
}

function unavailableValueLabel(reading?: SystemMetricReading): string {
  switch (metricAvailability(reading)) {
    case 'unsupported':
      return 'Not supported'
    case 'conflict':
      return 'Conflict'
    case 'unavailable':
      return 'Unavailable'
    case 'available':
      return readingText(reading)
  }
}

function readingFormula(reading?: SystemMetricReading): string | undefined {
  return typeof reading?.formula === 'string' && reading.formula ? reading.formula : undefined
}

function useDefaultSystemUid(): {
  systemUid?: string
  isLoading: boolean
  isError: boolean
  count: number
} {
  const systems = useSystems()
  return {
    systemUid: systems.data?.[0]?.system_uid,
    isLoading: systems.isLoading,
    isError: systems.isError,
    count: systems.data?.length ?? 0,
  }
}

function NoSystemState({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  if (isLoading) return <LoadingState label="Loading site inventory…" />
  if (isError) return <ErrorState title="Site inventory unavailable" />
  return (
    <EmptyState title="No site is configured">
      Start MorningstarModbusAPI v0.6+ with system aggregation enabled. The default site will appear
      automatically when controllers are enrolled.
    </EmptyState>
  )
}

function MetricTile({
  label,
  reading,
  icon,
}: {
  label: string
  reading?: SystemMetricReading
  icon?: React.ReactNode
}) {
  return (
    <div className="site-metric-tile">
      <div className="site-metric-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{readingText(reading)}</strong>
      <div className="site-metric-foot">
        <StatusBadge status={qualityLabel(reading)} />
        {reading?.contributors !== undefined && (
          <span>
            {reading.contributors}/{reading.expected_contributors ?? reading.contributors} sources
          </span>
        )}
      </div>
    </div>
  )
}

function ReadingItem({ name, reading }: { name: string; reading: SystemMetricReading }) {
  const available = metricAvailability(reading) === 'available'
  const reason = metricPresentationReason(reading)
  const formula = readingFormula(reading)
  return (
    <div className="site-reading" key={name}>
      <span>{titleize(name)}</span>
      <strong>{available ? readingText(reading) : unavailableValueLabel(reading)}</strong>
      <small>
        {reading.source_metric ? `${reading.source_metric} · ` : ''}
        {metricPresentationLabel(reading)}
      </small>
      {formula && <small>Formula: {formula}</small>}
      {!available && reason && <small>{reason}</small>}
    </div>
  )
}

function ReadingGrid({ value }: { value: unknown }) {
  const entries = readingEntries(value)
  if (!entries.length) {
    return <div className="muted">No metric definitions are available for this section.</div>
  }

  const available = entries.filter(([, reading]) => metricAvailability(reading) === 'available')
  const unavailable = entries.filter(([, reading]) => metricAvailability(reading) !== 'available')

  return (
    <>
      {available.length ? (
        <div className="site-reading-grid">
          {available.map(([name, reading]) => (
            <ReadingItem key={name} name={name} reading={reading} />
          ))}
        </div>
      ) : (
        <div className="muted">No currently observed values are available in this section.</div>
      )}

      {unavailable.length > 0 && (
        <details open={!available.length}>
          <summary>
            {unavailable.length} additional measurement{unavailable.length === 1 ? '' : 's'} unavailable with current evidence
          </summary>
          <div className="site-reading-grid">
            {unavailable.map(([name, reading]) => (
              <ReadingItem key={name} name={name} reading={reading} />
            ))}
          </div>
        </details>
      )}
    </>
  )
}

export function SiteOverviewPage() {
  const system = useDefaultSystemUid()
  const latest = useSystemLatest(system.systemUid)
  const energy = useSystemEnergy(system.systemUid)
  const health = useSystemHealth(system.systemUid)
  const streamState = useSystemStream(system.systemUid)

  if (!system.systemUid) return <NoSystemState isLoading={system.isLoading} isError={system.isError} />

  const metrics = latest.data?.metrics ?? {}
  const energyMetrics = energy.data?.metrics ?? {}
  const solar = metrics.solar_input_power_w
  const output = metrics.charge_output_power_w
  const voltage = metrics.battery_voltage_v
  const current = metrics.battery_charge_current_a
  const state = metrics.charge_state
  const dailyEnergy = energyMetrics.daily_charge_wh ?? metrics.daily_charge_wh
  const primaryNames = new Set([
    'solar_input_power_w',
    'charge_output_power_w',
    'battery_voltage_v',
    'battery_charge_current_a',
  ])
  const additionalMetrics = Object.fromEntries(
    Object.entries(metrics).filter(([name]) => !primaryNames.has(name)),
  )

  return (
    <div className="page site-page">
      <div className="page-heading site-heading">
        <div>
          <span className="eyebrow">Controller-native site operations</span>
          <h1>Site overview</h1>
          <p>
            Normalized measurements are aggregated by the backend across immutable physical-controller
            identities. Quality and contributor counts remain visible instead of being hidden by the UI.
          </p>
        </div>
        <div className="site-heading-status">
          <StatusBadge status={health.data?.status || (health.isError ? 'offline' : 'checking')} />
          <StatusBadge
            status={streamState === 'connected' ? 'online' : streamState === 'reconnecting' ? 'warning' : 'checking'}
            label={`SSE ${streamState}`}
          />
        </div>
      </div>

      {latest.isError && <ErrorState title="Live site telemetry is unavailable" />}

      <div className="site-summary-grid">
        <SummaryStat
          label="Controllers"
          value={health.data?.controller_count ?? '—'}
          helper={`${health.data?.online_controllers ?? '—'} online`}
          icon={<Boxes size={18} />}
        />
        <SummaryStat
          label="Generated today"
          value={readingText(dailyEnergy)}
          helper="normalized daily energy"
          icon={<Sun size={18} />}
        />
        <SummaryStat
          label="Active faults"
          value={health.data?.active_fault_controllers ?? '—'}
          helper={`${health.data?.active_alarm_controllers ?? '—'} controllers with alarms`}
          icon={<Activity size={18} />}
        />
        <SummaryStat
          label="Live transport"
          value={streamState}
          helper="SSE with query polling fallback"
          icon={<Network size={18} />}
        />
      </div>

      <Panel eyebrow="Live site power" title="Solar → controllers → battery">
        {latest.isLoading ? (
          <LoadingState />
        ) : (
          <div className="site-flow" aria-label="Normalized site power flow">
            <div className="site-flow-node site-flow-solar">
              <Sun size={28} />
              <span>Solar input</span>
              <strong>{readingText(solar)}</strong>
              <small>{qualityLabel(solar)}</small>
            </div>
            <div className="site-flow-link">
              <Zap size={20} />
              <span>{readingText(output)}</span>
            </div>
            <div className="site-flow-node">
              <Boxes size={28} />
              <span>Morningstar controllers</span>
              <strong>{health.data?.controller_count ?? '—'}</strong>
              <small>{readingText(state)}</small>
            </div>
            <div className="site-flow-link">
              <Cable size={20} />
              <span>{readingText(current)}</span>
            </div>
            <div className="site-flow-node site-flow-battery">
              <BatteryCharging size={28} />
              <span>Battery bus</span>
              <strong>{readingText(voltage)}</strong>
              <small>{qualityLabel(voltage)}</small>
            </div>
          </div>
        )}
      </Panel>

      <div className="site-metric-grid">
        <MetricTile label="Solar input power" reading={solar} icon={<Sun size={17} />} />
        <MetricTile label="Charge output power" reading={output} icon={<Zap size={17} />} />
        <MetricTile label="Battery voltage" reading={voltage} icon={<BatteryCharging size={17} />} />
        <MetricTile label="Controller charge current" reading={current} icon={<Activity size={17} />} />
      </div>

      <Panel eyebrow="Normalized evidence" title="Additional site metrics">
        {latest.isLoading ? <LoadingState /> : <ReadingGrid value={additionalMetrics} />}
      </Panel>
    </div>
  )
}

export function SitePowerFlowPage() {
  const system = useDefaultSystemUid()
  const power = useSystemPowerFlow(system.systemUid)
  const streamState = useSystemStream(system.systemUid)

  if (!system.systemUid) return <NoSystemState isLoading={system.isLoading} isError={system.isError} />

  const data = power.data ?? {}
  const sources = asRecord(data.sources)
  const solarInput = asReading(sources?.solar_input_power_w)
  const solarSourceRows = Array.isArray(solarInput?.sources) ? solarInput.sources : []
  const estimatedSolarInput = solarSourceRows.some(
    (source) => asRecord(source)?.register_name === 'input_power_reported',
  )

  return (
    <div className="page site-page">
      <div className="page-heading site-heading">
        <div>
          <span className="eyebrow">Evidence-aware electrical model</span>
          <h1>Power flow</h1>
          <p>
            Authoritative whole-system measurements are preferred when available. Derived values retain
            backend quality, source, and conflict semantics. Unsupported hardware is described rather than
            displayed as broken telemetry.
          </p>
        </div>
        <StatusBadge status={streamState === 'connected' ? 'online' : 'warning'} label={`SSE ${streamState}`} />
      </div>
      {power.isLoading && <LoadingState />}
      {power.isError && <ErrorState title="Power-flow model unavailable" />}
      <div className="site-section-grid">
        <Panel eyebrow="Battery" title="Battery bus">
          <ReadingGrid value={data.battery} />
        </Panel>
        <Panel eyebrow="Loads" title="DC load path">
          <ReadingGrid value={data.loads} />
        </Panel>
        <Panel eyebrow="Balance" title="System balance and residuals">
          <ReadingGrid value={data.balance} />
          {estimatedSolarInput && (
            <p className="muted">
              Controller conversion efficiency uses the TriStar controller-reported PV input-power estimate.
              Morningstar documents that input estimate as lower precision than battery-side output power, so
              values near 100% should be treated as approximate rather than precision efficiency measurements.
            </p>
          )}
        </Panel>
        <Panel eyebrow="Solar" title="Generation path">
          <ReadingGrid value={data.sources ?? data.solar ?? data.generation ?? data.controllers} />
        </Panel>
      </div>
    </div>
  )
}

export function SiteEnergyPage() {
  const system = useDefaultSystemUid()
  const energy = useSystemEnergy(system.systemUid)
  const ledger = useSystemEnergyLedger(system.systemUid)

  if (!system.systemUid) return <NoSystemState isLoading={system.isLoading} isError={system.isError} />

  const ledgerRecord = ledger.data ?? {}
  const normalizedRecord = asRecord(energy.data?.metrics) ?? {}
  const dailyWh = asReading(normalizedRecord.daily_charge_wh)
  const exactDailyKwh = exactKwhFromWh(dailyWh)
  const normalizedDisplay = exactDailyKwh
    ? { ...normalizedRecord, daily_charge_kwh: exactDailyKwh }
    : normalizedRecord
  const counterRecord = asRecord(ledgerRecord.counters) ?? {}
  const nativeDailyKwh = asReading(counterRecord.daily_charge_kwh)
  const counterDisplay =
    exactDailyKwh && !hasMetricValue(nativeDailyKwh)
      ? { ...counterRecord, daily_charge_kwh: exactDailyKwh }
      : counterRecord

  return (
    <div className="page site-page">
      <div className="page-heading">
        <span className="eyebrow">Source-backed accounting</span>
        <h1>Energy ledger</h1>
        <p>
          Wh, kWh, and Ah remain distinct evidence classes. Exact unit conversions are labeled derived;
          unsupported discharge, load, generator, or loss estimates remain unavailable with the backend reason
          shown instead of being presented as unexplained empty values.
        </p>
      </div>
      {(energy.isError || ledger.isError) && <ErrorState title="Some energy accounting is unavailable" />}
      <Panel eyebrow="Normalized counters" title="Site energy">
        {energy.isLoading ? <LoadingState /> : <ReadingGrid value={normalizedDisplay} />}
      </Panel>
      <div className="site-section-grid">
        <Panel eyebrow="Flows" title="Energy flows">
          {ledger.isLoading ? <LoadingState /> : <ReadingGrid value={ledgerRecord.flows} />}
        </Panel>
        <Panel eyebrow="Counters" title="Counters & exact unit views">
          {ledger.isLoading ? <LoadingState /> : <ReadingGrid value={counterDisplay} />}
        </Panel>
      </div>
    </div>
  )
}

export function SiteHistoryPage() {
  const system = useDefaultSystemUid()
  const catalog = useSystemMetricCatalog()
  const [metricName, setMetricName] = useState('battery_charge_current_a')
  const [preset, setPreset] = useState('7d')
  const range = rangeForPreset(preset)
  const history = useSystemHistory(
    system.systemUid,
    metricName,
    range.from,
    range.to,
    range.resolution,
    10_000,
  )

  const values = useMemo(
    () =>
      (history.data?.points ?? [])
        .map((point) => {
          const value = point.avg ?? point.value ?? point.last
          return typeof value === 'number' ? value : null
        })
        .filter((value): value is number => value !== null),
    [history.data],
  )

  if (!system.systemUid) return <NoSystemState isLoading={system.isLoading} isError={system.isError} />

  const definitions = catalog.data ?? []
  return (
    <div className="page site-page">
      <div className="page-heading">
        <span className="eyebrow">Normalized cross-controller history</span>
        <h1>Site history</h1>
        <p>
          System history uses normalized metric names instead of vendor-specific registers and retains
          source/contributor quality in each backend bucket.
        </p>
      </div>
      <div className="site-toolbar">
        <label>
          Metric
          <select value={metricName} onChange={(event) => setMetricName(event.target.value)}>
            {(definitions.length
              ? definitions
              : [
                  { name: 'battery_charge_current_a' },
                  { name: 'battery_voltage_v' },
                  { name: 'solar_input_power_w' },
                  { name: 'charge_output_power_w' },
                  { name: 'daily_charge_wh' },
                ]
            ).map((definition) => (
              <option key={definition.name} value={definition.name}>
                {titleize(definition.name || 'metric')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Range
          <select value={preset} onChange={(event) => setPreset(event.target.value)}>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
        </label>
      </div>
      <Panel
        eyebrow={history.data?.metric?.aggregation ? `Aggregation: ${history.data.metric.aggregation}` : 'History'}
        title={titleize(metricName)}
      >
        {history.isLoading ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState title="System history unavailable" detail="Try a shorter range or coarser resolution." />
        ) : (
          <>
            <Sparkline values={values} label={`${titleize(metricName)} site trend`} />
            <div className="trend-meta">
              <span>{values.length} plotted buckets</span>
              <span>{history.data?.resolution || range.resolution}</span>
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}

export function SiteEventsPage() {
  const system = useDefaultSystemUid()
  const events = useSystemEvents(system.systemUid, undefined, undefined, 250)
  useSystemStream(system.systemUid)

  if (!system.systemUid) return <NoSystemState isLoading={system.isLoading} isError={system.isError} />

  return (
    <div className="page site-page">
      <div className="page-heading">
        <span className="eyebrow">Unified evidence timeline</span>
        <h1>Events</h1>
        <p>
          Communication errors, charge-state transitions, fault/alarm changes, retained-history activity,
          and supported inbound events stay attributable to their physical controller and source.
        </p>
      </div>
      <Panel eyebrow="Newest first" title="System event timeline">
        {events.isLoading ? (
          <LoadingState />
        ) : events.isError ? (
          <ErrorState title="Event timeline unavailable" />
        ) : !events.data?.length ? (
          <EmptyState title="No site events recorded">The backend has no events in the selected timeline.</EmptyState>
        ) : (
          <div className="site-event-list">
            {events.data.map((event, index) => (
              <article className="site-event" key={String(event.id ?? `${event.observed_at}-${index}`)}>
                <div>
                  <StatusBadge status={event.severity || event.event_type || 'event'} />
                  <strong>{titleize(event.event_type || 'system event')}</strong>
                </div>
                <p>{event.message || 'Backend event evidence recorded.'}</p>
                <small>
                  {event.controller_uid ? `${event.controller_uid} · ` : ''}
                  {formatRelativeTime(event.observed_at)}
                </small>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : []
}

export function SiteTopologyPage() {
  const system = useDefaultSystemUid()
  const topology = useSystemTopology(system.systemUid)
  const graph = useSystemComponentGraph(system.systemUid)

  if (!system.systemUid) return <NoSystemState isLoading={system.isLoading} isError={system.isError} />

  const topologyRecord = topology.data ?? {}
  const graphRecord = graph.data ?? {}
  const bridges = recordArray(topologyRecord.bridge_candidates)
  const components = recordArray(graphRecord.components)
  const relationships = recordArray(graphRecord.relationships)

  return (
    <div className="page site-page">
      <div className="page-heading">
        <span className="eyebrow">Component graph + transport evidence</span>
        <h1>Topology</h1>
        <p>
          Transport relationships and inferred electrical relationships are shown as evidence, not as
          proof of physical wiring. Confidence remains visible for every inferred relationship.
        </p>
      </div>
      {(topology.isError || graph.isError) && <ErrorState title="Some topology evidence is unavailable" />}
      <div className="site-summary-grid">
        <SummaryStat label="Components" value={components.length} icon={<Boxes size={18} />} />
        <SummaryStat label="Relationships" value={relationships.length} icon={<Network size={18} />} />
        <SummaryStat label="Bridge candidates" value={bridges.length} icon={<Cable size={18} />} />
        <SummaryStat label="System" value={system.systemUid} icon={<History size={18} />} />
      </div>
      <div className="site-section-grid">
        <Panel eyebrow="Electrical model" title="Components">
          {!components.length ? (
            <div className="muted">No component graph nodes are available.</div>
          ) : (
            <div className="site-entity-list">
              {components.map((component, index) => (
                <div className="site-entity" key={String(component.component_uid ?? component.id ?? index)}>
                  <strong>{String(component.name ?? component.component_type ?? component.type ?? 'Component')}</strong>
                  <span>{String(component.component_type ?? component.type ?? 'unknown')}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel eyebrow="Typed edges" title="Relationships">
          {!relationships.length ? (
            <div className="muted">No component relationships are available.</div>
          ) : (
            <div className="site-entity-list">
              {relationships.map((relationship, index) => (
                <div className="site-entity" key={String(relationship.relationship_uid ?? relationship.id ?? index)}>
                  <strong>{String(relationship.relationship_type ?? relationship.type ?? 'Relationship')}</strong>
                  <span>
                    {String(relationship.source ?? relationship.source_uid ?? '?')} →{' '}
                    {String(relationship.target ?? relationship.target_uid ?? '?')}
                  </span>
                  <small>{String(relationship.confidence ?? 'unknown confidence')}</small>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <Panel eyebrow="Transport topology" title="Bridge candidates">
        {!bridges.length ? (
          <div className="muted">No shared-endpoint bridge candidates are currently inferred.</div>
        ) : (
          <div className="site-entity-list">
            {bridges.map((bridge, index) => (
              <div className="site-entity" key={String(bridge.id ?? index)}>
                <strong>{titleize(String(bridge.type ?? bridge.kind ?? 'bridge candidate'))}</strong>
                <StatusBadge status={String(bridge.confidence ?? 'inferred')} />
                <small>{recordArray(bridge.controllers).length} controllers</small>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
