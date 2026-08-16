import type { SystemHistory, SystemHistoryPoint } from './system-api'

export interface DayLabHistories {
  solar?: SystemHistory
  output?: SystemHistory
  voltage?: SystemHistory
  current?: SystemHistory
  dailyCharge?: SystemHistory
}

export interface DaySummary {
  day: string
  solarInputWh?: number
  chargeOutputWh?: number
  peakSolarW?: number
  peakChargeW?: number
  maxBatteryV?: number
  avgChargeA?: number
  dailyChargeWh?: number
  coverage: number
  observedBuckets: number
  expectedBuckets: number
}

export interface CurvePoint {
  minute: number
  value: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function localDayKey(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return localDayKey(date)
}

export function dayBounds(day: string): { from: string; to: string } {
  const start = new Date(`${day}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

export function numericPointValue(point: SystemHistoryPoint): number | undefined {
  const candidates = [point.avg, point.last, point.value, point.first]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
  }
  return undefined
}

function pointTimestamp(point: SystemHistoryPoint): Date | undefined {
  const raw = point.bucket_start ?? point.observed_at
  if (!raw) return undefined
  const date = new Date(raw)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function curveForDay(
  history: SystemHistory | undefined,
  day: string,
  throughMinute = 1439,
): CurvePoint[] {
  return (history?.points ?? [])
    .flatMap((point) => {
      const date = pointTimestamp(point)
      const value = numericPointValue(point)
      if (!date || value === undefined || localDayKey(date) !== day) return []
      const minute = minuteOfDay(date)
      if (minute > throughMinute) return []
      return [{ minute, value }]
    })
    .sort((left, right) => left.minute - right.minute)
}

export function median(values: number[]): number | undefined {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return undefined
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function maxValue(points: CurvePoint[]): number | undefined {
  return points.length ? Math.max(...points.map((point) => point.value)) : undefined
}

function averageValue(points: CurvePoint[]): number | undefined {
  return points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : undefined
}

function integrateWh(points: CurvePoint[], bucketMinutes: number): number | undefined {
  if (!points.length) return undefined
  return points.reduce((sum, point) => sum + point.value * (bucketMinutes / 60), 0)
}

function counterValue(points: CurvePoint[]): number | undefined {
  if (!points.length) return undefined
  return points[points.length - 1]?.value
}

export function summarizeDay(
  histories: DayLabHistories,
  day: string,
  bucketMinutes = 15,
  throughMinute = 1439,
): DaySummary {
  const solar = curveForDay(histories.solar, day, throughMinute)
  const output = curveForDay(histories.output, day, throughMinute)
  const voltage = curveForDay(histories.voltage, day, throughMinute)
  const current = curveForDay(histories.current, day, throughMinute)
  const dailyCharge = curveForDay(histories.dailyCharge, day, throughMinute)
  const series = [solar, output, voltage, current].filter((points) => points.length)
  const expectedBuckets = Math.max(1, Math.ceil((Math.min(1439, throughMinute) + 1) / bucketMinutes))
  const observedBuckets = series.length
    ? Math.round(series.reduce((sum, points) => sum + Math.min(points.length, expectedBuckets), 0) / series.length)
    : 0

  return {
    day,
    solarInputWh: integrateWh(solar, bucketMinutes),
    chargeOutputWh: integrateWh(output, bucketMinutes),
    peakSolarW: maxValue(solar),
    peakChargeW: maxValue(output),
    maxBatteryV: maxValue(voltage),
    avgChargeA: averageValue(current),
    dailyChargeWh: counterValue(dailyCharge),
    coverage: expectedBuckets ? Math.min(1, observedBuckets / expectedBuckets) : 0,
    observedBuckets,
    expectedBuckets,
  }
}

function numericSummaryField(
  summaries: DaySummary[],
  field: keyof Pick<
    DaySummary,
    | 'solarInputWh'
    | 'chargeOutputWh'
    | 'peakSolarW'
    | 'peakChargeW'
    | 'maxBatteryV'
    | 'avgChargeA'
    | 'dailyChargeWh'
  >,
): number | undefined {
  return median(
    summaries.flatMap((summary) => {
      const value = summary[field]
      return typeof value === 'number' && Number.isFinite(value) ? [value] : []
    }),
  )
}

export function medianSummary(summaries: DaySummary[], label: string): DaySummary {
  return {
    day: label,
    solarInputWh: numericSummaryField(summaries, 'solarInputWh'),
    chargeOutputWh: numericSummaryField(summaries, 'chargeOutputWh'),
    peakSolarW: numericSummaryField(summaries, 'peakSolarW'),
    peakChargeW: numericSummaryField(summaries, 'peakChargeW'),
    maxBatteryV: numericSummaryField(summaries, 'maxBatteryV'),
    avgChargeA: numericSummaryField(summaries, 'avgChargeA'),
    dailyChargeWh: numericSummaryField(summaries, 'dailyChargeWh'),
    coverage: median(summaries.map((summary) => summary.coverage)) ?? 0,
    observedBuckets: Math.round(median(summaries.map((summary) => summary.observedBuckets)) ?? 0),
    expectedBuckets: Math.round(median(summaries.map((summary) => summary.expectedBuckets)) ?? 0),
  }
}

export function medianCurve(
  history: SystemHistory | undefined,
  days: string[],
  throughMinute = 1439,
): CurvePoint[] {
  const valuesByMinute = new Map<number, number[]>()
  for (const day of days) {
    for (const point of curveForDay(history, day, throughMinute)) {
      const bucket = valuesByMinute.get(point.minute) ?? []
      bucket.push(point.value)
      valuesByMinute.set(point.minute, bucket)
    }
  }
  return [...valuesByMinute.entries()]
    .flatMap(([minute, values]) => {
      const value = median(values)
      return value === undefined ? [] : [{ minute, value }]
    })
    .sort((left, right) => left.minute - right.minute)
}

export function percentDelta(value?: number, baseline?: number): number | undefined {
  if (value === undefined || baseline === undefined || baseline === 0) return undefined
  return ((value - baseline) / Math.abs(baseline)) * 100
}

export function replayUrlForTimestamp(timestamp: string, radiusMinutes = 60): string {
  const at = new Date(timestamp)
  const radius = radiusMinutes * 60_000
  const params = new URLSearchParams({
    at: at.toISOString(),
    from: new Date(at.getTime() - radius).toISOString(),
    to: new Date(at.getTime() + radius).toISOString(),
  })
  return `/site/replay?${params.toString()}`
}
