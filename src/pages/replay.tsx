import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Clock3,
  Link2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState, Panel, StatusBadge } from '../components'
import {
  useSystemIncidents,
  type IntelligenceIncident,
} from '../intelligence-api'
import {
  useSystemComponentGraph,
  useSystemEvents,
  useSystemHistory,
  useSystems,
  type SystemEvent,
  type SystemHistory,
  type SystemHistoryPoint,
} from '../system-api'

type ReplayRange = {
  from: string
  to: string
  label: string
}

type ReplayReading = {
  value?: number | string | null
  unit?: string | null
  quality: string
  ageMs?: number
  sources: number
  point?: SystemHistoryPoint
}

const METRICS = [
  { name: 'solar_input_power_w', label: 'Solar input', fallbackUnit: 'W' },
  { name: 'charge_output_power_w', label: 'Charge output', fallbackUnit: 'W' },
  { name: 'battery_voltage_v', label: 'Battery voltage', fallbackUnit: 'V' },
  { name: 'battery_charge_current_a', label: 'Charge current', fallbackUnit: 'A' },
] as const

function validDate(value: string | null): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function defaultRange(): ReplayRange {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString(), label: 'Last 24 hours' }
}

function rangeFromParams(params: URLSearchParams): ReplayRange {
  const fallback = defaultRange()
  const from = validDate(params.get('from'))
  const to = validDate(params.get('to'))
  if (!from || !to || from >= to) return fallback
  return { from: from.toISOString(), to: to.toISOString(), label: 'Shared replay window' }
}

function presetRange(hours: number, label: string, anchor = new Date()): ReplayRange {
  const to = new Date(anchor)
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString(), label }
}

function pointTime(point: SystemHistoryPoint): number | undefined {
  const timestamp = point.bucket_start ?? point.observed_at
  if (!timestamp) return undefined
  const value = new Date(timestamp).getTime()
  return Number.isFinite(value) ? value : undefined
}

function pointValue(point: SystemHistoryPoint): number | string | null | undefined {
  if (point.last !== undefined && point.last !== null) return point.last
  if (point.avg !== undefined && point.avg !== null) return point.avg
  return point.value
}

function resolutionMs(resolution: string): number {
  const match = resolution.match(/^(\d+)([mhd])$/)
  if (!match) return 5 * 60_000
  const amount = Number(match[1])
  if (match[2] === 'd') return amount * 24 * 60 * 60_000
  if (match[2] === 'h') return amount * 60 * 60_000
  return amount * 60_000
}

function resolutionFor(range: ReplayRange): string {
  const durationHours = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 3_600_000
  if (durationHours <= 8) return '5m'
  if (durationHours <= 48) return '15m'
  return '1h'
}

function readingAt(history: SystemHistory | undefined, atMs: number, resolution: string): ReplayReading {
  const points = history?.points ?? []
  let selected: SystemHistoryPoint | undefined
  let selectedTime = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const timestamp = pointTime(point)
    if (timestamp === undefined || timestamp > atMs || timestamp < selectedTime) continue
    selected = point
    selectedTime = timestamp
  }

  if (!selected) return { quality: 'unknown', sources: 0 }
  const ageMs = atMs - selectedTime
  const freshnessLimit = resolutionMs(resolution) * 2.5
  if (ageMs > freshnessLimit) {
    return { quality: 'gap', ageMs, sources: 0, point: selected }
  }

  return {
    value: pointValue(selected),
    unit: history?.metric?.unit,
    quality: selected.quality ?? 'observed',
    ageMs,
    sources: Array.isArray(selected.sources) ? selected.sources.length : 0,
    point: selected,
  }
}

function formatReading(reading: ReplayReading, fallbackUnit: string): string {
  if (reading.quality === 'gap' || reading.value === undefined || reading.value === null) return 'Unknown'
  const unit = reading.unit || fallbackUnit
  if (typeof reading.value === 'number') {
    const digits = Math.abs(reading.value) >= 100 ? 0 : Math.abs(reading.value) >= 10 ? 1 : 2
    return `${reading.value.toFixed(digits)} ${unit}`.trim()
  }
  return `${reading.value} ${unit}`.trim()
}

