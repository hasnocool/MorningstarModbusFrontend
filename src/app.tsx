import {
  Activity,
  BookOpenText,
  Boxes,
  Database,
  Gauge,
  History,
  LayoutDashboard,
  Monitor,
  Moon,
  RadioTower,
  Settings,
  Sun,
  TableProperties,
  Wrench,
} from 'lucide-react'
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import { useDevices, useHealth } from './api'
import { LoadingState, StatusBadge } from './components'
import { applyTheme, decodeDeviceId, encodeDeviceId, loadTheme, type Theme } from './lib'
import {
  DevicesPage,
  DisplayPage,
  LivePage,
  OverviewPage,
} from './pages/core'
import {
  CatalogPage,
  DataPage,
  DiagnosticsPage,
  IntelligencePage,
  RegistersPage,
  SettingsPage,
} from './pages/engineering'

const HistoryPage = lazy(() => import('./pages/history'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      gcTime: 10 * 60_000,
    },
  },
})

export interface DeviceRouteContext {
  deviceId?: string
  deviceKey?: string
}

export function useDeviceRoute(): DeviceRouteContext {
  const { deviceKey } = useParams()
  return { deviceKey, deviceId: decodeDeviceId(deviceKey) }
}

function DeviceRedirect() {
  const devices = useDevices()
  if (devices.isLoading) return <LoadingState />
  const first = devices.data?.[0]
  if (!first) return <OverviewPage />
  return <Navigate to={`/devices/${encodeDeviceId(first.id)}/overview`} replace />
}

const globalLinks = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/devices', label: 'Devices', icon: Boxes },
  { to: '/catalog', label: 'Catalog', icon: BookOpenText },
]

const deviceLinks = [
  { suffix: 'overview', label: 'Overview', icon: Gauge },
  { suffix: 'live', label: 'Live telemetry', icon: Activity },
  { suffix: 'history', label: 'History', icon: History },
  { suffix: 'registers', label: 'Registers', icon: TableProperties },
  { suffix: 'intelligence', label: 'Intelligence', icon: RadioTower },
  { suffix: 'diagnostics', label: 'Diagnostics', icon: Wrench },
  { suffix: 'data', label: 'Data', icon: Database },
]

function AppShell({ children }: PropsWithChildren) {
  const health = useHealth()
  const devices = useDevices()
  const location = useLocation()
  const deviceKey = location.pathname.match(/^\/devices\/([^/]+)/)?.[1]
  const [theme, setTheme] = useState<Theme>(() => loadTheme())

  useEffect(() => applyTheme(theme), [theme])

  const currentDevice = useMemo(
    () => devices.data?.find((device) => encodeDeviceId(device.id) === deviceKey),
    [deviceKey, devices.data],
  )

  const nextTheme: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'high-contrast' : 'dark'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sun size={20} />
          </div>
          <div>
            <strong>Morningstar</strong>
            <span>Operations Console</span>
          </div>
        </div>

        <nav aria-label="Primary navigation">
          <div className="nav-group-label">System</div>
          {globalLinks.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="nav-link" end={to === '/'}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}

          {deviceKey && (
            <>
              <div className="nav-group-label">Active device</div>
              {deviceLinks.map(({ suffix, label, icon: Icon }) => (
                <NavLink
                  key={suffix}
                  to={`/devices/${deviceKey}/${suffix}`}
                  className="nav-link"
                >
                  <Icon size={17} />
                  {label}
                </NavLink>
              ))}
            </>
          )}

          <div className="nav-spacer" />
          <NavLink to="/settings" className="nav-link">
            <Settings size={17} />
            Settings
          </NavLink>
        </nav>

        <div className="sidebar-status">
          <div>
            <span>API</span>
            <StatusBadge
              status={health.isSuccess ? health.data.status : health.isError ? 'offline' : 'checking'}
              label={health.isSuccess ? `v${health.data.version ?? '?'}` : health.isError ? 'Unavailable' : 'Checking'}
            />
          </div>
          <div>
            <span>Devices</span>
            <strong>{devices.data?.length ?? 0}</strong>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <span className="breadcrumb">
              {currentDevice
                ? currentDevice.product_code || currentDevice.profile
                : location.pathname === '/catalog'
                  ? 'Device catalog'
                  : 'System overview'}
            </span>
            {currentDevice && <StatusBadge status={currentDevice.status} />}
          </div>
          <div className="topbar-actions">
            {currentDevice && (
              <NavLink className="icon-button" to={`/display/${deviceKey}`} title="Wall display">
                <Monitor size={18} />
              </NavLink>
            )}
            <button
              className="icon-button"
              onClick={() => setTheme(nextTheme)}
              title={`Switch to ${nextTheme} theme`}
              aria-label={`Switch to ${nextTheme} theme`}
            >
              {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}

function RoutedApp() {
  return (
    <Routes>
      <Route
        path="/display/:deviceKey"
        element={
          <Suspense fallback={<LoadingState />}>
            <DisplayPage />
          </Suspense>
        }
      />

      <Route
        path="*"
        element={
          <AppShell>
            <Suspense fallback={<LoadingState />}>
              <Routes>
                <Route path="/" element={<DeviceRedirect />} />
                <Route path="/devices" element={<DevicesPage />} />
                <Route path="/devices/:deviceKey/overview" element={<OverviewPage />} />
                <Route path="/devices/:deviceKey/live" element={<LivePage />} />
                <Route path="/devices/:deviceKey/history" element={<HistoryPage />} />
                <Route path="/devices/:deviceKey/registers" element={<RegistersPage />} />
                <Route path="/devices/:deviceKey/intelligence" element={<IntelligencePage />} />
                <Route path="/devices/:deviceKey/diagnostics" element={<DiagnosticsPage />} />
                <Route path="/devices/:deviceKey/data" element={<DataPage />} />
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AppShell>
        }
      />
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RoutedApp />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
