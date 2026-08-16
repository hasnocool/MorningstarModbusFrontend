import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeftRight,
  CalendarDays,
  History,
  ShieldAlert,
  Sun,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatusBadge,
  SummaryStat,
} from '../components'
import {
  curveForDay,
  dayBounds,
  localDayKey,
  medianCurve,
  medianSummary,
  percentDelta,
  replayUrlForTimestamp,
  shiftDay,
  summarizeDay,
  type CurvePoint,
  type DayLabHistories,
} from '../day-lab'
import { useSystemIncidents, type IntelligenceIncident } from '../intelligence-api'
import {
  useSystemEvents,
  useSystemHistory,
  useSystems,
  type SystemEvent,
} from '../system-api'

type ComparisonMode = 'previous' | '7d' | '30d'

type MetricRow = {
  label: string
  selected?: number
  comparison?: number
  unit: string
  kind?: 'energy' | 'percent'
}

function formatMetric(value: number | undefined, unit: string, kind?: MetricRow['kind']): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (kind === 'percent') return `${(value * 100).toFixed(1)}%`
  if (kind === 'energy') {
    return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(2)} kWh` : `${Math.round(value)} Wh`
  }
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${unit}`.trim()
}

function deltaText(value?: number, baseline?: number): string {
  const delta = percentDelta(value, baseline)
  if (delta === undefined) return 'comparison unavailable'
  if (Math.abs(delta) < 1) return '≈ comparison'
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`
}

function comparisonName(mode: ComparisonMode): string {
  if (mode === 'previous') return 'Previous day'
  if (mode === '7d') return 'Prior 7-day median'
  return 'Prior 30-day median'
}

function minuteLabel(value: number): string {
  const minutes = Math.max(0, Math.min(1439, Math.round(value)))
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function DayComparisonChart({
  selected,
  comparison,
  median30,
  selectedLabel,
  comparisonLabel,
}: {
  selected: CurvePoint[]
  comparison: CurvePoint[]
  median30: CurvePoint[]
  selectedLabel: string
  comparisonLabel: string
}) {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    let chart: import('echarts').ECharts | undefined
    let cleanup: (() => void) | undefined
    let disposed = false

    void import('echarts').then((echarts) => {
      if (disposed || !elementRef.current) return
      chart = echarts.init(elementRef.current)
      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          valueFormatter: (value: unknown) =>
            typeof value === 'number' ? `${value.toFixed(1)} W` : String(value ?? '—'),
        },
        legend: { data: [selectedLabel, comparisonLabel, 'Prior 30-day median'] },
        grid: { left: 62, right: 30, top: 58, bottom: 54 },
        xAxis: {
          type: 'value',
          min: 0,
          max: 1440,
          name: 'Local time',
          axisLabel: { formatter: (value: string | number) => minuteLabel(Number(value)) },
        },
        yAxis: { type: 'value', name: 'Solar input (W)', min: 0 },
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18 }],
        series: [
          {
            name: selectedLabel,
            type: 'line',
            showSymbol: false,
            data: selected.map((point) => [point.minute, point.value]),
          },
          {
            name: comparisonLabel,
            type: 'line',
            showSymbol: false,
            data: comparison.map((point) => [point.minute, point.value]),
          },
          {
            name: 'Prior 30-day median',
            type: 'line',
            showSymbol: false,
            lineStyle: { type: 'dashed' },
            data: median30.map((point) => [point.minute, point.value]),
          },
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
  }, [comparison, comparisonLabel, median30, selected, selectedLabel])

  return <div className="day-lab-chart" ref={elementRef} aria-label="Selected day and historical solar comparison" />
}

function incidentOverlaps(incident: IntelligenceIncident, fromMs: number, toMs: number): boolean {
  const opened = new Date(incident.opened_at).getTime()
  const resolved = incident.resolved_at
    ? new Date(incident.resolved_at).getTime()
    : Number.POSITIVE_INFINITY
  return Number.isFinite(opened) && opened < toMs && resolved >= fromMs
}

function uniqueIncidents(...groups: IntelligenceIncident[][]): IntelligenceIncident[] {
  const byUid = new Map<string, IntelligenceIncident>()
  for (const incident of groups.flat()) byUid.set(incident.incident_uid, incident)
  return [...byUid.values()]
}

function observation(label: string, value?: number, baseline?: number, unit = ''): string {
  const delta = percentDelta(value, baseline)
  if (value === undefined || baseline === undefined || delta === undefined) {
    return `${label}: insufficient comparable evidence.`
  }
  if (Math.abs(delta) < 3) {
    return `${label}: within 3% of the comparison (${formatMetric(value, unit)} vs ${formatMetric(baseline, unit)}).`
  }
  return `${label}: ${Math.abs(delta).toFixed(1)}% ${delta > 0 ? 'above' : 'below'} the comparison (${formatMetric(value, unit)} vs ${formatMetric(baseline, unit)}).`
}

function dateTime(value?: string): string {
  if (!value) return 'unknown time'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}

export default function DayLabPage() {
  const systems = useSystems()
  const systemUid = systems.data?.[0]?.system_uid
  const today = localDayKey(new Date())
  const [selectedDay, setSelectedDay] = useState(today)
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('previous')
  const selectedBounds = dayBounds(selectedDay)
  const selectedIsToday = selectedDay === today
  const now = new Date()
  const throughMinute = selectedIsToday ? now.getHours() * 60 + now.getMinutes() : 1439
  const queryFrom = dayBounds(shiftDay(selectedDay, -30)).from
  const queryTo = selectedIsToday ? now.toISOString() : selectedBounds.to

  const solar = useSystemHistory(systemUid, 'solar_input_power_w', queryFrom, queryTo, '15m', 4000)
  const output = useSystemHistory(systemUid, 'charge_output_power_w', queryFrom, queryTo, '15m', 4000)
  const voltage = useSystemHistory(systemUid, 'battery_voltage_v', queryFrom, queryTo, '15m', 4000)
  const current = useSystemHistory(systemUid, 'battery_charge_current_a', queryFrom, queryTo, '15m', 4000)
  const dailyCharge = useSystemHistory(systemUid, 'daily_charge_wh', queryFrom, queryTo, '15m', 4000)
  const selectedEvents = useSystemEvents(
    systemUid,
    selectedBounds.from,
    selectedIsToday ? now.toISOString() : selectedBounds.to,
    1000,
  )
  const activeIncidents = useSystemIncidents(systemUid, 'active', undefined, 500)
  const resolvedIncidents = useSystemIncidents(systemUid, 'resolved', undefined, 1000)

  const histories: DayLabHistories = useMemo(
    () => ({
      solar: solar.data,
      output: output.data,
      voltage: voltage.data,
      current: current.data,
      dailyCharge: dailyCharge.data,
    }),
    [current.data, dailyCharge.data, output.data, solar.data, voltage.data],
  )

  const priorDays = useMemo(
    () => Array.from({ length: 30 }, (_, index) => shiftDay(selectedDay, -(index + 1))),
    [selectedDay],
  )
  const selectedSummary = useMemo(
    () => summarizeDay(histories, selectedDay, 15, throughMinute),
    [histories, selectedDay, throughMinute],
  )
  const priorSummaries = useMemo(
    () => priorDays.map((day) => summarizeDay(histories, day, 15, throughMinute)),
    [histories, priorDays, throughMinute],
  )

  const comparisonSummary = useMemo(() => {
    if (comparisonMode === 'previous') return priorSummaries[0]
    const count = comparisonMode === '7d' ? 7 : 30
    const eligible = priorSummaries
      .slice(0, count)
      .filter((summary) => summary.observedBuckets > 0)
    return medianSummary(eligible, comparisonMode === '7d' ? 'Prior 7-day median' : 'Prior 30-day median')
  }, [comparisonMode, priorSummaries])

  const comparisonDays = comparisonMode === '7d' ? priorDays.slice(0, 7) : priorDays
  const selectedCurve = curveForDay(solar.data, selectedDay, throughMinute)
  const comparisonCurve =
    comparisonMode === 'previous'
      ? curveForDay(solar.data, priorDays[0], throughMinute)
      : medianCurve(solar.data, comparisonDays, throughMinute)
  const median30 = medianCurve(solar.data, priorDays, throughMinute)

  const fromMs = new Date(selectedBounds.from).getTime()
  const toMs = new Date(selectedIsToday ? now.toISOString() : selectedBounds.to).getTime()
  const incidents = uniqueIncidents(resolvedIncidents.data ?? [], activeIncidents.data ?? []).filter((incident) =>
    incidentOverlaps(incident, fromMs, toMs),
  )
  const events = selectedEvents.data ?? []
  const comparisonLabel = comparisonName(comparisonMode)
  const selectedLabel = selectedIsToday ? 'Today' : selectedDay

  const rows: MetricRow[] = [
    {
      label: 'Solar input energy',
      selected: selectedSummary.solarInputWh,
      comparison: comparisonSummary?.solarInputWh,
      unit: 'Wh',
      kind: 'energy',
    },
    {
      label: 'Charge output energy',
      selected: selectedSummary.chargeOutputWh,
      comparison: comparisonSummary?.chargeOutputWh,
      unit: 'Wh',
      kind: 'energy',
    },
    {
      label: 'Controller daily charge counter',
      selected: selectedSummary.dailyChargeWh,
      comparison: comparisonSummary?.dailyChargeWh,
      unit: 'Wh',
      kind: 'energy',
    },
    {
      label: 'Peak solar input',
      selected: selectedSummary.peakSolarW,
      comparison: comparisonSummary?.peakSolarW,
      unit: 'W',
    },
    {
      label: 'Peak charge output',
      selected: selectedSummary.peakChargeW,
      comparison: comparisonSummary?.peakChargeW,
      unit: 'W',
    },
    {
      label: 'Maximum battery voltage',
      selected: selectedSummary.maxBatteryV,
      comparison: comparisonSummary?.maxBatteryV,
      unit: 'V',
    },
    {
      label: 'Average charge current',
      selected: selectedSummary.avgChargeA,
      comparison: comparisonSummary?.avgChargeA,
      unit: 'A',
    },
    {
      label: 'Telemetry coverage',
      selected: selectedSummary.coverage,
      comparison: comparisonSummary?.coverage,
      unit: '',
      kind: 'percent',
    },
  ]

  const observations = [
    observation('Solar input energy', selectedSummary.solarInputWh, comparisonSummary?.solarInputWh, 'Wh'),
    observation('Charge output energy', selectedSummary.chargeOutputWh, comparisonSummary?.chargeOutputWh, 'Wh'),
    observation('Peak solar input', selectedSummary.peakSolarW, comparisonSummary?.peakSolarW, 'W'),
    observation('Maximum battery voltage', selectedSummary.maxBatteryV, comparisonSummary?.maxBatteryV, 'V'),
  ]

  const historyLoading = solar.isLoading || output.isLoading || voltage.isLoading || current.isLoading
  const historyError = solar.isError || output.isError || voltage.isError || current.isError

  if (!systemUid) {
    if (systems.isLoading) return <LoadingState label="Loading comparative performance intelligence…" />
    if (systems.isError) return <ErrorState title="Site inventory unavailable" />
    return <EmptyState title="No site is configured">Day Lab appears when a system is enrolled.</EmptyState>
  }

  return (
    <div className="page day-lab-page">
      <div className="page-heading site-heading day-lab-heading">
        <div>
          <span className="eyebrow">Comparative performance intelligence</span>
          <h1>Day Lab</h1>
          <p>
            Compare one operating day with yesterday or the site&apos;s own recent history. Differences are
            presented as evidence-backed observations; events and incidents are correlated in time without
            being promoted into unsupported causal diagnoses.
          </p>
        </div>
        <div className="day-lab-heading-actions">
          <StatusBadge
            status={selectedSummary.coverage >= 0.9 ? 'online' : selectedSummary.coverage >= 0.5 ? 'warning' : 'unknown'}
            label={`${(selectedSummary.coverage * 100).toFixed(0)}% coverage`}
          />
          <Link
            className="secondary-button"
            to={`/site/replay?from=${encodeURIComponent(selectedBounds.from)}&to=${encodeURIComponent(selectedIsToday ? now.toISOString() : selectedBounds.to)}&at=${encodeURIComponent(selectedIsToday ? now.toISOString() : new Date((fromMs + toMs) / 2).toISOString())}`}
          >
            <History size={15} /> Replay this day
          </Link>
        </div>
      </div>

      <Panel eyebrow="Comparison setup" title="Choose the day and baseline">
        <div className="day-lab-toolbar">
          <label>
            <span>Selected day</span>
            <input
              type="date"
              value={selectedDay}
              max={today}
              onChange={(event) => event.target.value && setSelectedDay(event.target.value)}
            />
          </label>
          <label>
            <span>Compare with</span>
            <select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as ComparisonMode)}>
              <option value="previous">Previous day</option>
              <option value="7d">Prior 7-day median</option>
              <option value="30d">Prior 30-day median</option>
            </select>
          </label>
          <div className="day-lab-stepper">
            <button onClick={() => setSelectedDay(shiftDay(selectedDay, -1))}>Previous day</button>
            <button disabled={selectedDay >= today} onClick={() => setSelectedDay(shiftDay(selectedDay, 1))}>Next day</button>
            <button onClick={() => setSelectedDay(today)}>Today</button>
          </div>
        </div>
        {selectedIsToday && (
          <p className="muted day-lab-progress-note">
            Today is compared only through {minuteLabel(throughMinute)} local time so a partial day is not compared with a full historical day.
          </p>
        )}
      </Panel>

      {historyError && (
        <ErrorState
          title="Some comparison history is unavailable"
          detail="Day Lab keeps missing evidence unknown and continues with the series that loaded successfully."
        />
      )}

      <div className="site-summary-grid">
        <SummaryStat
          label="Solar input"
          value={formatMetric(selectedSummary.solarInputWh, 'Wh', 'energy')}
          helper={`${deltaText(selectedSummary.solarInputWh, comparisonSummary?.solarInputWh)} vs ${comparisonLabel.toLowerCase()}`}
          icon={<Sun size={18} />}
        />
        <SummaryStat
          label="Charge output"
          value={formatMetric(selectedSummary.chargeOutputWh, 'Wh', 'energy')}
          helper={`${deltaText(selectedSummary.chargeOutputWh, comparisonSummary?.chargeOutputWh)} vs comparison`}
          icon={<Zap size={18} />}
        />
        <SummaryStat
          label="Peak PV"
          value={formatMetric(selectedSummary.peakSolarW, 'W')}
          helper={`${deltaText(selectedSummary.peakSolarW, comparisonSummary?.peakSolarW)} vs comparison`}
          icon={<Activity size={18} />}
        />
        <SummaryStat
          label="Correlated evidence"
          value={incidents.length + events.length}
          helper={`${incidents.length} incident(s) · ${events.length} event(s)`}
          icon={<ShieldAlert size={18} />}
        />
      </div>

      <Panel eyebrow="Normalized local-day curve" title={`${selectedLabel} vs ${comparisonLabel}`}>
        {historyLoading ? (
          <LoadingState label="Building day comparison…" />
        ) : !selectedCurve.length ? (
          <EmptyState title="No selected-day solar history">Choose a day with recorded normalized solar input.</EmptyState>
        ) : (
          <DayComparisonChart
            selected={selectedCurve}
            comparison={comparisonCurve}
            median30={median30}
            selectedLabel={selectedLabel}
            comparisonLabel={comparisonLabel}
          />
        )}
        <div className="day-lab-chart-meta">
          <span>{selectedSummary.observedBuckets}/{selectedSummary.expectedBuckets} representative 15-minute buckets</span>
          <span>30-day history window · current local-time alignment</span>
        </div>
      </Panel>

      <div className="day-lab-two-column">
        <Panel eyebrow="Side-by-side" title="Performance comparison">
          <div className="day-lab-table" role="table" aria-label="Day performance comparison">
            <div className="day-lab-table-row day-lab-table-head" role="row">
              <span role="columnheader">Metric</span>
              <span role="columnheader">{selectedLabel}</span>
              <span role="columnheader">{comparisonLabel}</span>
              <span role="columnheader">Difference</span>
            </div>
            {rows.map((row) => (
              <div className="day-lab-table-row" role="row" key={row.label}>
                <strong role="cell">{row.label}</strong>
                <span role="cell">{formatMetric(row.selected, row.unit, row.kind)}</span>
                <span role="cell">{formatMetric(row.comparison, row.unit, row.kind)}</span>
                <span role="cell">{deltaText(row.selected, row.comparison)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Evidence observations" title="What was measurably different?">
          <div className="day-lab-observations">
            {observations.map((item) => (
              <p key={item}><ArrowLeftRight size={15} /> {item}</p>
            ))}
            <p><CalendarDays size={15} /> Telemetry coverage: {(selectedSummary.coverage * 100).toFixed(1)}% for the selected comparison window.</p>
            <p><ShieldAlert size={15} /> Correlated operational evidence: {incidents.length} incident(s) and {events.length} event(s) overlap the selected day.</p>
          </div>
          <p className="muted day-lab-causality-note">
            These are comparative observations, not causal claims. Use the correlated evidence list and Site Replay to inspect what was happening around a divergence.
          </p>
        </Panel>
      </div>

      <Panel eyebrow="Correlated evidence" title="Events and incidents on the selected day">
        {!events.length && !incidents.length ? (
          <EmptyState title="No correlated event evidence">No stored event or incident overlaps this selected interval.</EmptyState>
        ) : (
          <div className="day-lab-evidence-list">
            {incidents.map((incident) => (
              <article key={incident.incident_uid}>
                <StatusBadge status={incident.severity} />
                <div>
                  <strong>{incident.title}</strong>
                  <span>{incident.summary}</span>
                  <small>{dateTime(incident.opened_at)} · {incident.confidence}</small>
                </div>
                <Link className="secondary-button" to={replayUrlForTimestamp(incident.opened_at, 60)}>
                  Replay ±1h
                </Link>
              </article>
            ))}
            {events.map((event: SystemEvent, index) => (
              <article key={String(event.id ?? `${event.observed_at}-${index}`)}>
                <StatusBadge status={event.severity || 'observed'} />
                <div>
                  <strong>{String(event.event_type || 'system event').replace(/_/g, ' ')}</strong>
                  <span>{event.message || 'Recorded system event'}</span>
                  <small>{dateTime(event.observed_at)}</small>
                </div>
                {event.observed_at && (
                  <Link className="secondary-button" to={replayUrlForTimestamp(event.observed_at, 60)}>
                    Replay ±1h
                  </Link>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      <div className="day-lab-semantics-note">
        <strong>Day Lab semantics</strong>
        <span>
          Solar and charge energy are derived from available 15-minute normalized power buckets and are shown with coverage. Controller daily-charge counters remain a separate row. Historical medians use prior days only, and missing buckets are not interpolated.
        </span>
      </div>
    </div>
  )
}