function relativeDuration(milliseconds?: number): string {
  if (milliseconds === undefined) return 'no nearby sample'
  const minutes = Math.round(milliseconds / 60_000)
  if (minutes <= 0) return 'same bucket'
  if (minutes < 60) return `${minutes}m old`
  return `${(minutes / 60).toFixed(1)}h old`
}

function eventAt(event: SystemEvent, atMs: number, radiusMs = 15 * 60_000): boolean {
  if (!event.observed_at) return false
  const timestamp = new Date(event.observed_at).getTime()
  return Number.isFinite(timestamp) && Math.abs(timestamp - atMs) <= radiusMs
}

function incidentActiveAt(incident: IntelligenceIncident, atMs: number): boolean {
  const opened = new Date(incident.opened_at).getTime()
  if (!Number.isFinite(opened) || opened > atMs) return false
  const resolved = incident.resolved_at ? new Date(incident.resolved_at).getTime() : Number.POSITIVE_INFINITY
  return !Number.isFinite(resolved) || resolved >= atMs
}

function historySeries(history?: SystemHistory): Array<[string, number]> {
  return (history?.points ?? []).flatMap((point) => {
    const time = point.bucket_start ?? point.observed_at
    const value = point.avg ?? point.value ?? point.last
    return time && typeof value === 'number' ? [[time, value] as [string, number]] : []
  })
}

function ReplayChart({
  solar,
  output,
  voltage,
  current,
  selectedAt,
  events,
  incidents,
}: {
  solar?: SystemHistory
  output?: SystemHistory
  voltage?: SystemHistory
  current?: SystemHistory
  selectedAt: string
  events: SystemEvent[]
  incidents: IntelligenceIncident[]
}) {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    let disposed = false
    let chart: import('echarts').ECharts | undefined
    let cleanup: (() => void) | undefined

    void import('echarts').then((echarts) => {
      if (disposed || !elementRef.current) return
      chart = echarts.init(elementRef.current)
      const markers = [
        ...events.slice(-20).flatMap((event) =>
          event.observed_at
            ? [{ name: event.event_type || 'event', xAxis: event.observed_at }]
            : [],
        ),
        ...incidents.slice(-12).map((incident) => ({ name: incident.title, xAxis: incident.opened_at })),
      ]

      chart.setOption({
        animation: false,
        tooltip: { trigger: 'axis' },
        legend: { data: ['Solar input', 'Charge output', 'Battery voltage', 'Charge current'] },
        grid: { left: 60, right: 64, top: 58, bottom: 54 },
        xAxis: { type: 'time' },
        yAxis: [
          { type: 'value', name: 'Power (W)', scale: true },
          { type: 'value', name: 'V / A', scale: true },
        ],
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18 }],
        series: [
          {
            name: 'Solar input',
            type: 'line',
            showSymbol: false,
            data: historySeries(solar),
            markLine: {
              symbol: ['none', 'none'],
              silent: true,
              data: [
                { name: 'Replay cursor', xAxis: selectedAt, lineStyle: { width: 2 }, label: { formatter: 'Replay cursor' } },
                ...markers,
              ],
            },
          },
          { name: 'Charge output', type: 'line', showSymbol: false, data: historySeries(output) },
          { name: 'Battery voltage', type: 'line', yAxisIndex: 1, showSymbol: false, data: historySeries(voltage) },
          { name: 'Charge current', type: 'line', yAxisIndex: 1, showSymbol: false, data: historySeries(current) },
        ],
      })

      const resize = () => chart?.resize()
      window.addEventListener('resize', resize)
      cleanup = () => window.removeEventListener('resize', resize)
    })

    return () => {
      disposed = true
      cleanup?.()
      chart?.dispose()
    }
  }, [current, events, incidents, output, selectedAt, solar, voltage])

  return <div className="replay-chart" ref={elementRef} aria-label="Historical site replay telemetry" />
}

