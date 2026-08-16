import {
  Activity,
  BatteryCharging,
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
  ShieldCheck,
  Sun,
  TableProperties,
  TrendingUp,
  Wrench,
  Zap,
} from 'lucide-react'
import { Suspense, lazy, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
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
import { useHealth } from './api'
import {
  partitionControllerInventory,
  useControllers,
  type ControllerRecord,
} from './controller-api'
import { LoadingState, StatusBadge } from './components'
import { applyTheme, decodeDeviceId, loadTheme, type Theme } from './lib'
import { DevicesPage, DisplayPage, LivePage } from './pages/core'
import {
  CatalogPage,
  IntelligencePage,
  RegistersPage,
  SettingsPage,
} from './pages/engineering'
import {
  ControllerDataPage,
  ControllerDiagnosticsPage,
  ControllerEnergyPage,
  ControllerHistoryPage,
  ControllerOverviewPage,
} from './pages/controller-native'
import {
  ControllerOperationsIntelligencePage,
  OperationsIntelligencePage,
} from './pages/operations-intelligence'
import {
  SiteEnergyPage,
  SiteEventsPage,
  SiteHistoryPage,
  SiteOverviewPage,
  SitePowerFlowPage,
  SiteTopologyPage,
} from './pages/site'
import './site-intelligence.css'
import './operations-intelligence.css'
import './forecast.css'

const TelemetryHistoryPage = lazy(() => import('./pages/history'))
const ForecastPage = lazy(() => import('./pages/forecast'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      gcTime: 10 * 60_000,
    },
  },
})

export interface ControllerRouteContext {
  controllerUid?: string
  controller?: ControllerRecord
  deviceId?: string
  isLoading: boolean
}

export function useControllerRoute(): ControllerRouteContext {
  const { controllerUid } = useParams()
  const controllers = useControllers()
  const controller = controllers.data?.find((item) => item.controller_uid === controllerUid)
  return {
    controllerUid,
    controller,
    deviceId: controller?.current_device_id,
    isLoading: controllers.isLoading,
  }
}

export interface DeviceRouteContext {
  deviceId?: string
  deviceKey?: string
}

export function useDeviceRoute(): DeviceRouteContext {
  const { deviceKey, controllerUid } = useParams()
  const controllers = useControllers()
  if (controllerUid) {
    const controller = controllers.data?.find((item) => item.controller_uid === controllerUid)
    return { deviceKey, deviceId: controller?.current_device_id }
  }
  return { deviceKey, deviceId: decodeDeviceId(deviceKey) }
}

function controllerForDevice(
  controllers: ControllerRecord[] | undefined,
  deviceId: string | undefined,
): ControllerRecord | undefined {
  if (!deviceId) return undefined
  return controllers?.find(
    (controller) =>
      controller.current_device_id === deviceId ||
      controller.canonical_device_id === deviceId ||
      controller.history_device_ids?.includes(deviceId) ||
      controller.connections.some((connection) => connection.device_id === deviceId),
  )
}

function LegacyDeviceRedirect({ defaultSection = 'overview' }: { defaultSection?: string }) {
  const { deviceKey, section } = useParams()
  const controllers = useControllers()
  const deviceId = decodeDeviceId(deviceKey)
  if (controllers.isLoading) return <LoadingState label="Resolving physical controller…" />

  const controller = controllerForDevice(controllers.data, deviceId)
  if (!controller) return <Navigate to="/devices" replace />

  const legacyDestination = section === 'history' ? 'telemetry-history' : section
  const supported = new Set([
    'overview',
    'live',
    'telemetry-history',
    'history',
    'energy',
    'incidents',
    'registers',
    'intelligence',
    'diagnostics',
    'data',
  ])
  const destination = supported.has(legacyDestination || '') ? legacyDestination : defaultSection
  return <Navigate to={`/controllers/${controller.controller_uid}/${destination}`} replace />
}

const globalLinks = [
  { to: '/', label: 'Site overview', icon: LayoutDashboard },
  { to: '/site/forecast', label: 'Solar day planner', icon: TrendingUp },
  { to: '/site/intelligence', label: 'Operations intelligence', icon: ShieldCheck },
  { to: '/site/power', label: 'Power flow', icon: Zap },
  { to: '/site/energy', label: 'Energy', icon: BatteryCharging },
  { to: '/site/history', label: 'Site history', icon: History },
  { to: '/site/events', label: 'Events', icon: Activity },
  { to: '/site/topology', label: 'Topology', icon: Boxes },
  { to: '/devices', label: 'Controllers', icon: Gauge },
  { to: '/catalog', label: 'Catalog', icon: BookOpenText },
]

