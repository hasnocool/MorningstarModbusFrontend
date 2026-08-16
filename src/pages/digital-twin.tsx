import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BatteryCharging,
  Boxes,
  Cable,
  CircleDot,
  Gauge,
  Network,
  Search,
  Sun,
  Zap,
} from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatusBadge,
  SummaryStat,
} from '../components'
import { useControllers } from '../controller-api'
import { useSystemIncidents, type IntelligenceIncident } from '../intelligence-api'
import { formatRelativeTime, formatValue } from '../lib'
import {
  useSystemComponentGraph,
  useSystemEvents,
  useSystemHistory,
  useSystemLatest,
  useSystemPowerFlow,
  useSystems,
  useSystemStream,
  type SystemEvent,
  type SystemHistory,
  type SystemMetricReading,
} from '../system-api'

type AnyRecord = Record<string, unknown>

type GraphComponent = AnyRecord & {
  component_uid?: string
  type?: string
  name?: string
  controller_uid?: string
  model?: string
  profile?: string
  status?: string
  source?: string
  confidence?: string
}

type GraphRelationship = AnyRecord & {
  from?: string
  to?: string
  type?: string
  source?: string
  confidence?: string
}

type InvestigationWindow = {
  from: string
  to: string
  label: string
}

const NODE_WIDTH = 190
const NODE_HEIGHT = 76
const COLUMN_X = [70, 330, 590, 850]
const ROW_GAP = 112

function asRecord(value: unknown): AnyRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : undefined
}

function recordArray(value: unknown): AnyRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is AnyRecord => Boolean(item))
    : []
}

function graphComponents(value: unknown): GraphComponent[] {
  return recordArray(asRecord(value)?.components) as GraphComponent[]
}

function graphRelationships(value: unknown): GraphRelationship[] {
  return recordArray(asRecord(value)?.relationships) as GraphRelationship[]
}

function componentId(component: GraphComponent): string {
  return String(component.component_uid ?? component.controller_uid ?? component.name ?? 'component')
}

function componentLabel(component: GraphComponent): string {
  return String(
    component.name ??
      component.model ??
      component.product_type ??
      component.profile ??
      component.component_uid ??
      'Component',
  )
}

function componentType(component: GraphComponent): string {
  return String(component.type ?? 'component')
}

function titleize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function componentColumn(component: GraphComponent): number {
  switch (componentType(component)) {
    case 'gateway':
    case 'connected_product':
      return 0
    case 'charge_controller':
    case 'controller':
      return 1
    case 'battery_bus':
      return 2
    case 'system':
      return 3
    default:
      return 0
  }
}

function componentControllerUid(component?: GraphComponent): string | undefined {
  if (!component) return undefined
  if (typeof component.controller_uid === 'string' && component.controller_uid) {
    return component.controller_uid
  }
  const type = componentType(component)
  if (type === 'charge_controller' || type === 'controller' || type === 'gateway') {
    return componentId(component)
  }
  return undefined
}

function severityRank(value?: string): number {
  if (value === 'critical') return 3
  if (value === 'warning') return 2
  if (value === 'info') return 1
  return 0
}

function componentSeverity(component: GraphComponent, incidents: IntelligenceIncident[]): string | undefined {
  const controllerUid = componentControllerUid(component)
  if (!controllerUid) return undefined
  return incidents
    .filter((incident) => incident.controller_uid === controllerUid)
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0]?.severity
}

function readingText(reading?: SystemMetricReading): string {
  return formatValue(reading?.value, reading?.unit)
}

function metricFrom(record: unknown, path: string[]): SystemMetricReading | undefined {
  let current: unknown = record
  for (const key of path) current = asRecord(current)?.[key]
  return asRecord(current) as SystemMetricReading | undefined
}

function powerStatus(reading?: SystemMetricReading): string {
  return String(reading?.status ?? reading?.quality ?? 'unknown')
}

function presetWindow(hours: number, label: string): InvestigationWindow {
  const to = new Date()
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString(), label }
}