function graphSummary(value: unknown): { components: number; relationships: number } {
  if (!value || typeof value !== 'object') return { components: 0, relationships: 0 }
  const record = value as Record<string, unknown>
  return {
    components: Array.isArray(record.components) ? record.components.length : 0,
    relationships: Array.isArray(record.relationships) ? record.relationships.length : 0,
  }
}

export default function SiteReplayPage() {
  const systems = useSystems()
  const systemUid = systems.data?.[0]?.system_uid
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRange] = useState<ReplayRange>(() => rangeFromParams(searchParams))
  const initialAt = validDate(searchParams.get('at'))
  const [atMs, setAtMs] = useState(() => initialAt?.getTime() ?? new Date(range.to).getTime())
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const resolution = resolutionFor(range)
  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime()

  const solar = useSystemHistory(systemUid, 'solar_input_power_w', range.from, range.to, resolution, 2500)
  const output = useSystemHistory(systemUid, 'charge_output_power_w', range.from, range.to, resolution, 2500)
  const voltage = useSystemHistory(systemUid, 'battery_voltage_v', range.from, range.to, resolution, 2500)
  const current = useSystemHistory(systemUid, 'battery_charge_current_a', range.from, range.to, resolution, 2500)
  const events = useSystemEvents(systemUid, range.from, range.to, 1000)
  const activeIncidents = useSystemIncidents(systemUid, 'active', undefined, 500)
  const resolvedIncidents = useSystemIncidents(systemUid, 'resolved', undefined, 1000)
  const graph = useSystemComponentGraph(systemUid)

  const incidents = useMemo(() => {
    const byUid = new Map<string, IntelligenceIncident>()
    for (const incident of [...(resolvedIncidents.data ?? []), ...(activeIncidents.data ?? [])]) {
      byUid.set(incident.incident_uid, incident)
    }
    return [...byUid.values()].filter((incident) => {
      const opened = new Date(incident.opened_at).getTime()
      const resolved = incident.resolved_at ? new Date(incident.resolved_at).getTime() : Number.POSITIVE_INFINITY
      return opened <= toMs && resolved >= fromMs
    })
  }, [activeIncidents.data, fromMs, resolvedIncidents.data, toMs])

  const selectedAt = new Date(atMs).toISOString()
  const readings = {
    solar: readingAt(solar.data, atMs, resolution),
    output: readingAt(output.data, atMs, resolution),
    voltage: readingAt(voltage.data, atMs, resolution),
    current: readingAt(current.data, atMs, resolution),
  }
  const comparisonAt = Math.max(fromMs, atMs - 2 * 60 * 60_000)
  const comparison = {
    solar: readingAt(solar.data, comparisonAt, resolution),
    output: readingAt(output.data, comparisonAt, resolution),
    voltage: readingAt(voltage.data, comparisonAt, resolution),
    current: readingAt(current.data, comparisonAt, resolution),
  }
  const nearbyEvents = (events.data ?? []).filter((event) => eventAt(event, atMs))
  const activeAtCursor = incidents.filter((incident) => incidentActiveAt(incident, atMs))
  const topology = graphSummary(graph.data)
  const stepMs = resolutionMs(resolution)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setAtMs((currentAt) => {
        const next = currentAt + stepMs * speed
        if (next >= toMs) {
          setPlaying(false)
          return toMs
        }
        return next
      })
    }, 850)
    return () => window.clearInterval(timer)
  }, [playing, speed, stepMs, toMs])

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    params.set('at', selectedAt)
    params.set('from', range.from)
    params.set('to', range.to)
    setSearchParams(params, { replace: true })
  }, [range.from, range.to, selectedAt, searchParams, setSearchParams])

  const chooseRange = (next: ReplayRange) => {
    setPlaying(false)
    setRange(next)
    setAtMs(new Date(next.to).getTime())
  }

  const resetLiveWindow = () => chooseRange(defaultRange())

  const share = async () => {
    if (navigator.clipboard) await navigator.clipboard.writeText(window.location.href)
  }

  if (!systemUid) {
    if (systems.isLoading) return <LoadingState label="Loading historical replay…" />
    if (systems.isError) return <ErrorState title="Site inventory unavailable" />
    return <EmptyState title="No site is configured">Historical replay appears when a system is enrolled.</EmptyState>
  }

  const historyError = solar.isError || output.isError || voltage.isError || current.isError

  return (
    <div className="page replay-page">
      <div className="page-heading replay-heading">
        <div>
          <span className="eyebrow">Evidence-aware historical operations</span>
          <h1>Site replay</h1>
          <p>
            Move the site through recorded time, correlate telemetry with events and incidents, and keep gaps
            visible instead of inventing measurements. The topology card is explicitly current context until
            the backend exposes an authoritative historical snapshot contract.
          </p>
        </div>
        <div className="replay-heading-actions">
          <StatusBadge status={playing ? 'online' : 'observed'} label={playing ? `Playing ${speed}×` : 'Paused'} />
          <button className="secondary-button" onClick={() => void share()}><Link2 size={15} /> Copy replay link</button>
        </div>
      </div>

      {historyError && (
        <ErrorState
          title="Some historical evidence could not be loaded"
          detail="Replay continues with available series; unavailable values remain Unknown."
        />
      )}

      <Panel eyebrow="Time machine" title={new Date(atMs).toLocaleString()}>
        <div className="replay-transport">
          <div className="replay-presets">
            <button onClick={() => chooseRange(presetRange(6, 'Last 6 hours'))}>6h</button>
            <button onClick={() => chooseRange(presetRange(24, 'Last 24 hours'))}>24h</button>
            <button onClick={() => chooseRange(presetRange(24 * 7, 'Last 7 days'))}>7d</button>
            <button onClick={resetLiveWindow}><RotateCcw size={14} /> Latest window</button>
          </div>
          <div className="replay-controls">
            <button aria-label="Step backward" onClick={() => setAtMs((value) => Math.max(fromMs, value - stepMs))}><SkipBack size={17} /></button>
            <button className="replay-play" onClick={() => setPlaying((value) => !value)}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button aria-label="Step forward" onClick={() => setAtMs((value) => Math.min(toMs, value + stepMs))}><SkipForward size={17} /></button>
            <label>
              Speed
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                <option value={1}>1×</option>
                <option value={5}>5×</option>
                <option value={20}>20×</option>
              </select>
            </label>
          </div>
        </div>

        <input
          className="replay-scrubber"
          type="range"
          min={fromMs}
          max={toMs}
          step={Math.max(60_000, stepMs)}
          value={atMs}
          onChange={(event) => {
            setPlaying(false)
            setAtMs(Number(event.target.value))
          }}
          aria-label="Historical replay timestamp"
        />
        <div className="replay-range-labels">
          <span>{new Date(fromMs).toLocaleString()}</span>
          <strong>{range.label} · {resolution} evidence buckets</strong>
          <span>{new Date(toMs).toLocaleString()}</span>
        </div>
      </Panel>

      <div className="replay-reading-grid">
        {METRICS.map((metric) => {
          const reading = readings[metric.name === 'solar_input_power_w' ? 'solar' : metric.name === 'charge_output_power_w' ? 'output' : metric.name === 'battery_voltage_v' ? 'voltage' : 'current']
          return (
            <article className={`replay-reading quality-${reading.quality}`} key={metric.name}>
              <span>{metric.label}</span>
              <strong>{formatReading(reading, metric.fallbackUnit)}</strong>
              <small>{reading.quality} · {relativeDuration(reading.ageMs)} · {reading.sources} source(s)</small>
            </article>
          )
        })}
      </div>

      <Panel eyebrow="Synchronized evidence" title="Telemetry, events, incidents, and replay cursor">
        <ReplayChart
          solar={solar.data}
          output={output.data}
          voltage={voltage.data}
          current={current.data}
          selectedAt={selectedAt}
          events={events.data ?? []}
          incidents={incidents}
        />
      </Panel>

      <div className="replay-context-grid">
        <Panel eyebrow="At the replay cursor" title="Operational context">
          <div className="replay-context-summary">
            <div><Clock3 size={18} /><span>Nearby events</span><strong>{nearbyEvents.length}</strong></div>
            <div><ShieldAlert size={18} /><span>Active incidents</span><strong>{activeAtCursor.length}</strong></div>
            <div><AlertTriangle size={18} /><span>Critical</span><strong>{activeAtCursor.filter((incident) => incident.severity === 'critical').length}</strong></div>
          </div>
          {!nearbyEvents.length && !activeAtCursor.length ? (
            <p className="muted">No event or incident evidence falls around this timestamp.</p>
          ) : (
            <div className="replay-evidence-list">
              {activeAtCursor.map((incident) => (
                <article key={incident.incident_uid}>
                  <StatusBadge status={incident.severity} />
                  <div><strong>{incident.title}</strong><span>{incident.summary}</span></div>
                  <small>{incident.confidence}</small>
                </article>
              ))}
              {nearbyEvents.map((event, index) => (
                <article key={String(event.id ?? `${event.observed_at}-${index}`)}>
                  <StatusBadge status={event.severity || 'observed'} />
                  <div><strong>{String(event.event_type || 'event').replace(/_/g, ' ')}</strong><span>{event.message || 'Recorded system event'}</span></div>
                  <small>{event.observed_at ? new Date(event.observed_at).toLocaleTimeString() : 'unknown time'}</small>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel eyebrow="Present-day structural context" title="Current component graph">
          <div className="replay-topology-summary">
            <div><span>Components</span><strong>{topology.components}</strong></div>
            <div><span>Relationships</span><strong>{topology.relationships}</strong></div>
          </div>
          <p className="replay-warning">
            This graph describes current backend topology evidence. It is not labeled as historical at the replay
            cursor because the API does not yet expose `component-graph?at=` or a historical site snapshot.
          </p>
          <Link className="secondary-button" to="/site/twin">Open live digital twin</Link>
        </Panel>
      </div>

      <Panel eyebrow="Before / after" title="Compare with two hours earlier">
        <div className="replay-compare-time"><ArrowLeftRight size={17} /> {new Date(comparisonAt).toLocaleString()} → {new Date(atMs).toLocaleString()}</div>
        <div className="replay-compare-grid">
          {METRICS.map((metric) => {
            const key = metric.name === 'solar_input_power_w' ? 'solar' : metric.name === 'charge_output_power_w' ? 'output' : metric.name === 'battery_voltage_v' ? 'voltage' : 'current'
            const before = comparison[key]
            const after = readings[key]
            const beforeNumber = typeof before.value === 'number' && before.quality !== 'gap' ? before.value : undefined
            const afterNumber = typeof after.value === 'number' && after.quality !== 'gap' ? after.value : undefined
            const delta = beforeNumber !== undefined && afterNumber !== undefined ? afterNumber - beforeNumber : undefined
            return (
              <article key={metric.name}>
                <span>{metric.label}</span>
                <strong>{formatReading(before, metric.fallbackUnit)} → {formatReading(after, metric.fallbackUnit)}</strong>
                <small>{delta === undefined ? 'delta unknown' : `Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} ${after.unit || before.unit || metric.fallbackUnit}`}</small>
              </article>
            )
          })}
        </div>
      </Panel>

      <div className="replay-safety-note">
        <strong>Replay semantics</strong>
        <span>
          Values are selected from the latest historical bucket at or before the cursor only when it is close enough
          to the chosen resolution. Gaps become Unknown. No interpolation, synthetic telemetry, historical topology
          invention, or controller writes are performed.
        </span>
      </div>
    </div>
  )
}
