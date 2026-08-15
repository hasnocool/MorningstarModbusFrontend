import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  CircleGauge,
  Database,
  Download,
  FileJson2,
  HardDrive,
  Info,
  Radio,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  WifiOff,
  Wrench,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useDeviceRoute } from '../app'
import {
  exportUrl,
  useCatalog,
  useCatalogProfile,
  useDevices,
  useHealth,
  useHistorySummary,
  useIntelligence,
  useLatest,
  usePollingPerformance,
  useProfileValidation,
  useRegisterMap,
} from '../api'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatusBadge,
  SummaryStat,
} from '../components'
import {
  applyTheme,
  flattenRegisterDefinitions,
  formatBytes,
  formatDuration,
  formatRelativeTime,
  formatValue,
  loadTheme,
  type Theme,
  valueOf,
} from '../lib'

function address(value?: number) {
  return value === undefined ? '—' : `0x${value.toString(16).padStart(4, '0').toUpperCase()}`
}

export function RegistersPage() {
  const { deviceId } = useDeviceRoute()
  const latest = useLatest(deviceId)
  const registerMap = useRegisterMap(deviceId)
  const [query, setQuery] = useState('')
  const definitions = useMemo(
    () => flattenRegisterDefinitions(registerMap.data),
    [registerMap.data],
  )
  const liveByName = useMemo(
    () => new Map((latest.data?.values ?? []).map((item) => [item.register_name, item])),
    [latest.data?.values],
  )
  const rows = useMemo(() => {
    const base = definitions.length
      ? definitions
      : (latest.data?.values ?? []).map((item) => ({
          name: item.register_name,
          address: item.address,
          function: item.function,
          unit: item.unit ?? undefined,
          raw: {},
        }))
    const term = query.trim().toLowerCase()
    if (!term) return base
    return base.filter((item) => {
      const haystack = `${item.name} ${item.description ?? ''} ${address(item.address)}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [definitions, latest.data?.values, query])

  if (!deviceId) return <ErrorState title="No device selected" />
  if (latest.isLoading || registerMap.isLoading) return <LoadingState label="Loading register map…" />

  return (
    <div className="page">
      <div className="page-heading">
        <span className="eyebrow">Engineering reference</span>
        <h1>Register explorer</h1>
        <p>
          Firmware-filtered catalog metadata joined to the latest persisted values. No controller
          writes are exposed.
        </p>
      </div>

      <div className="search-bar">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, description, or 0x address…"
          aria-label="Search registers"
        />
        <span>{rows.length} registers</span>
      </div>

      <Panel>
        <div className="table-wrap">
          <table className="data-table register-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Register</th>
                <th>Function</th>
                <th>Current value</th>
                <th>Unit</th>
                <th>Description / firmware</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((definition) => {
                const live = liveByName.get(definition.name)
                return (
                  <tr key={`${definition.name}-${definition.address ?? ''}`}>
                    <td><code>{address(definition.address ?? live?.address)}</code></td>
                    <td><code>{definition.name}</code></td>
                    <td>{definition.function ?? live?.function ?? '—'}</td>
                    <td className="numeric-cell">{formatValue(valueOf(live))}</td>
                    <td>{definition.unit ?? live?.unit ?? '—'}</td>
                    <td>
                      <div>{definition.description || '—'}</div>
                      {definition.firmware && <small>{definition.firmware}</small>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function EvidenceList({
  title,
  items,
  icon,
}: {
  title: string
  items?: Array<Record<string, unknown>>
  icon: ReactNode
}) {
  return (
    <Panel eyebrow="Evidence inspector" title={title}>
      {!items?.length ? (
        <div className="muted">No entries reported by the backend.</div>
      ) : (
        <div className="evidence-list">
          {items.map((item, index) => (
            <div className="evidence-row" key={index}>
              <span className="evidence-icon">{icon}</span>
              <div>
                <strong>
                  {String(
                    item.title ??
                      item.kind ??
                      item.source ??
                      item.code ??
                      `Evidence ${index + 1}`,
                  )}
                </strong>
                <pre>{JSON.stringify(item, null, 2)}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

export function IntelligencePage() {
  const { deviceId } = useDeviceRoute()
  const intelligence = useIntelligence(deviceId)
  const validation = useProfileValidation(deviceId)

  if (!deviceId) return <ErrorState title="No device selected" />
  if (intelligence.isLoading) return <LoadingState label="Loading device intelligence…" />
  if (intelligence.isError || !intelligence.data) {
    return <ErrorState title="Device intelligence unavailable" />
  }

  const data = intelligence.data
  return (
    <div className="page">
      <div className="page-heading">
        <span className="eyebrow">Identity and confidence</span>
        <h1>Device intelligence</h1>
        <p>Why the service believes this endpoint belongs to a specific Morningstar profile.</p>
      </div>

      <div className="identity-card panel">
        <div className="identity-main">
          <div className="identity-glyph"><ShieldCheck size={32} /></div>
          <div>
            <span>{data.family || 'Morningstar family'}</span>
            <h2>{data.model || data.profile}</h2>
            <StatusBadge status={data.intelligence_status || data.status} />
          </div>
        </div>
        <div className="identity-confidence">
          <span>Confidence</span>
          <strong>
            {data.confidence !== undefined ? `${Math.round(data.confidence * 100)}%` : '—'}
          </strong>
        </div>
      </div>

      <div className="identity-grid">
        {[
          ['Profile', data.profile],
          ['Firmware', data.firmware],
          ['Hardware', data.hardware_revision],
          ['Catalog revision', data.catalog_revision],
          ['Serial', data.serial_number],
          ['Updated', data.updated_at ? formatRelativeTime(data.updated_at) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="identity-field">
            <span>{label}</span>
            <strong>{String(value || '—')}</strong>
          </div>
        ))}
      </div>

      <div className="two-column">
        <EvidenceList
          title="Identification evidence"
          items={data.evidence}
          icon={<CheckCircle2 size={18} />}
        />
        <EvidenceList
          title="Warnings"
          items={data.warnings}
          icon={<AlertTriangle size={18} />}
        />
      </div>

      <Panel eyebrow="Profile validation" title="Runtime interpretation">
        {validation.isLoading ? (
          <LoadingState />
        ) : (
          <pre className="json-inspector">{JSON.stringify(validation.data ?? {}, null, 2)}</pre>
        )}
      </Panel>
    </div>
  )
}

export function DiagnosticsPage() {
  const { deviceId } = useDeviceRoute()
  const health = useHealth()
  const devices = useDevices()
  const latest = useLatest(deviceId)
  const summary = useHistorySummary(deviceId)
  const polling = usePollingPerformance(deviceId)
  const device = devices.data?.find((item) => item.id === deviceId)

  if (!deviceId) return <ErrorState title="No device selected" />

  return (
    <div className="page">
      <div className="page-heading">
        <span className="eyebrow">Operations diagnostics</span>
        <h1>Health & communications</h1>
        <p>
          API health, stored-device state, last-poll quality, data coverage, and optional Modbus
          performance instrumentation.
        </p>
      </div>

      <div className="summary-grid">
        <SummaryStat
          label="API"
          value={health.isSuccess ? health.data.status : health.isError ? 'offline' : 'checking'}
          helper={health.data?.version ? `v${health.data.version}` : undefined}
          icon={health.isError ? <WifiOff size={18} /> : <Radio size={18} />}
        />
        <SummaryStat
          label="Device"
          value={device?.status || 'unknown'}
          helper={formatRelativeTime(device?.last_seen)}
          icon={<CircleGauge size={18} />}
        />
        <SummaryStat
          label="Last poll"
          value={latest.data ? `${latest.data.latency_ms.toFixed(1)} ms` : '—'}
          helper={formatRelativeTime(latest.data?.observed_at)}
        />
        <SummaryStat
          label="Stored errors"
          value={String(summary.data?.error_count ?? '—')}
          helper={formatDuration(summary.data?.observed_duration_seconds)}
          icon={<Wrench size={18} />}
        />
      </div>

      {device?.last_error && (
        <div className="error-state">
          <AlertTriangle size={20} />
          <div>
            <strong>Latest persisted device error</strong>
            <div className="muted">{device.last_error}</div>
          </div>
        </div>
      )}

      <Panel eyebrow="Modbus performance" title="Polling headroom">
        {polling.isLoading && <LoadingState />}
        {polling.isError && <ErrorState title="Polling diagnostics failed" />}
        {polling.data === null && (
          <EmptyState title="Polling performance API not available" icon={<Info size={22} />}>
            This backend does not expose the optional adaptive-polling endpoints yet. The rest of the
            frontend remains fully compatible.
          </EmptyState>
        )}
        {polling.data && (
          <div className="diagnostic-grid">
            {[
              ['Poll rate', polling.data.poll_rate_hz, 'Hz'],
              ['Latency p50', polling.data.poll_latency_p50_ms, 'ms'],
              ['Latency p95', polling.data.poll_latency_p95_ms, 'ms'],
              ['Latency p99', polling.data.poll_latency_p99_ms, 'ms'],
              ['Requests/sec', polling.data.modbus_requests_per_second, 'req/s'],
              ['Traffic', polling.data.modbus_bytes_per_second, 'B/s'],
              [
                'Success',
                polling.data.success_rate !== undefined ? polling.data.success_rate * 100 : undefined,
                '%',
              ],
              [
                'Bus utilization',
                polling.data.bus_utilization_avg_percent ?? undefined,
                '%',
              ],
            ].map(([label, value, unit]) => (
              <div key={String(label)} className="diagnostic-stat">
                <span>{String(label)}</span>
                <strong>{typeof value === 'number' ? `${value.toFixed(2)} ${unit}` : '—'}</strong>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel eyebrow="Data coverage" title="Persisted history">
        <div className="summary-grid compact-summary">
          <SummaryStat label="Poll samples" value={String(summary.data?.poll_sample_count ?? '—')} />
          <SummaryStat
            label="Register observations"
            value={String(summary.data?.register_observation_count ?? '—')}
          />
          <SummaryStat
            label="Distinct registers"
            value={String(summary.data?.distinct_register_count ?? '—')}
          />
          <SummaryStat
            label="Database size"
            value={formatBytes(summary.data?.database_bytes)}
            icon={<HardDrive size={18} />}
          />
        </div>
      </Panel>
    </div>
  )
}

export function DataPage() {
  const { deviceId } = useDeviceRoute()
  const latest = useLatest(deviceId)
  const summary = useHistorySummary(deviceId)
  const [format, setFormat] = useState<'csv' | 'jsonl'>('csv')
  const [resolution, setResolution] = useState('raw')
  const [preset, setPreset] = useState('24h')
  const names = (latest.data?.values ?? []).map((item) => item.register_name)
  const [selected, setSelected] = useState<string[]>([])

  const now = new Date()
  const rangeMs =
    preset === '1h'
      ? 3_600_000
      : preset === '7d'
        ? 7 * 86_400_000
        : preset === '30d'
          ? 30 * 86_400_000
          : 86_400_000
  const from = new Date(now.getTime() - rangeMs).toISOString()
  const to = now.toISOString()

  if (!deviceId) return <ErrorState title="No device selected" />

  const selectedNames = selected.length ? selected : names
  const href = exportUrl(deviceId, selectedNames, from, to, resolution, format)

  return (
    <div className="page">
      <div className="page-heading">
        <span className="eyebrow">Telemetry archive</span>
        <h1>Data & export</h1>
        <p>Inspect database coverage and stream filtered history without loading it all into browser memory.</p>
      </div>

      <div className="summary-grid">
        <SummaryStat label="First observation" value={formatRelativeTime(summary.data?.first_observation)} />
        <SummaryStat label="Last observation" value={formatRelativeTime(summary.data?.last_observation)} />
        <SummaryStat label="Coverage" value={formatDuration(summary.data?.observed_duration_seconds)} />
        <SummaryStat label="Database" value={formatBytes(summary.data?.database_bytes)} icon={<Database size={18} />} />
      </div>

      <Panel eyebrow="Streaming export" title="Build export">
        <div className="export-grid">
          <label>
            Range
            <select value={preset} onChange={(event) => setPreset(event.target.value)}>
              <option value="1h">Last hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
          <label>
            Resolution
            <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
              {['raw', '1m', '5m', '15m', '1h', '1d'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select value={format} onChange={(event) => setFormat(event.target.value as 'csv' | 'jsonl')}>
              <option value="csv">CSV</option>
              <option value="jsonl">JSONL</option>
            </select>
          </label>
        </div>

        <div className="export-registers">
          <div className="export-registers-head">
            <span>Registers</span>
            <button className="text-button" onClick={() => setSelected([])}>
              All
            </button>
          </div>
          <div className="check-grid">
            {names.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={selected.includes(name)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(name)
                        ? current.filter((item) => item !== name)
                        : [...current, name],
                    )
                  }
                />
                <code>{name}</code>
              </label>
            ))}
          </div>
        </div>

        <div className="export-actions">
          <a className="primary-button" href={href}>
            <Download size={17} />
            Export {format.toUpperCase()}
          </a>
          <span>{selected.length ? `${selected.length} selected` : 'all registers'}</span>
        </div>
      </Panel>
    </div>
  )
}

export function CatalogPage() {
  const catalog = useCatalog()
  const [selected, setSelected] = useState<string>()
  const detail = useCatalogProfile(selected)

  const profiles = useMemo(
    () =>
      (catalog.data ?? []).map((entry, index) => ({
        entry,
        name: String(entry.profile ?? entry.name ?? entry.id ?? `profile-${index + 1}`),
        family: String(entry.family ?? entry.product_family ?? entry.title ?? 'Morningstar'),
      })),
    [catalog.data],
  )

  if (catalog.isLoading) return <LoadingState label="Loading Morningstar catalog…" />
  if (catalog.isError) return <ErrorState title="Catalog unavailable" />

  return (
    <div className="page">
      <div className="page-heading">
        <span className="eyebrow">Reference library</span>
        <h1>Morningstar catalog</h1>
        <p>Browse supported profile families, firmware-aware capabilities, and register definitions.</p>
      </div>

      {!profiles.length ? (
        <EmptyState title="The backend catalog is empty" icon={<BookOpenText size={22} />} />
      ) : (
        <div className="catalog-layout">
          <Panel eyebrow="Profiles" title={`${profiles.length} available`} className="catalog-list">
            {profiles.map((profile) => (
              <button
                key={profile.name}
                className={selected === profile.name ? 'catalog-item active' : 'catalog-item'}
                onClick={() => setSelected(profile.name)}
              >
                <TableProperties size={18} />
                <span>
                  <strong>{profile.family}</strong>
                  <code>{profile.name}</code>
                </span>
              </button>
            ))}
          </Panel>

          <Panel eyebrow="Profile detail" title={selected || 'Select a profile'}>
            {!selected && (
              <EmptyState title="Choose a profile" icon={<SlidersHorizontal size={22} />}>
                The profile detail endpoint will be loaded only when needed.
              </EmptyState>
            )}
            {detail.isLoading && <LoadingState />}
            {detail.data && <pre className="json-inspector">{JSON.stringify(detail.data, null, 2)}</pre>}
          </Panel>
        </div>
      )}
    </div>
  )
}

export function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const apply = (next: Theme) => {
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="page">
      <div className="page-heading">
        <span className="eyebrow">Local interface</span>
        <h1>Settings</h1>
        <p>Presentation preferences are browser-local. No controller settings are written here.</p>
      </div>

      <Panel eyebrow="Appearance" title="Theme">
        <div className="theme-grid">
          {(['dark', 'light', 'high-contrast'] as Theme[]).map((item) => (
            <button
              className={theme === item ? 'theme-card active' : 'theme-card'}
              onClick={() => apply(item)}
              key={item}
            >
              <div className={`theme-preview theme-preview-${item}`}>
                <span />
                <span />
                <span />
              </div>
              <strong>{item.replace('-', ' ')}</strong>
            </button>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="API" title="Connection">
        <div className="settings-row">
          <FileJson2 size={20} />
          <div>
            <span>Browser API base</span>
            <code>{import.meta.env.VITE_API_BASE_URL || '/api'}</code>
          </div>
        </div>
        <p className="muted">
          Configure deployment URLs through <code>VITE_API_BASE_URL</code>. Do not place secrets in
          Vite environment variables because browser bundles are public.
        </p>
      </Panel>
    </div>
  )
}
