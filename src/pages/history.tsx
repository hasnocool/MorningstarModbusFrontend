import * as echarts from 'echarts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, BarChart3, Clock3, Download, Layers3, RotateCcw } from 'lucide-react'
import { useDeviceRoute } from '../app'
import { ApiError, useHistory, useLatest, useRegisterStats } from '../api'
import { ErrorState, LoadingState, Panel, SummaryStat } from '../components'
import { formatValue, rangeForPreset, valueOf } from '../lib'

const PRESETS = ['1h', '6h', '24h', '7d', '30d']
const RESOLUTIONS = ['auto', 'raw', '1m', '5m', '15m', '1h', '1d']

function HistoryChart({
  series,
}: {
  series: Array<{
    name: string
    unit?: string | null
    kind?: string
    points: Array<Record<string, unknown>>
  }>
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    const numeric = series.filter((item) => item.kind !== 'text')
    const state = series.filter((item) => item.kind === 'text')

    const option = {
      animation: false,
      backgroundColor: 'transparent',
      textStyle: {
        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: 'rgba(10, 14, 20, 0.96)',
        borderColor: 'rgba(148, 163, 184, 0.25)',
        textStyle: { color: '#f8fafc' },
      },
      legend: {
        type: 'scroll',
        top: 0,
        textStyle: { color: 'inherit' },
      },
      grid: {
        left: 56,
        right: 24,
        top: 42,
        bottom: state.length ? 76 : 44,
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: 'rgba(148,163,184,.25)' } },
        splitLine: { show: true, lineStyle: { color: 'rgba(148,163,184,.08)' } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLine: { lineStyle: { color: 'rgba(148,163,184,.25)' } },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,.08)' } },
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        { type: 'slider', height: 18, bottom: 8, borderColor: 'transparent' },
      ],
      series: [
        ...numeric.flatMap((item) => {
          const avg = item.points.map((point) => [
            point.bucket_start ?? point.observed_at,
            point.avg ?? point.value ?? point.last,
          ])
          const min = item.points.map((point) => [
            point.bucket_start ?? point.observed_at,
            point.min ?? point.value,
          ])
          const max = item.points.map((point) => [
            point.bucket_start ?? point.observed_at,
            point.max ?? point.value,
          ])
          const envelope = item.points.some(
            (point) => point.min !== undefined && point.max !== undefined,
          )

          const base: any[] = [
            {
              name: item.name,
              type: 'line',
              showSymbol: false,
              connectNulls: false,
              data: avg,
              smooth: false,
              lineStyle: { width: 2 },
              emphasis: { focus: 'series' },
            },
          ]

          if (envelope) {
            base.push(
              {
                name: `${item.name} min`,
                type: 'line',
                showSymbol: false,
                data: min,
                lineStyle: { width: 1, opacity: 0.28, type: 'dashed' },
                tooltip: { show: false },
              },
              {
                name: `${item.name} max`,
                type: 'line',
                showSymbol: false,
                data: max,
                lineStyle: { width: 1, opacity: 0.28, type: 'dashed' },
                tooltip: { show: false },
              },
            )
          }
          return base
        }),
      ],
    }

    chart.setOption(option as any)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [series])

  return <div ref={ref} className="history-chart" role="img" aria-label="Historical telemetry chart" />
}

