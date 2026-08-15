import type { PropsWithChildren, ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  CircleGauge,
  Database,
  PlugZap,
  Radio,
  ServerOff,
  Sun,
} from 'lucide-react'
import type { DeviceRecord, LatestSample, RegisterValue } from './api'
import { formatRelativeTime, formatValue, metric, numericValue, valueOf } from './lib'

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: PropsWithChildren<{
  title?: string
  eyebrow?: string
  action?: ReactNode
  className?: string
}>) {
  return (
    <section className={`panel ${className}`}>
      {(title || eyebrow || action) && (
        <header className="panel-header">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function MetricCard({
  label,
  register,
  accent = 'neutral',
  icon,
  helper,
}: {
  label: string
  register?: RegisterValue
  accent?: 'solar' | 'battery' | 'charge' | 'neutral'
  icon?: ReactNode
  helper?: string
}) {
  const value = valueOf(register)
  return (
    <div className={`metric-card accent-${accent}`}>
      <div className="metric-label">
        <span>{icon}</span>
        {label}
      </div>
      <div className="metric-value">{formatValue(value, register?.unit)}</div>
      <div className="metric-foot">
        <code>{register?.register_name ?? 'register unavailable'}</code>
        {helper && <span>{helper}</span>}
      </div>
    </div>
  )
}

export function StatusBadge({
  status,
  label,
}: {
  status?: string | null
  label?: string
}) {
  const normalized = (status || 'unknown').toLowerCase()
  const tone =
    normalized.includes('online') || normalized.includes('ok') || normalized.includes('verified')
      ? 'ok'
      : normalized.includes('warn') || normalized.includes('degrad') || normalized.includes('stale')
        ? 'warning'
        : normalized.includes('error') || normalized.includes('fault') || normalized.includes('offline')
          ? 'fault'
          : 'neutral'
  return (
    <span className={`status-badge status-${tone}`}>
      <span className="status-dot" />
      {label || status || 'Unknown'}
    </span>
  )
}

export function EmptyState({
  title,
  children,
  icon = <ServerOff size={24} />,
}: PropsWithChildren<{ title: string; icon?: ReactNode }>) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  )
}

export function LoadingState({ label = 'Loading telemetry…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
      {label}
    </div>
  )
}

export function ErrorState({
  title = 'Data unavailable',
  detail,
}: {
  title?: string
  detail?: string
}) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={20} />
      <div>
        <strong>{title}</strong>
        {detail && <div className="muted">{detail}</div>}
      </div>
    </div>
  )
}

export function PowerFlow({ sample }: { sample?: LatestSample }) {
  const arrayVoltage = metric(sample, 'arrayVoltage')
  const arrayCurrent = metric(sample, 'arrayCurrent')
  const inputPower = metric(sample, 'inputPower')
  const outputPower = metric(sample, 'outputPower')
  const batteryVoltage = metric(sample, 'batteryVoltage')
  const chargeCurrent = metric(sample, 'chargeCurrent')
  const chargeState = metric(sample, 'chargeState')

  return (
    <div className="power-flow" aria-label="Solar array to charge controller to battery power flow">
      <div className="power-node solar-node">
        <Sun aria-hidden="true" />
        <strong>Solar Array</strong>
        <span>{formatValue(valueOf(arrayVoltage), arrayVoltage?.unit)}</span>
        <small>{formatValue(valueOf(arrayCurrent), arrayCurrent?.unit)}</small>
      </div>

      <div className="power-link">
        <span>{formatValue(valueOf(inputPower), inputPower?.unit)}</span>
        <ArrowRight aria-hidden="true" />
      </div>

      <div className="power-node controller-node">
        <CircleGauge aria-hidden="true" />
        <strong>Controller</strong>
        <span>{formatValue(valueOf(chargeState))}</span>
        <small>{formatValue(valueOf(outputPower), outputPower?.unit)}</small>
      </div>

      <div className="power-link">
        <span>{formatValue(valueOf(chargeCurrent), chargeCurrent?.unit)}</span>
        <ArrowRight aria-hidden="true" />
      </div>

      <div className="power-node battery-node">
        <BatteryCharging aria-hidden="true" />
        <strong>Battery</strong>
        <span>{formatValue(valueOf(batteryVoltage), batteryVoltage?.unit)}</span>
        <small>charging bus</small>
      </div>
    </div>
  )
}

export function DeviceHeadline({
  device,
  sample,
}: {
  device: DeviceRecord
  sample?: LatestSample
}) {
  return (
    <div className="device-headline">
      <div>
        <div className="eyebrow">{device.vendor_name || 'Morningstar controller'}</div>
        <h1>{device.product_code || device.profile || 'Modbus device'}</h1>
        <div className="headline-meta">
          <StatusBadge status={device.status} />
          <span>{device.transport.toUpperCase()}</span>
          <span>unit {device.unit_id}</span>
          <span>last sample {formatRelativeTime(sample?.observed_at || device.last_seen)}</span>
        </div>
      </div>
      <div className="headline-glyph">
        {device.transport === 'tcp' ? <Radio /> : <PlugZap />}
      </div>
    </div>
  )
}

export function DataFreshness({ sample }: { sample?: LatestSample }) {
  if (!sample) return null
  const age = Date.now() - new Date(sample.observed_at).getTime()
  const tone = age < 10_000 ? 'ok' : age < 60_000 ? 'warning' : 'fault'
  return (
    <div className={`freshness freshness-${tone}`}>
      <span className="status-dot" />
      telemetry {formatRelativeTime(sample.observed_at)}
    </div>
  )
}

export function SummaryStat({
  label,
  value,
  helper,
  icon,
}: {
  label: string
  value: ReactNode
  helper?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="summary-stat">
      <div className="summary-icon">{icon || <Database size={18} />}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {helper && <small>{helper}</small>}
      </div>
    </div>
  )
}

export function Sparkline({
  values,
  label,
}: {
  values: number[]
  label: string
}) {
  if (values.length < 2) {
    return <div className="sparkline-placeholder">Not enough history for {label}</div>
  }
  const width = 640
  const height = 120
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(max - min, 0.0001)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / spread) * (height - 16) - 8
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function numericSeries(values: RegisterValue[]): number[] {
  return values.map(numericValue).filter((value): value is number => value !== null)
}