function incidentWindow(incident: IntelligenceIncident): InvestigationWindow {
  const start = new Date(incident.opened_at).getTime()
  const endValue = incident.resolved_at || incident.last_observed_at || incident.updated_at || incident.opened_at
  const end = new Date(endValue).getTime()
  return {
    from: new Date(start - 60 * 60 * 1000).toISOString(),
    to: new Date(Math.max(start, end) + 60 * 60 * 1000).toISOString(),
    label: `Incident · ${incident.title}`,
  }
}

function historyPoints(history?: SystemHistory): Array<[string, number]> {
  return (history?.points ?? []).flatMap((point) => {
    const timestamp = point.bucket_start ?? point.observed_at
    const value = point.avg ?? point.value ?? point.last
    return timestamp && typeof value === 'number' ? [[timestamp, value] as [string, number]] : []
  })
}

function windowResolution(window: InvestigationWindow): string {
  const durationHours = (new Date(window.to).getTime() - new Date(window.from).getTime()) / 3_600_000
  if (durationHours <= 8) return '5m'
  if (durationHours <= 48) return '15m'
  return '1h'
}

function InvestigationChart({
  solar,
  output,
  voltage,
  current,
  events,
  incidents,
}: {
  solar?: SystemHistory
  output?: SystemHistory
  voltage?: SystemHistory
  current?: SystemHistory
  events: SystemEvent[]
  incidents: IntelligenceIncident[]
}) {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    let chart: import('echarts').ECharts | undefined
    let disposed = false

    void import('echarts').then((echarts) => {
      if (disposed || !elementRef.current) return
      chart = echarts.init(elementRef.current)
      const annotations = [
        ...events.slice(-12).map((event) => ({
          time: event.observed_at,
          label: titleize(event.event_type || 'event'),
        })),
        ...incidents.slice(-8).map((incident) => ({
          time: incident.opened_at,
          label: incident.title,
        })),
      ].filter((item): item is { time: string; label: string } => Boolean(item.time))

      chart.setOption({
        animation: false,
        tooltip: { trigger: 'axis' },
        legend: { data: ['Solar input', 'Charge output', 'Battery voltage', 'Charge current'] },
        grid: { left: 58, right: 58, top: 62, bottom: 54 },
        xAxis: { type: 'time' },
        yAxis: [
          { type: 'value', name: 'Power (W)', scale: true },
          { type: 'value', name: 'Voltage / current', scale: true },
        ],
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18 }],
        series: [
          {
            name: 'Solar input',
            type: 'line',
            showSymbol: false,
            data: historyPoints(solar),
            markLine: {
              symbol: ['none', 'none'],
              silent: true,
              label: { formatter: '{b}' },
              data: annotations.map((item) => ({ name: item.label, xAxis: item.time })),
            },
          },
          {
            name: 'Charge output',
            type: 'line',
            showSymbol: false,
            data: historyPoints(output),
          },
          {
            name: 'Battery voltage',
            type: 'line',
            yAxisIndex: 1,
            showSymbol: false,
            data: historyPoints(voltage),
          },
          {
            name: 'Charge current',
            type: 'line',
            yAxisIndex: 1,
            showSymbol: false,
            data: historyPoints(current),
          },
        ],
      })

      const resize = () => chart?.resize()
      window.addEventListener('resize', resize)
      ;(chart as import('echarts').ECharts & { __cleanup?: () => void }).__cleanup = () =>
        window.removeEventListener('resize', resize)
    })

    return () => {
      disposed = true
      const cleanup = (chart as (import('echarts').ECharts & { __cleanup?: () => void }) | undefined)
        ?.__cleanup
      cleanup?.()
      chart?.dispose()
    }
  }, [current, events, incidents, output, solar, voltage])

  return <div ref={elementRef} className="digital-twin-chart" aria-label="Synchronized site investigation chart" />
}