const controllerLinks = [
  { suffix: 'overview', label: 'Overview', icon: Gauge },
  { suffix: 'live', label: 'Live telemetry', icon: Activity },
  { suffix: 'telemetry-history', label: 'Telemetry history', icon: History },
  { suffix: 'history', label: 'History integrity', icon: Database },
  { suffix: 'energy', label: 'Energy truth', icon: BatteryCharging },
  { suffix: 'incidents', label: 'Operations intelligence', icon: ShieldCheck },
  { suffix: 'registers', label: 'Registers', icon: TableProperties },
  { suffix: 'intelligence', label: 'Device intelligence', icon: RadioTower },
  { suffix: 'diagnostics', label: 'Diagnostics', icon: Wrench },
  { suffix: 'data', label: 'Data', icon: Database },
]

function AppShell({ children }: PropsWithChildren) {
  const health = useHealth()
  const controllers = useControllers()
  const location = useLocation()
  const controllerUid = location.pathname.match(/^\/controllers\/([^/]+)/)?.[1]
  const currentController = useMemo(
    () => controllers.data?.find((controller) => controller.controller_uid === controllerUid),
    [controllerUid, controllers.data],
  )
  const controllerInventory = useMemo(
    () => partitionControllerInventory(controllers.data),
    [controllers.data],
  )
  const [theme, setTheme] = useState<Theme>(() => loadTheme())

  useEffect(() => applyTheme(theme), [theme])

  const nextTheme: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'high-contrast' : 'dark'
  const contextLabel = currentController
    ? currentController.model || currentController.product_code || currentController.profile
    : location.pathname === '/catalog'
      ? 'Device catalog'
      : location.pathname === '/devices'
        ? 'Controller inventory'
        : location.pathname === '/site/forecast'
          ? 'Solar day planner'
          : location.pathname === '/site/intelligence'
            ? 'Operations intelligence'
            : 'Site operations'

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
          <div className="nav-group-label">Site</div>
          {globalLinks.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="nav-link" end={to === '/' || to === '/devices'}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}

          {controllerUid && (
            <>
              <div className="nav-group-label">Physical controller</div>
              {controllerLinks.map(({ suffix, label, icon: Icon }) => (
                <NavLink
                  key={suffix}
                  to={`/controllers/${controllerUid}/${suffix}`}
                  className="nav-link"
                >
                  <Icon size={17} />
                  {label}
                </NavLink>
              ))}
              <NavLink
                to={`/display/controller/${controllerUid}`}
                className="nav-link"
                aria-label="Wall display"
              >
                <Monitor size={17} />
                Wall display
              </NavLink>
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
              label={
                health.isSuccess
                  ? `v${health.data.version ?? '?'}`
                  : health.isError
                    ? 'Unavailable'
                    : 'Checking'
              }
            />
          </div>
          <div>
            <span>Controllers</span>
            <strong>{controllerInventory.primary.length}</strong>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <span className="breadcrumb">{contextLabel}</span>
            {currentController && <StatusBadge status={currentController.status} />}
          </div>
          <div className="topbar-actions">
            {currentController && (
              <NavLink
                className="icon-button"
                to={`/display/controller/${currentController.controller_uid}`}
                title="Wall display"
                aria-label="Wall display"
              >
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
        path="/display/controller/:controllerUid"
        element={
          <Suspense fallback={<LoadingState />}>
            <DisplayPage />
          </Suspense>
        }
      />
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
                <Route path="/" element={<SiteOverviewPage />} />
                <Route path="/site/forecast" element={<ForecastPage />} />
                <Route path="/site/intelligence" element={<OperationsIntelligencePage />} />
                <Route path="/site/power" element={<SitePowerFlowPage />} />
                <Route path="/site/energy" element={<SiteEnergyPage />} />
                <Route path="/site/history" element={<SiteHistoryPage />} />
                <Route path="/site/events" element={<SiteEventsPage />} />
                <Route path="/site/topology" element={<SiteTopologyPage />} />
                <Route path="/devices" element={<DevicesPage />} />
                <Route path="/devices/:deviceKey" element={<LegacyDeviceRedirect />} />
                <Route path="/devices/:deviceKey/:section" element={<LegacyDeviceRedirect />} />
                <Route path="/controllers/:controllerUid/overview" element={<ControllerOverviewPage />} />
                <Route path="/controllers/:controllerUid/live" element={<LivePage />} />
                <Route
                  path="/controllers/:controllerUid/telemetry-history"
                  element={<TelemetryHistoryPage />}
                />
                <Route path="/controllers/:controllerUid/history" element={<ControllerHistoryPage />} />
                <Route path="/controllers/:controllerUid/energy" element={<ControllerEnergyPage />} />
                <Route
                  path="/controllers/:controllerUid/incidents"
                  element={<ControllerOperationsIntelligencePage />}
                />
                <Route path="/controllers/:controllerUid/registers" element={<RegistersPage />} />
                <Route path="/controllers/:controllerUid/intelligence" element={<IntelligencePage />} />
                <Route path="/controllers/:controllerUid/diagnostics" element={<ControllerDiagnosticsPage />} />
                <Route path="/controllers/:controllerUid/data" element={<ControllerDataPage />} />
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
