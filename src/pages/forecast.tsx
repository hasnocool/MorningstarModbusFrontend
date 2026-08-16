import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use as registerECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useMemo, useRef } from 'react'
import {
  BarChart3,
  BatteryCharging,
  CalendarClock,
  CloudOff,
  Gauge,
  History,
  Sun,
  Target,
} from 'lucide-react'
import { useControllers } from '../controller-api'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatusBadge,
  SummaryStat,
} from '../components'
import {
  useForecastAccuracy,
  useSystemForecast,
  type SolarForecast,
} from '../forecast-api'
import { useSystems, useSystemStream } from '../system-api'

registerECharts([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
])

function formatEnergy(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} kWh`
  return `${value.toFixed(0)} Wh`
}

function formatPower(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(value >= 100 ? 0 : 1)} W`
}

function formatPercent(
  value?: number | null,
  options: { ratio?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const percent = options.ratio ? value * 100 : value
  return `${percent.toFixed(0)}%`
}

function formatTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function ForecastChart({ solar }: { solar: SolarForecast }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = init(ref.current)
    chart.setOption({
      animation: false,
      backgroundColor: 'transparent',
      textStyle: {
        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
      },
      tooltip: { trigger: 'axis', confine: true },
      legend: { type: 'scroll', top: 0, textStyle: { color: 'inherit' } },
      grid: { left: 58, right: 24, top: 44, bottom: 42 },
      xAxis: { type: 'time' },
      yAxis: { type: 'value', min: 0, name: 'W' },
      series: [
        {
          name: 'Observed',
          type: 'line',
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 3 },
          data: solar.curve.map((point) => [point.at, point.observed_w ?? null]),
        },
        {
          name: 'P50 expected',
          type: 'line',
          showSymbol: false,
          connectNulls: true,
          lineStyle: { width: 2 },
          data: solar.curve.map((point) => [point.at, point.p50_w ?? null]),
        },
        {
          name: 'P10 low',
          type: 'line',
          showSymbol: false,
          connectNulls: true,
          lineStyle: { width: 1, type: 'dashed', opacity: 0.7 },
          data: solar.curve.map((point) => [point.at, point.p10_w ?? null]),
        },
        {
          name: 'P90 high',
          type: 'line',
          showSymbol: false,
          connectNulls: true,
          lineStyle: { width: 1, type: 'dashed', opacity: 0.7 },
          data: solar.curve.map((point) => [point.at, point.p90_w ?? null]),
        },
      ],
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [solar])

  return (
    <div
      ref={ref}
      className="forecast-chart"
      role="img"
      aria-label="Observed solar input and P10 P50 P90 forecast chart"
    />
  )
}

export default function ForecastPage() {
  const systems = useSystems()
  const systemUid = systems.data?.[0]?.system_uid
  const forecast = useSystemForecast(systemUid)
  const accuracy = useForecastAccuracy(systemUid)
  const controllers = useControllers()
  const streamState = useSystemStream(systemUid)
  const labels = useMemo(
    () =>
      new Map(
        (controllers.data ?? []).map((controller) => [
          controller.controller_uid,
          controller.model ||
            controller.product_code ||
            controller.profile ||
            controller.controller_uid,
        ]),
      ),
    [controllers.data],
  )

  if (systems.isLoading) return <LoadingState label="Loading site forecast context…" />
  if (systems.isError) return <ErrorState title="Site inventory unavailable" />
  if (!systemUid) {
    return (
      <EmptyState title="No site is configured">
        Predictive operations becomes available after the backend begins retaining normalized site
        history.
      </EmptyState>
    )
  }
  if (forecast.isLoading) return <LoadingState label="Building local solar outlook…" />
  if (forecast.isError || !forecast.data) {
    return (
      <ErrorState
        title="Predictive operations unavailable"
        detail="This page requires a MorningstarModbusAPI build with predictive forecast endpoints."
      />
    )
  }

  const payload = forecast.data
  const solar = payload.solar
  const energy = solar.energy
  const progress = energy.progress_ratio ?? 0

  return (
    <div className="page forecast-page">
      <div className="page-heading forecast-heading">
        <div>
          <span className="eyebrow">v0.4 predictive operations</span>
          <h1>Solar day planner</h1>
          <p>
            Estimate the rest of today's solar-input envelope and charging outcome from local history.
            Uncertainty, evidence and provenance stay visible; the frontend never controls hardware.
          </p>
        </div>
        <div className="forecast-heading-status">
          <StatusBadge status={payload.status} />
          <StatusBadge status={payload.confidence} label={`${payload.confidence} confidence`} />
          <StatusBadge
            status={streamState === 'connected' ? 'online' : 'warning'}
            label={`SSE ${streamState}`}
          />
        </div>
      </div>

      {payload.status !== 'ready' && (
        <div className="forecast-evidence-notice">
          <History size={19} />
          <div>
            <strong>More history is needed for a calibrated forecast.</strong>
            <span>
              {solar.training_days} qualifying prior days are currently available. Insufficient evidence
              stays explicit instead of becoming a made-up prediction.
            </span>
          </div>
        </div>
      )}

      <div className="forecast-summary-grid">
        <SummaryStat
          label="Solar now"
          value={formatPower(solar.current_power_w)}
          helper={`${solar.training_days} training days`}
          icon={<Sun size={18} />}
        />
        <SummaryStat
          label="Observed input today"
          value={formatEnergy(energy.observed_input_wh)}
          helper="15-minute local integration"
          icon={<Gauge size={18} />}
        />
        <SummaryStat
          label="Expected remaining"
          value={formatEnergy(energy.remaining_p50_wh)}
          helper={`${formatEnergy(energy.remaining_p10_wh)} – ${formatEnergy(energy.remaining_p90_wh)}`}
          icon={<CalendarClock size={18} />}
        />
        <SummaryStat
          label="Projected EOD"
          value={formatEnergy(energy.eod_p50_wh)}
          helper={`${formatEnergy(energy.eod_p10_wh)} – ${formatEnergy(energy.eod_p90_wh)}`}
          icon={<Target size={18} />}
        />
        <SummaryStat
          label="Reach Float"
          value={formatPercent(payload.charge.all_controllers_float_probability, { ratio: true })}
          helper="conservative all-controller probability"
          icon={<BatteryCharging size={18} />}
        />
        <SummaryStat
          label="Expected Float"
          value={formatTime(payload.charge.expected_all_controllers_float_at)}
          helper="latest expected controller completion"
          icon={<BatteryCharging size={18} />}
        />
      </div>

      <Panel eyebrow="Expected vs actual" title="Today's solar-input trajectory">
        {solar.curve.length ? (
          <ForecastChart solar={solar} />
        ) : (
          <EmptyState title="No forecast curve yet">
            Several sufficiently observed prior days are required before percentile bands are available.
          </EmptyState>
        )}
        <div className="forecast-progress-row">
          <div>
            <span>Progress vs historical P50 by this time</span>
            <strong>{formatPercent(energy.progress_ratio, { ratio: true })}</strong>
          </div>
          <div className="forecast-progress-track" aria-label="Progress versus expected solar energy">
            <span style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
          </div>
          <small>
            Expected by now {formatEnergy(energy.expected_so_far_p50_wh)} · observed{' '}
            {formatEnergy(energy.observed_input_wh)}
          </small>
        </div>
      </Panel>

      <div className="forecast-two-column">
        <Panel eyebrow="Charge-cycle outlook" title="Will the controllers reach Float?">
          <div className="charge-forecast-list">
            {payload.charge.controllers.length ? (
              payload.charge.controllers.map((controller) => (
                <div className="charge-forecast-card" key={controller.controller_uid}>
                  <div>
                    <strong>{labels.get(controller.controller_uid) ?? controller.controller_uid}</strong>
                    <StatusBadge status={controller.current_state || controller.status} />
                  </div>
                  <dl>
                    <div>
                      <dt>Float probability</dt>
                      <dd>{formatPercent(controller.float_probability, { ratio: true })}</dd>
                    </div>
                    <div>
                      <dt>Expected Float</dt>
                      <dd>{formatTime(controller.expected_float_at)}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>{controller.float_days}/{controller.training_days} days reached Float</dd>
                    </div>
                    <div>
                      <dt>Confidence</dt>
                      <dd>{controller.confidence}</dd>
                    </div>
                  </dl>
                </div>
              ))
            ) : (
              <div className="muted">No controller charge-state history is available yet.</div>
            )}
          </div>
        </Panel>

        <Panel eyebrow="Model provenance" title="Why this forecast exists">
          <div className="forecast-provenance-grid">
            <div>
              <CloudOff size={19} />
              <span>Internet required</span>
              <strong>{solar.provenance.internet_required ? 'Yes' : 'No'}</strong>
            </div>
            <div>
              <CloudOff size={19} />
              <span>Weather used</span>
              <strong>{solar.provenance.weather_used ? 'Yes' : 'No'}</strong>
            </div>
            <div>
              <History size={19} />
              <span>History window</span>
              <strong>{solar.history_days} days</strong>
            </div>
            <div>
              <BarChart3 size={19} />
              <span>Model</span>
              <strong>{solar.provenance.model || payload.model.name || 'local percentile'}</strong>
            </div>
          </div>
          <p className="muted forecast-semantics">{payload.semantics}</p>
          <p className="muted forecast-semantics">{energy.integration_semantics}</p>
        </Panel>
      </div>

      <Panel eyebrow="Backtesting" title="How accurate has the local model been?">
        {accuracy.isLoading ? (
          <LoadingState label="Replaying completed forecast days…" />
        ) : accuracy.isError || !accuracy.data ? (
          <ErrorState title="Forecast calibration unavailable" />
        ) : (
          <>
            <div className="forecast-accuracy-grid">
              <SummaryStat label="Evaluated days" value={accuracy.data.evaluated_days} />
              <SummaryStat
                label="Median EOD error"
                value={formatPercent(accuracy.data.median_absolute_error_percent)}
              />
              <SummaryStat
                label="P90 EOD error"
                value={formatPercent(accuracy.data.p90_absolute_error_percent)}
              />
              <SummaryStat
                label="P10–P90 coverage"
                value={formatPercent(accuracy.data.p10_p90_interval_coverage, { ratio: true })}
              />
            </div>
            <p className="muted forecast-semantics">{accuracy.data.methodology}</p>
          </>
        )}
      </Panel>
    </div>
  )
}
