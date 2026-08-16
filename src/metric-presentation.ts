import type { SystemMetricReading } from './system-api'

export type MetricAvailability = 'available' | 'conflict' | 'unsupported' | 'unavailable'

export function hasMetricValue(reading?: SystemMetricReading): boolean {
  return reading?.value !== undefined && reading?.value !== null
}

export function metricAvailability(reading?: SystemMetricReading): MetricAvailability {
  if (hasMetricValue(reading)) return 'available'
  if (
    reading?.quality === 'conflict' ||
    reading?.status === 'conflict' ||
    reading?.resolution === 'conflict'
  ) {
    return 'conflict'
  }
  if (reading?.expected_contributors === 0 && (reading.contributors ?? 0) === 0) {
    return 'unsupported'
  }
  return 'unavailable'
}

export function metricPresentationLabel(reading?: SystemMetricReading): string {
  switch (metricAvailability(reading)) {
    case 'available':
      return reading?.quality || reading?.status || 'observed'
    case 'conflict':
      return 'conflicting sources'
    case 'unsupported':
      return 'unsupported by enrolled hardware'
    case 'unavailable':
      return reading?.expected_contributors && reading.expected_contributors > 0
        ? 'not currently observed'
        : 'not available'
  }
}

export function metricPresentationReason(reading?: SystemMetricReading): string {
  if (typeof reading?.reason === 'string' && reading.reason.trim()) return reading.reason

  switch (metricAvailability(reading)) {
    case 'available':
      return ''
    case 'conflict':
      return 'Multiple source-backed observations disagree, so the backend keeps this value unknown.'
    case 'unsupported':
      return 'No enrolled controller profile advertises a source register for this normalized metric.'
    case 'unavailable':
      if (reading?.expected_contributors && reading.expected_contributors > 0) {
        return `${reading.expected_contributors} eligible controller source(s) exist, but no current observation is available.`
      }
      return 'No source-backed measurement is currently available; the UI does not infer one.'
  }
}

export function exactKwhFromWh(reading?: SystemMetricReading): SystemMetricReading | undefined {
  if (typeof reading?.value !== 'number') return undefined
  return {
    value: reading.value / 1000,
    unit: 'kWh',
    quality: 'derived',
    status: 'derived',
    source_metric: 'daily_charge_wh',
    formula: 'daily_charge_wh / 1000',
    reason: 'Exact unit conversion from the source-backed daily Wh counter.',
    contributors: reading.contributors,
    expected_contributors: reading.expected_contributors,
  }
}
