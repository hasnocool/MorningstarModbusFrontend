import {
  Activity,
  BatteryCharging,
  Clock3,
  Gauge,
  Radio,
  Sun,
  Thermometer,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  useDevices,
  useHistory,
  useHistorySummary,
  useIntelligence,
  useLatest,
  useRegisterMap,
} from '../api'
import {
  DataFreshness,
  DeviceHeadline,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  Panel,
  PowerFlow,
  Sparkline,
  StatusBadge,
  SummaryStat,
} from '../components'
import {
  encodeDeviceId,
  flattenRegisterDefinitions,
  formatBytes,
  formatDuration,
  formatRelativeTime,
  formatValue,
  metric,
  plainRegisterLabel,
  rangeForPreset,
  semanticRegisterValues,
  valueOf,
} from '../lib'
import { useDeviceRoute } from '../app'

export function DevicesPage() {
  const devices = useDevices()
  if (devices.isLoading) return <LoadingState label="Discovering stored devices…" />
  if (devices.isError) return <ErrorState title="Device inventory unavailable" />
  if (!devices.data?.length) {
    return (
      <div className="page">
        <div className="page-heading">
          <span className="eyebrow">Inventory</span>
          <h1>Devices</h1>
        </div>
        <EmptyState title="No Morningstar devices are stored yet">
          Start the backend watcher, connect a controller, and this inventory will populate automatically.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <span className="eyebrow">Inventory</span>
        <h1>Devices</h1>
        <p>Persisted Morningstar endpoints, transport status, profile selection, and last contact.</p>
      </div>
      <div className="device-grid">
        {devices.data.map((device) => (
          <Link
            key={device.id}
            className="device-card"
            to={`/devices/${encodeDeviceId(device.id)}/overview`}
          >
            <div className="device-card-top">
              <div className="device-icon">
                <Gauge size={22} />
              </div>
              <StatusBadge status={device.status} />
            </div>
            <strong>{device.product_code || device.profile}</strong>
            <span>{device.vendor_name || 'Morningstar'}</span>
            <dl>
              <div>
                <dt>Transport</dt>
                <dd>{device.transport.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Unit</dt>
                <dd>{device.unit_id}</dd>
              </div>
              <div>
                <dt>Profile</dt>
                <dd>{device.profile}</dd>
              </div>
              <div>
                <dt>Last seen</dt>
                <dd>{formatRelativeTime(device.last_seen)}</dd>
              </div>
            </dl>
            {device.last_error && <div className="inline-warning">{device.last_error}</div>}
          </Link>
        ))}
      </div>
    </div>
  )
}

export function OverviewPage() {
  const route = useDeviceRoute()
  const devices = useDevices()
  const device = devices.data?.find((item) => item.id === route.deviceId)
  const latest = useLatest(route.deviceId)
  const intelligence = useIntelligence(route.deviceId)
  const summary = useHistorySummary(route.deviceId)
  const batteryVoltage = metric(latest.data, 'batteryVoltage')
  const batterySenseVoltage = metric(latest.data, 'batterySenseVoltage')
  const dailyChargeWh = metric(latest.data, 'dailyChargeWh')
  const chargeState = metric(latest.data, 'chargeState')
  const historyRange = rangeForPreset('24h')
  const history = useHistory(
    route.deviceId,
    batteryVoltage?.register_name ? [batteryVoltage.register_name] : [],
    historyRange.from,
    historyRange.to,
    '5m',
    1000,
  )

  if (!route.deviceId) {
    if (devices.isLoading) return <LoadingState />
    return (
      <div className="page">
        <div className="page-heading">
          <span className="eyebrow">Solar operations</span>
          <h1>System overview</h1>
        </div>
        <EmptyState title="No active device selected">
          Add a device through the backend watcher or choose one from the device inventory.
        </EmptyState>
      </div>
    )
  }
  if (!device && devices.isLoading) return <LoadingState />
  if (!device) return <ErrorState title="Device not found" detail="The selected stored device no longer exists." />

  const series = history.data?.series[0]?.points ?? []
  const sparkValues = series
    .map((point) => {
      const candidate = point.avg ?? point.value ?? point.last
      return typeof candidate === 'number' ? candidate : null
    })
    .filter((value): value is number => value !== null)

  return (
    <div className="page">
      <DeviceHeadline device={device} sample={latest.data} />
      {latest.isError && (
        <ErrorState
          title="Latest telemetry is unavailable"
          detail="Historical data and device intelligence remain available."
        />
      )}
      {latest.data && <DataFreshness sample={latest.data} />}

      <Panel eyebrow="Live power path" title="Array → controller → battery">
        {latest.isLoading ? <LoadingState /> : <PowerFlow sample={latest.data} />}
      </Panel>

      <div className="metric-grid">
        <MetricCard
          label="Generated today"
          register={dailyChargeWh}
          accent="solar"
          icon={<Sun size={17} />}
          helper="controller daily counter"
        />
        <MetricCard
          label="Battery sense voltage"
          register={batterySenseVoltage}
          accent="battery"
          icon={<BatteryCharging size={17} />}
          helper="remote sense terminals"
        />
        <MetricCard
          label="Battery voltage"
          register={batteryVoltage}
          accent="battery"
          icon={<BatteryCharging size={17} />}
        />
        <MetricCard
          label="Array voltage"
          register={metric(latest.data, 'arrayVoltage')}
          accent="solar"
          icon={<Sun size={17} />}
        />
        <MetricCard
          label="Charge current"
          register={metric(latest.data, 'chargeCurrent')}
          accent="charge"
          icon={<Activity size={17} />}
        />
        <MetricCard
          label="Output power"
          register={metric(latest.data, 'outputPower') ?? metric(latest.data, 'inputPower')}
          accent="solar"
          icon={<Zap size={17} />}
        />
      </div>

      <div className="two-column">
        <Panel
          eyebrow="24-hour trend"
          title={batteryVoltage ? plainRegisterLabel(batteryVoltage.register_name) : 'Battery voltage'}
          className="trend-panel"
        >
          <Sparkline values={sparkValues} label="Battery voltage 24-hour trend" />
          <div className="trend-meta">
            <span>Latest {formatValue(valueOf(batteryVoltage), batteryVoltage?.unit)}</span>
            <span>{history.data?.resolution || '5m'} buckets</span>
          </div>
        </Panel>

        <Panel eyebrow="Charge state" title={formatValue(valueOf(chargeState))}>
          <div className="state-hero">
            <Radio size={28} />
            <div>
              <span>Controller state</span>
              <strong>{formatValue(valueOf(chargeState))}</strong>
            </div>
          </div>
          <div className="state-details">
            <div>
              <span>Target</span>
              <strong>
                {formatValue(
                  valueOf(metric(latest.data, 'targetVoltage')),
                  metric(latest.data, 'targetVoltage')?.unit,
                )}
              </strong>
            </div>
            <div>
              <span>Battery temp</span>
              <strong>
                {formatValue(
                  valueOf(metric(latest.data, 'batteryTemperature')),
                  metric(latest.data, 'batteryTemperature')?.unit,
                )}
              </strong>
            </div>
          </div>
        </Panel>
      </div>

      <div className="summary-grid">
        <SummaryStat
          label="Profile confidence"
          value={
            intelligence.data?.confidence !== undefined
              ? `${Math.round(intelligence.data.confidence * 100)}%`
              : '—'
          }
          helper={intelligence.data?.intelligence_status || intelligence.data?.status}
          icon={<Gauge size={18} />}
        />
        <SummaryStat
          label="Stored polls"
          value={String(summary.data?.poll_sample_count ?? '—')}
          helper={`${summary.data?.distinct_register_count ?? '—'} registers`}
        />
        <SummaryStat
          label="Coverage"
          value={formatDuration(summary.data?.observed_duration_seconds)}
          helper={`${summary.data?.error_count ?? 0} recorded errors`}
          icon={<Clock3 size={18} />}
        />
        <SummaryStat
          label="Database"
          value={formatBytes(summary.data?.database_bytes)}
          helper="SQLite telemetry"
        />
      </div>
    </div>
  )
}

export function LivePage() {
  const { deviceId } = useDeviceRoute()
  const latest = useLatest(deviceId)
  const registerMap = useRegisterMap(deviceId)
  const devices = useDevices()
  const device = devices.data?.find((item) => item.id === deviceId)

  if (!deviceId) return <ErrorState title="No device selected" />
  if (latest.isLoading) return <LoadingState label="Loading live register snapshot…" />
  if (latest.isError || !latest.data) return <ErrorState title="Live telemetry unavailable" />

  const definitions = flattenRegisterDefinitions(registerMap.data)
  const definitionByName = new Map(definitions.map((item) => [item.name, item]))
  const values = semanticRegisterValues(latest.data.values, definitions).sort(
    (a, b) => a.address - b.address,
  )

  return (
    <div className="page">
      {device && <DeviceHeadline device={device} sample={latest.data} />}
      <div className="page-heading compact-heading">
        <span className="eyebrow">Engineering snapshot</span>
        <h1>Live telemetry</h1>
        <p>
          Documented values use Morningstar catalog names and descriptions. Raw transport rows remain
          visible only for addresses that are not mapped by the active device profile.
        </p>
      </div>
      <DataFreshness sample={latest.data} />

      <div className="metric-grid">
        <MetricCard
          label="Generated today"
          register={metric(latest.data, 'dailyChargeWh')}
          accent="solar"
          icon={<Sun size={17} />}
        />
        <MetricCard
          label="Battery sense voltage"
          register={metric(latest.data, 'batterySenseVoltage')}
          accent="battery"
          icon={<BatteryCharging size={17} />}
        />
        <MetricCard label="Battery voltage" register={metric(latest.data, 'batteryVoltage')} accent="battery" />
        <MetricCard label="Array voltage" register={metric(latest.data, 'arrayVoltage')} accent="solar" />
        <MetricCard label="Charge current" register={metric(latest.data, 'chargeCurrent')} accent="charge" />
        <MetricCard
          label="Temperature"
          register={metric(latest.data, 'heatsinkTemperature') ?? metric(latest.data, 'batteryTemperature')}
          icon={<Thermometer size={17} />}
        />
      </div>

      <Panel eyebrow="Latest poll" title={`${values.length} semantic register observations`}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Register</th>
                <th>Address</th>
                <th>Function</th>
                <th>Decoded</th>
                <th>Raw</th>
                <th>Unit</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {values.map((register) => {
                const definition = definitionByName.get(register.register_name)
                return (
                  <tr key={`${register.register_name}-${register.address}`}>
                    <td>
                      <strong>{plainRegisterLabel(register.register_name)}</strong>
                      <br />
                      <code>{register.register_name}</code>
                    </td>
                    <td><code>0x{register.address.toString(16).padStart(4, '0').toUpperCase()}</code></td>
                    <td>{register.function}</td>
                    <td className="numeric-cell">{formatValue(valueOf(register), register.unit)}</td>
                    <td><code>{JSON.stringify(register.raw ?? register.raw_json ?? null)}</code></td>
                    <td>{register.unit || '—'}</td>
                    <td>{definition?.description || 'Raw address not described by the active catalog.'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="panel-footer">
          <span>Poll latency {latest.data.latency_ms.toFixed(1)} ms</span>
          <span>{formatRelativeTime(latest.data.observed_at)}</span>
        </div>
      </Panel>
    </div>
  )
}

export function DisplayPage() {
  const { deviceId } = useDeviceRoute()
  const latest = useLatest(deviceId)
  const devices = useDevices()
  const device = devices.data?.find((item) => item.id === deviceId)
  const battery = metric(latest.data, 'batteryVoltage')
  const batterySense = metric(latest.data, 'batterySenseVoltage')
  const dailyEnergy = metric(latest.data, 'dailyChargeWh')
  const power = metric(latest.data, 'outputPower') ?? metric(latest.data, 'inputPower')
  const current = metric(latest.data, 'chargeCurrent')
  const state = metric(latest.data, 'chargeState')

  return (
    <div className="display-page">
      <header>
        <div>
          <span>Morningstar Operations</span>
          <strong>{device?.product_code || device?.profile || 'Solar controller'}</strong>
        </div>
        <StatusBadge status={device?.status} />
      </header>
      <div className="display-metrics">
        <div>
          <span>Generated today</span>
          <strong>{formatValue(valueOf(dailyEnergy), dailyEnergy?.unit)}</strong>
        </div>
        <div>
          <span>Battery sense</span>
          <strong>{formatValue(valueOf(batterySense), batterySense?.unit)}</strong>
        </div>
        <div>
          <span>Battery</span>
          <strong>{formatValue(valueOf(battery), battery?.unit)}</strong>
        </div>
        <div>
          <span>Solar power</span>
          <strong>{formatValue(valueOf(power), power?.unit)}</strong>
        </div>
        <div>
          <span>Charge current</span>
          <strong>{formatValue(valueOf(current), current?.unit)}</strong>
        </div>
        <div>
          <span>State</span>
          <strong>{formatValue(valueOf(state))}</strong>
        </div>
      </div>
      <PowerFlow sample={latest.data} />
      <footer>
        <span>Telemetry {formatRelativeTime(latest.data?.observed_at)}</span>
        <span>Read-only Modbus monitor</span>
      </footer>
    </div>
  )
}
