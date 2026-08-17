import { percentDelta, replayUrlForTimestamp, type DaySummary } from './day-lab'
import type { ForecastAccuracy, SystemForecast } from './forecast-api'
import type { HealthScore, IntelligenceIncident, SolarBaseline } from './intelligence-api'
import { metricAvailability } from './metric-presentation'
import type { SystemHealth, SystemMetricReading } from './system-api'

export type OperatorAnswerCategory =
  | 'Now'
  | 'Forecast'
  | 'Performance'
  | 'Health'
  | 'Data quality'
  | 'Investigation'

export type OperatorAnswerStatus = 'online' | 'warning' | 'critical' | 'observed' | 'unknown'

export interface OperatorAnswer {
  id: string
  category: OperatorAnswerCategory
  question: string
  answer: string
  detail: string
  evidence: string[]
  status: OperatorAnswerStatus
  confidence?: string
  href: string
  actionLabel: string
  keywords: string[]
}

export interface OperatorAnswerInput {
  latestMetrics?: Record<string, SystemMetricReading>
  health?: SystemHealth
  healthScore?: HealthScore
  incidents?: IntelligenceIncident[]
  baseline?: SolarBaseline
  forecast?: SystemForecast
  accuracy?: ForecastAccuracy
  today?: DaySummary
  recentMedian?: DaySummary
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readingNumber(reading?: SystemMetricReading): number | undefined {
  return numberValue(reading?.value)
}

function readingText(reading?: SystemMetricReading): string | undefined {
  if (reading?.value === undefined || reading.value === null) return undefined
  const unit = reading.unit ? ` ${reading.unit}` : ''
  if (typeof reading.value === 'number') {
    const digits = Math.abs(reading.value) >= 100 ? 0 : Math.abs(reading.value) >= 10 ? 1 : 2
    return `${reading.value.toFixed(digits)}${unit}`
  }
  return `${String(reading.value)}${unit}`
}

function energy(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'unknown'
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(2)} kWh` : `${Math.round(value)} Wh`
}

function power(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'unknown'
  return `${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)} W`
}

function percentRatio(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'unknown'
  return `${(value * 100).toFixed(0)}%`
}

function percentValue(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return 'unknown'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function localTime(value?: string | null): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'unknown'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function severityRank(value?: string): number {
  if (value === 'critical') return 3
  if (value === 'warning') return 2
  if (value === 'info') return 1
  return 0
}

function deltaStatus(delta?: number, threshold = 10): OperatorAnswerStatus {
  if (delta === undefined) return 'unknown'
  return Math.abs(delta) >= threshold ? 'warning' : 'online'
}

function answer(
  id: string,
  category: OperatorAnswerCategory,
  question: string,
  value: string,
  detail: string,
  evidence: string[],
  status: OperatorAnswerStatus,
  href: string,
  actionLabel: string,
  keywords: string[],
  confidence?: string,
): OperatorAnswer {
  return {
    id,
    category,
    question,
    answer: value,
    detail,
    evidence,
    status,
    href,
    actionLabel,
    keywords,
    confidence,
  }
}

export function buildOperatorAnswers(input: OperatorAnswerInput): OperatorAnswer[] {
  const metrics = input.latestMetrics ?? {}
  const incidents = [...(input.incidents ?? [])].sort(
    (left, right) =>
      severityRank(right.severity) - severityRank(left.severity) ||
      right.opened_at.localeCompare(left.opened_at),
  )
  const critical = incidents.filter((incident) => incident.severity === 'critical').length
  const warning = incidents.filter((incident) => incident.severity === 'warning').length
  const topIncident = incidents[0]
  const forecast = input.forecast
  const solar = forecast?.solar
  const solarEnergy = solar?.energy
  const baseline = input.baseline
  const today = input.today
  const median = input.recentMedian
  const solarDelta = percentDelta(today?.solarInputWh, median?.solarInputWh)
  const chargeDelta = percentDelta(today?.chargeOutputWh, median?.chargeOutputWh)
  const batteryDelta = percentDelta(today?.maxBatteryV, median?.maxBatteryV)
  const healthScore = input.healthScore
  const health = input.health
  const controllerCount = health?.controller_count ?? 0
  const onlineControllers = health?.online_controllers ?? 0
  const progress = solarEnergy?.progress_ratio
  const floatProbability = forecast?.charge.all_controllers_float_probability
  const eodP50 = solarEnergy?.eod_p50_wh
  const eodP10 = solarEnergy?.eod_p10_wh
  const eodP90 = solarEnergy?.eod_p90_wh
  const uncertaintyWidth =
    numberValue(eodP50) && numberValue(eodP10) !== undefined && numberValue(eodP90) !== undefined
      ? ((numberValue(eodP90) ?? 0) - (numberValue(eodP10) ?? 0)) / Math.abs(numberValue(eodP50) ?? 1)
      : undefined

  const batteryVoltage = metrics.battery_voltage_v
  const chargeCurrent = metrics.battery_charge_current_a
  const chargeState = metrics.charge_state
  const solarNow = metrics.solar_input_power_w
  const primaryNames = [
    'solar_input_power_w',
    'charge_output_power_w',
    'battery_voltage_v',
    'battery_charge_current_a',
  ]
  const primaryReadings = primaryNames.map((name) => metrics[name])
  const conflicts = Object.entries(metrics).filter(([, reading]) =>
    reading?.quality === 'conflict' || reading?.status === 'conflict',
  )
  const unsupported = primaryReadings.filter((reading) => metricAvailability(reading) === 'unsupported').length
  const unavailable = primaryReadings.filter((reading) => metricAvailability(reading) === 'unavailable').length

  const healthStatus: OperatorAnswerStatus = healthScore
    ? healthScore.score >= 90
      ? 'online'
      : healthScore.score >= 70
        ? 'warning'
        : 'critical'
    : health?.status === 'online'
      ? 'online'
      : health
        ? 'warning'
        : 'unknown'

  const controllersStatus: OperatorAnswerStatus = controllerCount
    ? onlineControllers === controllerCount
      ? 'online'
      : onlineControllers > 0
        ? 'warning'
        : 'critical'
    : 'unknown'

  const baselineCurrent = baseline?.current_value
  const baselineLow = baseline?.expected_low
  const baselineHigh = baseline?.expected_high
  const baselineReady = baseline?.status === 'ready'
  const baselineOutside =
    baselineReady &&
    baselineCurrent !== undefined &&
    baselineCurrent !== null &&
    ((baselineLow !== undefined && baselineLow !== null && baselineCurrent < baselineLow) ||
      (baselineHigh !== undefined && baselineHigh !== null && baselineCurrent > baselineHigh))

  const faultControllers = health?.active_fault_controllers ?? 0
  const alarmControllers = health?.active_alarm_controllers ?? 0
  const forecastError = input.accuracy?.median_absolute_error_percent
  const forecastAccuracyStatus: OperatorAnswerStatus =
    forecastError === undefined || forecastError === null
      ? 'unknown'
      : forecastError <= 15
        ? 'online'
        : forecastError <= 30
          ? 'warning'
          : 'warning'

  const trackingDifference =
    solarDelta !== undefined && chargeDelta !== undefined ? Math.abs(solarDelta - chargeDelta) : undefined

  const dataQualityStatus: OperatorAnswerStatus = conflicts.length
    ? 'critical'
    : unsupported || unavailable
      ? 'warning'
      : primaryReadings.every((reading) => metricAvailability(reading) === 'available')
        ? 'online'
        : 'unknown'

  const nextHref = topIncident
    ? replayUrlForTimestamp(topIncident.opened_at, 60)
    : solarDelta !== undefined && solarDelta < -10
      ? '/site/day-lab'
      : (today?.coverage ?? 1) < 0.8
        ? '/site/history'
        : '/site/forecast'
  const nextAction = topIncident
    ? `Replay ${topIncident.title}`
    : solarDelta !== undefined && solarDelta < -10
      ? 'Open Day Lab'
      : (today?.coverage ?? 1) < 0.8
        ? 'Inspect history'
        : 'Open day planner'
  const nextAnswer = topIncident
    ? topIncident.title
    : solarDelta !== undefined && solarDelta < -10
      ? `Investigate solar input ${Math.abs(solarDelta).toFixed(1)}% below the 7-day median`
      : (today?.coverage ?? 1) < 0.8
        ? 'Inspect incomplete telemetry coverage before interpreting performance'
        : 'No urgent evidence-backed investigation is currently identified'

  return [
    answer(
      'site-health',
      'Health',
      'How is the site doing right now?',
      healthScore ? `${healthScore.score}/100 · ${healthScore.status}` : health?.status ?? 'Unknown',
      healthScore
        ? `${healthScore.active_incidents} active incident(s); score remains decomposable in Operations Intelligence.`
        : 'The site health resource has not provided a decomposable score yet.',
      healthScore
        ? Object.entries(healthScore.components).map(([name, value]) => `${name}: ${value}/20`)
        : [],
      healthStatus,
      '/site/intelligence',
      'Open health evidence',
      ['health', 'score', 'status', 'site'],
    ),
    answer(
      'controllers-online',
      'Now',
      'Are all controllers online?',
      controllerCount ? `${onlineControllers}/${controllerCount} online` : 'Controller count unavailable',
      controllerCount && onlineControllers !== controllerCount
        ? `${controllerCount - onlineControllers} enrolled controller(s) are not currently online.`
        : 'Online count is taken from the system health resource.',
      [`online_controllers=${onlineControllers}`, `controller_count=${controllerCount}`],
      controllersStatus,
      '/devices',
      'Open controllers',
      ['controllers', 'online', 'offline', 'connection'],
    ),
    answer(
      'active-incidents',
      'Health',
      'Are there active incidents?',
      incidents.length ? `${incidents.length} active · ${critical} critical · ${warning} warning` : 'No active incidents',
      incidents.length
        ? 'Persistent backend incidents remain active until recovery is supported by evidence.'
        : 'No persistent incident currently matches an active detector condition.',
      incidents.slice(0, 3).map((incident) => `${incident.severity}: ${incident.title}`),
      critical ? 'critical' : incidents.length ? 'warning' : 'online',
      '/site/intelligence',
      'Review incidents',
      ['incident', 'fault', 'alarm', 'warning', 'critical'],
    ),
    answer(
      'attention-first',
      'Investigation',
      'What needs attention first?',
      topIncident?.title ?? 'No active incident is currently prioritized',
      topIncident?.summary ?? 'The answer layer found no active persistent incident to prioritize.',
      topIncident
        ? [`severity=${topIncident.severity}`, `confidence=${topIncident.confidence}`, `opened=${topIncident.opened_at}`]
        : [],
      topIncident?.severity === 'critical' ? 'critical' : topIncident ? 'warning' : 'online',
      topIncident ? replayUrlForTimestamp(topIncident.opened_at, 60) : '/site/intelligence',
      topIncident ? 'Replay around incident' : 'Open intelligence',
      ['priority', 'attention', 'first', 'investigate', 'incident'],
      topIncident?.confidence,
    ),
    answer(
      'solar-normal-now',
      'Performance',
      'Is solar input normal for this time of day?',
      !baselineReady
        ? 'Historical baseline is not ready'
        : baselineOutside
          ? `${power(baselineCurrent)} is outside the local P10–P90 band`
          : `${power(baselineCurrent)} is inside the local P10–P90 band`,
      baselineReady
        ? `Expected local range ${power(baselineLow)}–${power(baselineHigh)}; median ${power(baseline?.expected_median)}.`
        : 'The backend needs more comparable historical observations before this question is calibrated.',
      [
        `comparable_days=${baseline?.comparable_days ?? 0}`,
        `provenance=${baseline?.provenance ?? 'unknown'}`,
      ],
      !baselineReady ? 'unknown' : baselineOutside ? 'warning' : 'online',
      '/site/intelligence',
      'Open baseline evidence',
      ['solar', 'normal', 'baseline', 'p10', 'p90', 'now'],
      baseline?.confidence,
    ),
    answer(
      'solar-now',
      'Now',
      'How much solar power is arriving right now?',
      readingText(solarNow) ?? power(solar?.current_power_w),
      'Uses the normalized current solar-input reading when available, with forecast current power as secondary context.',
      [
        `quality=${solarNow?.quality ?? solarNow?.status ?? 'unknown'}`,
        `contributors=${solarNow?.contributors ?? 0}`,
      ],
      readingText(solarNow) || solar?.current_power_w !== undefined ? 'observed' : 'unknown',
      '/site/power',
      'Open power flow',
      ['solar', 'power', 'pv', 'watts', 'now'],
    ),
    answer(
      'battery-voltage-now',
      'Now',
      'What is battery voltage right now?',
      readingText(batteryVoltage) ?? 'Battery voltage unavailable',
      'This is the normalized battery-bus voltage evidence currently available to the site.',
      [`quality=${batteryVoltage?.quality ?? batteryVoltage?.status ?? 'unknown'}`],
      readingNumber(batteryVoltage) !== undefined ? 'observed' : 'unknown',
      '/site/power',
      'Open battery power flow',
      ['battery', 'voltage', 'volts', 'now'],
    ),
    answer(
      'charge-current-now',
      'Now',
      'What is controller charge current right now?',
      readingText(chargeCurrent) ?? 'Charge current unavailable',
      'Controller charge current is kept distinct from battery net current when no shunt-backed net-current measurement exists.',
      [`quality=${chargeCurrent?.quality ?? chargeCurrent?.status ?? 'unknown'}`],
      readingNumber(chargeCurrent) !== undefined ? 'observed' : 'unknown',
      '/site/power',
      'Open power flow',
      ['charge', 'current', 'amps', 'battery', 'now'],
    ),
    answer(
      'charge-stage-now',
      'Now',
      'What charge stage is the site in?',
      readingText(chargeState) ?? 'Charge stage unavailable',
      'The answer reports the normalized controller charge-state evidence without inferring a stage from voltage.',
      [`quality=${chargeState?.quality ?? chargeState?.status ?? 'unknown'}`],
      chargeState?.value !== undefined && chargeState.value !== null ? 'observed' : 'unknown',
      '/site/twin',
      'Open digital twin',
      ['charge', 'stage', 'mppt', 'absorption', 'float', 'state'],
    ),
    answer(
      'faults-alarms-now',
      'Health',
      'Are any controllers reporting faults or alarms?',
      faultControllers || alarmControllers
        ? `${faultControllers} with faults · ${alarmControllers} with alarms`
        : 'No controller fault/alarm flags are active',
      'Counts come from system health and remain controller-scoped rather than being converted into invented site-wide electrical values.',
      [`fault_controllers=${faultControllers}`, `alarm_controllers=${alarmControllers}`],
      faultControllers ? 'critical' : alarmControllers ? 'warning' : health ? 'online' : 'unknown',
      '/site/intelligence',
      'Open incident evidence',
      ['fault', 'alarm', 'controller', 'error'],
    ),
    answer(
      'solar-observed-today',
      'Forecast',
      'How much solar input energy have we observed today?',
      energy(solarEnergy?.observed_input_wh),
      'This is locally integrated solar-input energy from normalized power history, not the controller battery-side daily charge counter.',
      [`coverage_today=${solar?.coverage_fraction_today ?? 'unknown'}`, solarEnergy?.integration_semantics ?? '15-minute local integration'],
      solarEnergy?.observed_input_wh !== undefined && solarEnergy.observed_input_wh !== null ? 'observed' : 'unknown',
      '/site/forecast',
      'Open solar day planner',
      ['solar', 'energy', 'today', 'observed', 'generated'],
    ),
    answer(
      'solar-remaining-today',
      'Forecast',
      'How much solar is likely left today?',
      energy(solarEnergy?.remaining_p50_wh),
      `Local-history P10–P90 remaining range: ${energy(solarEnergy?.remaining_p10_wh)}–${energy(solarEnergy?.remaining_p90_wh)}.`,
      [`forecast_status=${forecast?.status ?? 'unknown'}`, `training_days=${solar?.training_days ?? 0}`],
      forecast?.status === 'ready' ? 'observed' : 'unknown',
      '/site/forecast',
      'Open forecast',
      ['solar', 'remaining', 'left', 'today', 'forecast'],
      forecast?.confidence,
    ),
    answer(
      'projected-eod',
      'Forecast',
      'What is projected total solar input by end of day?',
      energy(eodP50),
      `Projected P10–P90 end-of-day range: ${energy(eodP10)}–${energy(eodP90)}.`,
      [`model=${forecast?.model.name ?? 'unknown'}`, `confidence=${forecast?.confidence ?? 'unknown'}`],
      eodP50 !== undefined && eodP50 !== null ? 'observed' : 'unknown',
      '/site/forecast',
      'Open day planner',
      ['end of day', 'eod', 'solar', 'energy', 'projection'],
      forecast?.confidence,
    ),
    answer(
      'ahead-behind',
      'Forecast',
      'Are we ahead of or behind the normal solar trajectory?',
      progress === undefined || progress === null
        ? 'Progress comparison unavailable'
        : progress >= 1
          ? `${percentRatio(progress)} of expected-by-now solar energy · ahead/on track`
          : `${percentRatio(progress)} of expected-by-now solar energy · behind`,
      `Observed ${energy(solarEnergy?.observed_input_wh)} versus historical P50 expected-by-now ${energy(solarEnergy?.expected_so_far_p50_wh)}.`,
      [`progress_ratio=${progress ?? 'unknown'}`],
      progress === undefined || progress === null ? 'unknown' : progress >= 0.9 ? 'online' : 'warning',
      '/site/forecast',
      'Inspect trajectory',
      ['ahead', 'behind', 'expected', 'trajectory', 'progress'],
    ),
    answer(
      'forecast-uncertainty',
      'Forecast',
      'How uncertain is today’s end-of-day forecast?',
      uncertaintyWidth === undefined
        ? 'Forecast uncertainty unavailable'
        : `P10–P90 span is ${(uncertaintyWidth * 100).toFixed(0)}% of the P50 projection`,
      `${energy(eodP10)}–${energy(eodP90)} around a P50 estimate of ${energy(eodP50)}.`,
      [`confidence=${forecast?.confidence ?? 'unknown'}`, `training_days=${solar?.training_days ?? 0}`],
      uncertaintyWidth === undefined ? 'unknown' : uncertaintyWidth > 0.6 ? 'warning' : 'observed',
      '/site/forecast',
      'Inspect forecast bands',
      ['forecast', 'uncertainty', 'p10', 'p90', 'range', 'confidence'],
      forecast?.confidence,
    ),
    answer(
      'forecast-accuracy',
      'Forecast',
      'How accurate has the local forecast model been?',
      forecastError === undefined || forecastError === null
        ? 'Forecast backtest evidence unavailable'
        : `${forecastError.toFixed(1)}% median absolute error`,
      input.accuracy
        ? `${input.accuracy.evaluated_days} evaluated day(s); P10–P90 interval coverage ${percentRatio(input.accuracy.p10_p90_interval_coverage)}.`
        : 'No forecast-accuracy response is available yet.',
      [
        `mean_error=${input.accuracy?.mean_absolute_error_percent ?? 'unknown'}%`,
        `p90_error=${input.accuracy?.p90_absolute_error_percent ?? 'unknown'}%`,
      ],
      forecastAccuracyStatus,
      '/site/forecast',
      'Open forecast accuracy',
      ['forecast', 'accuracy', 'error', 'backtest', 'calibration'],
    ),
    answer(
      'reach-float',
      'Forecast',
      'Will the controllers likely reach Float today?',
      floatProbability === undefined || floatProbability === null
        ? 'Float probability unavailable'
        : `${percentRatio(floatProbability)} probability all controllers reach Float`,
      'The backend combines controller-specific historical Float outcomes conservatively for the site.',
      (forecast?.charge.controllers ?? []).map(
        (controller) => `${controller.controller_uid}: ${percentRatio(controller.float_probability)}`,
      ),
      floatProbability === undefined || floatProbability === null
        ? 'unknown'
        : floatProbability >= 0.7
          ? 'online'
          : 'warning',
      '/site/forecast',
      'Open charge outlook',
      ['float', 'battery', 'charge', 'probability', 'today'],
      forecast?.confidence,
    ),
    answer(
      'expected-float-time',
      'Forecast',
      'When should all controllers reach Float?',
      localTime(forecast?.charge.expected_all_controllers_float_at),
      'For multiple controllers, the site answer uses the latest expected completion time so it remains conservative.',
      (forecast?.charge.controllers ?? []).map(
        (controller) => `${controller.controller_uid}: ${localTime(controller.expected_float_at)}`,
      ),
      forecast?.charge.expected_all_controllers_float_at ? 'observed' : 'unknown',
      '/site/forecast',
      'Inspect controller forecasts',
      ['float', 'when', 'time', 'expected', 'charge complete'],
      forecast?.confidence,
    ),
    answer(
      'evidence-depth',
      'Data quality',
      'How much history supports the current solar outlook?',
      `${solar?.training_days ?? 0} forecast training day(s) · ${baseline?.comparable_days ?? 0} baseline comparison day(s)`,
      'Forecast and current-time baseline use separate evidence windows, so both counts remain visible.',
      [`history_days=${solar?.history_days ?? baseline?.history_days ?? 0}`, `baseline_status=${baseline?.status ?? 'unknown'}`],
      (solar?.training_days ?? 0) >= 5 && (baseline?.comparable_days ?? 0) >= 3 ? 'online' : 'warning',
      '/site/intelligence',
      'Open evidence baseline',
      ['history', 'training', 'baseline', 'evidence', 'days'],
      baseline?.confidence ?? forecast?.confidence,
    ),
    answer(
      'offline-forecast',
      'Forecast',
      'Does this forecast require internet or weather data?',
      forecast
        ? forecast.model.offline
          ? 'No · the active forecast model is offline-first'
          : 'The model is not marked offline'
        : 'Forecast model metadata unavailable',
      forecast
        ? `weather_used=${forecast.model.weather_used ?? false}; solar provenance says internet_required=${solar?.provenance.internet_required ?? false}.`
        : 'No model provenance was returned.',
      [
        `model=${forecast?.model.name ?? 'unknown'}`,
        `weather_used=${forecast?.model.weather_used ?? 'unknown'}`,
      ],
      forecast ? 'observed' : 'unknown',
      '/site/forecast',
      'Open model provenance',
      ['offline', 'internet', 'weather', 'forecast', 'model'],
    ),
    answer(
      'today-vs-seven-day-solar',
      'Performance',
      'Is today producing more or less solar input than the recent 7-day median?',
      solarDelta === undefined
        ? 'Comparable solar evidence unavailable'
        : `${percentValue(solarDelta)} versus the matched-time 7-day median`,
      `${energy(today?.solarInputWh)} today versus ${energy(median?.solarInputWh)} median over the same local-time progress.`,
      [`coverage_today=${today?.coverage ?? 0}`, `comparison_days=7`],
      deltaStatus(solarDelta, 10),
      '/site/day-lab',
      'Open Day Lab',
      ['today', '7 day', 'median', 'solar', 'performance', 'compare'],
    ),
    answer(
      'today-vs-seven-day-charge',
      'Performance',
      'Is charge output higher or lower than the recent 7-day median?',
      chargeDelta === undefined
        ? 'Comparable charge-output evidence unavailable'
        : `${percentValue(chargeDelta)} versus the matched-time 7-day median`,
      `${energy(today?.chargeOutputWh)} today versus ${energy(median?.chargeOutputWh)} median.`,
      [`coverage_today=${today?.coverage ?? 0}`, `comparison_days=7`],
      deltaStatus(chargeDelta, 10),
      '/site/day-lab',
      'Compare charge output',
      ['charge', 'output', 'today', 'median', 'performance'],
    ),
    answer(
      'input-output-tracking',
      'Performance',
      'Are solar input and charge output moving together versus recent history?',
      trackingDifference === undefined
        ? 'Comparable input/output evidence unavailable'
        : trackingDifference <= 10
          ? `Yes · their relative changes differ by ${trackingDifference.toFixed(1)} percentage points`
          : `They diverge by ${trackingDifference.toFixed(1)} percentage points`,
      `Solar change ${percentValue(solarDelta)}; charge-output change ${percentValue(chargeDelta)}. This is correlation, not a causal efficiency diagnosis.`,
      ['Both values use matched-time 15-minute normalized history.', 'No missing buckets are interpolated.'],
      trackingDifference === undefined ? 'unknown' : trackingDifference <= 10 ? 'online' : 'warning',
      '/site/day-lab',
      'Inspect comparison curves',
      ['solar', 'charge', 'tracking', 'divergence', 'efficiency'],
    ),
    answer(
      'peak-solar',
      'Performance',
      'What was today’s peak solar input compared with recent days?',
      today?.peakSolarW === undefined
        ? 'Peak solar evidence unavailable'
        : `${power(today.peakSolarW)} today · ${power(median?.peakSolarW)} 7-day median`,
      `Relative peak difference: ${percentValue(percentDelta(today?.peakSolarW, median?.peakSolarW))}.`,
      [`coverage_today=${today?.coverage ?? 0}`],
      deltaStatus(percentDelta(today?.peakSolarW, median?.peakSolarW), 15),
      '/site/day-lab',
      'Open peak comparison',
      ['peak', 'solar', 'pv', 'watts', 'today'],
    ),
    answer(
      'battery-history',
      'Performance',
      'Is today’s maximum battery voltage unusual versus recent history?',
      batteryDelta === undefined
        ? 'Comparable battery-voltage evidence unavailable'
        : `${percentValue(batteryDelta)} versus the matched-time 7-day median maximum`,
      `${today?.maxBatteryV?.toFixed(2) ?? 'unknown'} V today versus ${median?.maxBatteryV?.toFixed(2) ?? 'unknown'} V median. This is a comparison, not a battery-health diagnosis.`,
      [`coverage_today=${today?.coverage ?? 0}`],
      deltaStatus(batteryDelta, 3),
      '/site/day-lab',
      'Inspect battery comparison',
      ['battery', 'voltage', 'history', 'unusual', 'maximum'],
    ),
    answer(
      'telemetry-coverage',
      'Data quality',
      'Is telemetry coverage good enough to trust today’s comparison?',
      today
        ? `${(today.coverage * 100).toFixed(1)}% representative coverage`
        : 'Coverage evidence unavailable',
      today
        ? `${today.observedBuckets}/${today.expectedBuckets} representative 15-minute buckets are available across the primary comparison series.`
        : 'Day-level normalized history has not loaded.',
      ['Coverage is averaged across available primary normalized series.', 'Missing buckets are not interpolated.'],
      !today ? 'unknown' : today.coverage >= 0.9 ? 'online' : today.coverage >= 0.7 ? 'warning' : 'warning',
      '/site/history',
      'Inspect site history',
      ['coverage', 'telemetry', 'gaps', 'missing', 'quality', 'trust'],
    ),
    answer(
      'metric-quality',
      'Data quality',
      'Are key measurements conflicting, unsupported, or temporarily missing?',
      conflicts.length
        ? `${conflicts.length} normalized metric conflict(s)`
        : unsupported || unavailable
          ? `${unsupported} unsupported · ${unavailable} temporarily unavailable primary metric(s)`
          : 'Primary normalized measurements have current evidence',
      'The answer preserves the backend distinction between source conflict, unsupported enrolled hardware, and temporarily missing observations.',
      [
        ...conflicts.slice(0, 4).map(([name]) => `conflict: ${name}`),
        `unsupported_primary=${unsupported}`,
        `unavailable_primary=${unavailable}`,
      ],
      dataQualityStatus,
      '/site/history',
      'Inspect metric evidence',
      ['conflict', 'unsupported', 'missing', 'metric', 'quality', 'capability'],
    ),
    answer(
      'inspect-next',
      'Investigation',
      'What should I inspect next?',
      nextAnswer,
      topIncident
        ? 'The highest-severity active incident is prioritized and linked directly into historical replay around its opening time.'
        : 'The recommendation uses evidence priority only: active incidents first, then material performance divergence, then data quality, then forecast review.',
      topIncident
        ? [`severity=${topIncident.severity}`, `confidence=${topIncident.confidence}`]
        : [`solar_delta=${solarDelta ?? 'unknown'}%`, `coverage=${today?.coverage ?? 'unknown'}`],
      topIncident?.severity === 'critical'
        ? 'critical'
        : topIncident || (solarDelta !== undefined && solarDelta < -10) || (today?.coverage ?? 1) < 0.8
          ? 'warning'
          : 'online',
      nextHref,
      nextAction,
      ['next', 'inspect', 'investigate', 'recommendation', 'why'],
      topIncident?.confidence,
    ),
  ]
}

export function filterOperatorAnswers(
  answers: OperatorAnswer[],
  query: string,
  category: 'All' | OperatorAnswerCategory = 'All',
): OperatorAnswer[] {
  const normalized = query.trim().toLowerCase()
  return answers.filter((item) => {
    if (category !== 'All' && item.category !== category) return false
    if (!normalized) return true
    return [item.question, item.answer, item.detail, item.category, ...item.keywords]
      .join(' ')
      .toLowerCase()
      .includes(normalized)
  })
}