function StateTimeline({
  series,
}: {
  series: Array<{
    name: string
    kind?: string
    points: Array<Record<string, unknown>>
  }>
}) {
  const stateSeries = series.filter((item) => item.kind === 'text')
  if (!stateSeries.length) return null

  return (
    <Panel eyebrow="Categorical telemetry" title="State transitions">
      <div className="state-timeline-list">
        {stateSeries.map((item) => (
          <div className="state-timeline-row" key={item.name}>
            <code>{item.name}</code>
            <div className="state-segments">
              {item.points.slice(-80).map((point, index) => (
                <span
                  key={`${item.name}-${index}`}
                  title={`${String(point.bucket_start ?? point.observed_at ?? '')}: ${String(
                    point.last ?? point.value ?? point.first ?? 'unknown',
                  )}`}
                  data-state={String(point.last ?? point.value ?? point.first ?? 'unknown')}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default function HistoryPage() {
  const { deviceId } = useDeviceRoute()
  const latest = useLatest(deviceId)
  const [preset, setPreset] = useState('24h')
  const [resolution, setResolution] = useState('auto')
  const available = useMemo(
    () => [...(latest.data?.values ?? [])].sort((a, b) => a.address - b.address),
    [latest.data?.values],
  )
  const defaultNames = useMemo(() => {
    const priorities = [
      'battery_voltage',
      'array_voltage',
      'battery_charge_current',
      'charge_current',
      'output_power',
      'input_power',
      'charge_state',
    ]
    const names = available.map((item) => item.register_name)
    const selected = priorities.filter((candidate) => names.includes(candidate))
    return selected.length ? selected.slice(0, 4) : names.slice(0, 4)
  }, [available])
  const [selectedNames, setSelectedNames] = useState<string[]>([])

  useEffect(() => {
    if (!selectedNames.length && defaultNames.length) setSelectedNames(defaultNames)
  }, [defaultNames, selectedNames.length])

  const range = useMemo(() => rangeForPreset(preset), [preset])
  const effectiveResolution = resolution === 'auto' ? range.resolution : resolution
  const history = useHistory(
    deviceId,
    selectedNames,
    range.from,
    range.to,
    effectiveResolution,
  )
  const stats = useRegisterStats(deviceId, selectedNames, range.from, range.to)

  const toggle = (name: string) => {
    setSelectedNames((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : current.length >= 8
          ? current
          : [...current, name],
    )
  }

  const tooLarge = history.error instanceof ApiError && history.error.status === 413

  return (
    <div className="page">
      <div className="page-heading">
        <span className="eyebrow">Time-series laboratory</span>
        <h1>Historical telemetry</h1>
        <p>
          Compare multiple controller registers, preserve min/max excursions, and inspect state
          transitions without downloading every raw sample.
        </p>
      </div>

      <div className="history-toolbar panel">
        <div>
          <label>Time range</label>
          <div className="segmented">
            {PRESETS.map((item) => (
              <button
                key={item}
                className={preset === item ? 'active' : ''}
                onClick={() => setPreset(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>Resolution</label>
          <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
            {RESOLUTIONS.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="history-toolbar-meta">
          <span>
            <Clock3 size={15} /> {effectiveResolution}
          </span>
          <button className="secondary-button" onClick={() => void history.refetch()}>
            <RotateCcw size={15} /> Refresh
          </button>
        </div>
      </div>

      <div className="history-layout">
        <Panel eyebrow="Series" title="Registers" className="series-picker">
          <p className="muted">Choose up to eight series. Numeric and state data are rendered differently.</p>
          <div className="series-list">
            {available.map((register) => (
              <label key={register.register_name}>
                <input
                  type="checkbox"
                  checked={selectedNames.includes(register.register_name)}
                  onChange={() => toggle(register.register_name)}
                />
                <span>
                  <code>{register.register_name}</code>
                  <small>{formatValue(valueOf(register), register.unit)}</small>
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <div className="history-main">
          <Panel
            eyebrow="Telemetry"
            title={`${preset} · ${effectiveResolution}`}
            action={<Layers3 size={18} />}
          >
            {history.isLoading && <LoadingState label="Querying telemetry history…" />}
            {tooLarge && (
              <div className="error-state">
                <AlertTriangle size={20} />
                <div>
                  <strong>Too many raw observations</strong>
                  <div className="muted">
                    Use a coarser resolution or shorter time window. The backend protected this
                    request from creating an oversized response.
                  </div>
                </div>
              </div>
            )}
            {history.isError && !tooLarge && <ErrorState title="History query failed" />}
            {history.data && history.data.series.length > 0 && (
              <HistoryChart series={history.data.series as any} />
            )}
            {history.data && history.data.series.length === 0 && (
              <div className="empty-state">No telemetry exists in this range.</div>
            )}
          </Panel>

          {history.data && <StateTimeline series={history.data.series as any} />}

          <Panel eyebrow="Window statistics" title="Summary">
            <div className="summary-grid compact-summary">
              {(stats.data?.registers ?? []).slice(0, 8).map((stat, index) => (
                <SummaryStat
                  key={String(stat.name ?? stat.register_name ?? index)}
                  label={String(stat.name ?? stat.register_name ?? 'Register')}
                  value={
                    stat.kind === 'text'
                      ? String(stat.last ?? '—')
                      : formatValue(stat.avg ?? stat.last, stat.unit as string | undefined)
                  }
                  helper={
                    stat.kind === 'text'
                      ? `${stat.transitions ?? 0} transitions`
                      : `min ${formatValue(stat.min, stat.unit as string | undefined)} · max ${formatValue(
                          stat.max,
                          stat.unit as string | undefined,
                        )}`
                  }
                  icon={<BarChart3 size={18} />}
                />
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="history-footnote">
        <Download size={15} />
        Raw and aggregated exports are available from the Data page.
      </div>
    </div>
  )
}