function GraphCanvas({
  components,
  relationships,
  incidents,
  selectedId,
  onSelect,
}: {
  components: GraphComponent[]
  relationships: GraphRelationship[]
  incidents: IntelligenceIncident[]
  selectedId?: string
  onSelect: (component: GraphComponent) => void
}) {
  const positions = useMemo(() => {
    const counts = [0, 0, 0, 0]
    return new Map(
      components.map((component) => {
        const column = componentColumn(component)
        const row = counts[column]++
        return [
          componentId(component),
          { x: COLUMN_X[column], y: 54 + row * ROW_GAP, column, row },
        ] as const
      }),
    )
  }, [components])

  const maxRows = Math.max(
    1,
    ...[0, 1, 2, 3].map((column) =>
      components.filter((component) => componentColumn(component) === column).length,
    ),
  )
  const height = Math.max(360, maxRows * ROW_GAP + 100)

  return (
    <div className="digital-twin-canvas-wrap">
      <svg
        className="digital-twin-canvas"
        viewBox={`0 0 1120 ${height}`}
        role="img"
        aria-label="Evidence-aware site component graph"
      >
        <defs>
          <marker id="twin-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" />
          </marker>
        </defs>
        <g className="twin-column-labels" aria-hidden="true">
          <text x="70" y="28">CONNECTED / GATEWAY</text>
          <text x="330" y="28">CONTROLLERS</text>
          <text x="590" y="28">BATTERY BUS</text>
          <text x="850" y="28">SITE CONTEXT</text>
        </g>
        <g className="twin-relationships">
          {relationships.map((relationship, index) => {
            const from = relationship.from ? positions.get(relationship.from) : undefined
            const to = relationship.to ? positions.get(relationship.to) : undefined
            if (!from || !to) return null
            const x1 = from.x + NODE_WIDTH
            const y1 = from.y + NODE_HEIGHT / 2
            const x2 = to.x
            const y2 = to.y + NODE_HEIGHT / 2
            const middle = (x1 + x2) / 2
            return (
              <g key={`${relationship.from}-${relationship.to}-${relationship.type}-${index}`}>
                <path
                  d={`M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`}
                  markerEnd="url(#twin-arrow)"
                  className={`twin-edge confidence-${String(relationship.confidence || 'unknown')}`}
                />
                <text x={middle} y={(y1 + y2) / 2 - 6} className="twin-edge-label">
                  {titleize(String(relationship.type || 'related'))}
                </text>
              </g>
            )
          })}
        </g>
        <g className="twin-components">
          {components.map((component) => {
            const id = componentId(component)
            const position = positions.get(id)
            if (!position) return null
            const severity = componentSeverity(component, incidents)
            const controllerUid = componentControllerUid(component)
            const active = selectedId === id
            const activate = () => onSelect(component)
            return (
              <g
                key={id}
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${componentLabel(component)}`}
                aria-pressed={active}
                transform={`translate(${position.x} ${position.y})`}
                className={`twin-node type-${componentType(component)} ${active ? 'selected' : ''} ${severity ? `severity-${severity}` : ''}`}
                onClick={activate}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    activate()
                  }
                }}
              >
                <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" />
                <circle cx="19" cy="20" r="6" className="twin-node-dot" />
                <text x="33" y="24" className="twin-node-name">
                  {componentLabel(component).slice(0, 24)}
                </text>
                <text x="18" y="46" className="twin-node-type">
                  {titleize(componentType(component)).slice(0, 28)}
                </text>
                <text x="18" y="63" className="twin-node-evidence">
                  {String(component.confidence ?? component.status ?? 'evidence')}
                </text>
                {controllerUid && severity && (
                  <text x="172" y="63" textAnchor="end" className="twin-node-alert">
                    {severity.toUpperCase()}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

function Inspector({
  selected,
  relationships,
  incidents,
  events,
}: {
  selected?: GraphComponent
  relationships: GraphRelationship[]
  incidents: IntelligenceIncident[]
  events: SystemEvent[]
}) {
  if (!selected) {
    return (
      <EmptyState title="Select a component">
        Click any node in the digital twin to inspect its source, confidence, relationships, incidents,
        and recent events.
      </EmptyState>
    )
  }

  const id = componentId(selected)
  const controllerUid = componentControllerUid(selected)
  const related = relationships.filter((relationship) => relationship.from === id || relationship.to === id)
  const scopedIncidents = controllerUid
    ? incidents.filter((incident) => incident.controller_uid === controllerUid)
    : []
  const scopedEvents = controllerUid
    ? events.filter((event) => event.controller_uid === controllerUid).slice(0, 8)
    : events.slice(0, 5)
  const fields = Object.entries(selected).filter(([, value]) =>
    ['string', 'number', 'boolean'].includes(typeof value),
  )

  return (
    <div className="twin-inspector">
      <div className="twin-inspector-head">
        <div>
          <span>{titleize(componentType(selected))}</span>
          <h3>{componentLabel(selected)}</h3>
        </div>
        <StatusBadge status={String(selected.status ?? selected.confidence ?? 'evidence')} />
      </div>

      {controllerUid && (
        <div className="twin-inspector-actions">
          <Link className="secondary-button" to={`/controllers/${controllerUid}/overview`}>
            Controller workspace
          </Link>
          <Link className="secondary-button" to={`/controllers/${controllerUid}/incidents`}>
            Controller incidents
          </Link>
        </div>
      )}

      <div className="twin-inspector-fields">
        {fields.map(([name, value]) => (
          <div key={name}>
            <span>{titleize(name)}</span>
            <strong>{String(value ?? '—')}</strong>
          </div>
        ))}
      </div>

      <div className="twin-inspector-section">
        <h4>Relationships</h4>
        {!related.length ? (
          <p className="muted">No typed relationships reference this component.</p>
        ) : (
          related.map((relationship, index) => (
            <div className="twin-evidence-row" key={`${relationship.from}-${relationship.to}-${index}`}>
              <div>
                <strong>{titleize(String(relationship.type || 'relationship'))}</strong>
                <span>
                  {String(relationship.from)} → {String(relationship.to)}
                </span>
              </div>
              <StatusBadge status={String(relationship.confidence || 'unknown')} />
              <small>{String(relationship.source || 'backend evidence')}</small>
            </div>
          ))
        )}
      </div>

      <div className="twin-inspector-section">
        <h4>Active incidents</h4>
        {!scopedIncidents.length ? (
          <p className="muted">No active incidents are attached to this controller.</p>
        ) : (
          scopedIncidents.map((incident) => (
            <div className="twin-evidence-row" key={incident.incident_uid}>
              <div>
                <strong>{incident.title}</strong>
                <span>{incident.summary}</span>
              </div>
              <StatusBadge status={incident.severity} />
              <small>{formatRelativeTime(incident.opened_at)}</small>
            </div>
          ))
        )}
      </div>

      <div className="twin-inspector-section">
        <h4>Recent events</h4>
        {!scopedEvents.length ? (
          <p className="muted">No recent event evidence is available for this scope.</p>
        ) : (
          scopedEvents.map((event, index) => (
            <div className="twin-event-row" key={String(event.id ?? `${event.observed_at}-${index}`)}>
              <span>{titleize(event.event_type || 'event')}</span>
              <strong>{event.message || 'Backend event evidence recorded.'}</strong>
              <small>{formatRelativeTime(event.observed_at)}</small>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function SiteDigitalTwinPage() {
  const systems = useSystems()
  const systemUid = systems.data?.[0]?.system_uid
  const graph = useSystemComponentGraph(systemUid)
  const power = useSystemPowerFlow(systemUid)
  const latest = useSystemLatest(systemUid)
  const controllers = useControllers()
  const incidents = useSystemIncidents(systemUid, 'active', undefined, 100)
  const streamState = useSystemStream(systemUid)
  const [selectedId, setSelectedId] = useState<string>()
  const [window, setWindow] = useState<InvestigationWindow>(() => presetWindow(24, 'Last 24 hours'))
  const resolution = windowResolution(window)
  const events = useSystemEvents(systemUid, window.from, window.to, 250)
  const solarHistory = useSystemHistory(systemUid, 'solar_input_power_w', window.from, window.to, resolution, 2500)
  const outputHistory = useSystemHistory(systemUid, 'charge_output_power_w', window.from, window.to, resolution, 2500)
  const voltageHistory = useSystemHistory(systemUid, 'battery_voltage_v', window.from, window.to, resolution, 2500)
  const currentHistory = useSystemHistory(systemUid, 'battery_charge_current_a', window.from, window.to, resolution, 2500)

  const components = useMemo(() => graphComponents(graph.data), [graph.data])
  const relationships = useMemo(() => graphRelationships(graph.data), [graph.data])
  const activeIncidents = incidents.data ?? []
  const selected = components.find((component) => componentId(component) === selectedId)
  const latestMetrics = latest.data?.metrics ?? {}
  const powerRecord = power.data ?? {}
  const efficiency = metricFrom(powerRecord, ['balance', 'controller_conversion_efficiency_percent'])
  const batteryNet = metricFrom(powerRecord, ['battery', 'net_power_w'])
  const dcLoad = metricFrom(powerRecord, ['loads', 'dc_power_w'])

  if (!systemUid) {
    if (systems.isLoading) return <LoadingState label="Loading site digital twin…" />
    if (systems.isError) return <ErrorState title="Site inventory unavailable" />
    return <EmptyState title="No site is configured">The digital twin appears when a system is enrolled.</EmptyState>
  }

  const investigate = (incident: IntelligenceIncident) => {
    setWindow(incidentWindow(incident))
    if (incident.controller_uid) {
      const component = components.find(
        (candidate) => componentControllerUid(candidate) === incident.controller_uid,
      )
      if (component) setSelectedId(componentId(component))
    }
  }

  return (
    <div className="page digital-twin-page">
      <div className="page-heading site-heading">
        <div>
          <span className="eyebrow">Interactive evidence-aware electrical model</span>
          <h1>Site digital twin</h1>
          <p>
            Explore the backend component graph as a live electrical/site model. Verified, configured,
            reported, capability-derived, logical, and unknown evidence remain visibly distinct rather
            than being flattened into a speculative wiring diagram.
          </p>
        </div>
        <div className="site-heading-status">
          <StatusBadge status={powerStatus(metricFrom(powerRecord, ['sources', 'solar_input_power_w']))} />
          <StatusBadge
            status={streamState === 'connected' ? 'online' : 'warning'}
            label={`SSE ${streamState}`}
          />
        </div>
      </div>

      {(graph.isError || power.isError) && (
        <ErrorState title="Some digital-twin evidence is unavailable" detail="Component graph and power flow remain independently readable." />
      )}

      <div className="site-summary-grid">
        <SummaryStat
          label="Solar input"
          value={readingText(latestMetrics.solar_input_power_w)}
          helper={String(latestMetrics.solar_input_power_w?.quality ?? 'unknown quality')}
          icon={<Sun size={18} />}
        />
        <SummaryStat
          label="Charge output"
          value={readingText(latestMetrics.charge_output_power_w)}
          helper={`efficiency ${readingText(efficiency)}`}
          icon={<Zap size={18} />}
        />
        <SummaryStat
          label="Battery bus"
          value={readingText(latestMetrics.battery_voltage_v)}
          helper={`net ${readingText(batteryNet)}`}
          icon={<BatteryCharging size={18} />}
        />
        <SummaryStat
          label="Active incidents"
          value={activeIncidents.length}
          helper={`${activeIncidents.filter((incident) => incident.severity === 'critical').length} critical · load ${readingText(dcLoad)}`}
          icon={<AlertTriangle size={18} />}
        />
      </div>

      <div className="digital-twin-layout">
        <Panel eyebrow="Live component graph" title="Electrical and site relationships">
          {graph.isLoading ? (
            <LoadingState label="Building component graph…" />
          ) : !components.length ? (
            <EmptyState title="No component graph available" />
          ) : (
            <GraphCanvas
              components={components}
              relationships={relationships}
              incidents={activeIncidents}
              selectedId={selectedId}
              onSelect={(component) => setSelectedId(componentId(component))}
            />
          )}
          <div className="digital-twin-legend">
            <span><i className="legend-verified" /> verified / configured</span>
            <span><i className="legend-reported" /> reported / capability</span>
            <span><i className="legend-logical" /> logical / inferred</span>
            <span><CircleDot size={12} /> click a node to inspect evidence</span>
          </div>
        </Panel>

        <Panel eyebrow="Evidence inspector" title={selected ? componentLabel(selected) : 'Component details'}>
          <Inspector
            selected={selected}
            relationships={relationships}
            incidents={activeIncidents}
            events={events.data ?? []}
          />
        </Panel>
      </div>

      <Panel eyebrow="Correlated telemetry + evidence" title="Investigation workbench">
        <div className="investigation-toolbar">
          <div>
            <Search size={16} />
            <strong>{window.label}</strong>
            <span>{resolution} aggregation</span>
          </div>
          <div className="segmented">
            <button onClick={() => setWindow(presetWindow(6, 'Last 6 hours'))}>6h</button>
            <button onClick={() => setWindow(presetWindow(24, 'Last 24 hours'))}>24h</button>
            <button onClick={() => setWindow(presetWindow(24 * 7, 'Last 7 days'))}>7d</button>
          </div>
        </div>
        {(solarHistory.isError || outputHistory.isError || voltageHistory.isError || currentHistory.isError) && (
          <ErrorState title="Some investigation series could not be loaded" detail="Available series and event evidence are still shown." />
        )}
        <InvestigationChart
          solar={solarHistory.data}
          output={outputHistory.data}
          voltage={voltageHistory.data}
          current={currentHistory.data}
          events={events.data ?? []}
          incidents={activeIncidents.filter((incident) => {
            const opened = new Date(incident.opened_at).getTime()
            return opened >= new Date(window.from).getTime() && opened <= new Date(window.to).getTime()
          })}
        />
        <div className="investigation-meta">
          <span>{events.data?.length ?? 0} event(s) in window</span>
          <span>{controllers.data?.length ?? 0} physical controller record(s)</span>
          <span>Power/current/voltage are never recomputed in the browser</span>
        </div>
      </Panel>

      <div className="digital-twin-bottom-grid">
        <Panel eyebrow="Jump directly into context" title="Active incident investigations">
          {incidents.isLoading ? (
            <LoadingState />
          ) : !activeIncidents.length ? (
            <EmptyState title="No active incidents">No current findings need investigation.</EmptyState>
          ) : (
            <div className="twin-incident-list">
              {activeIncidents.map((incident) => (
                <article key={incident.incident_uid} className={`twin-incident incident-${incident.severity}`}>
                  <div>
                    <StatusBadge status={incident.severity} />
                    <strong>{incident.title}</strong>
                    <span>{incident.summary}</span>
                  </div>
                  <button className="secondary-button" onClick={() => investigate(incident)}>
                    Investigate ±1h
                  </button>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel eyebrow="Power-model provenance" title="What the backend knows">
          <div className="twin-power-evidence">
            <div><Network size={17} /><span>Basis</span><strong>{String(asRecord(powerRecord)?.basis ?? 'source-backed observations')}</strong></div>
            <div><Boxes size={17} /><span>Components</span><strong>{components.length}</strong></div>
            <div><Cable size={17} /><span>Relationships</span><strong>{relationships.length}</strong></div>
            <div><Gauge size={17} /><span>Model quality</span><strong>{String(asRecord(powerRecord)?.quality ?? 'unknown')}</strong></div>
          </div>
          {Array.isArray(asRecord(powerRecord)?.unknowns) && (
            <ul className="twin-unknowns">
              {(asRecord(powerRecord)?.unknowns as unknown[]).map((item, index) => (
                <li key={index}>{String(item)}</li>
              ))}
            </ul>
          )}
          <p className="muted">
            Unknown values are preserved as unknown. The digital twin never converts topology evidence into
            undocumented physical wiring or invents generator/load/battery measurements.
          </p>
        </Panel>
      </div>
    </div>
  )
}
