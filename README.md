# MorningstarModbusFrontend

A read-only site operations, diagnostics, and engineering console for
[`MorningstarModbusAPI`](https://github.com/hasnocool/MorningstarModbusAPI).

The frontend is designed for always-on solar-controller monitoring rather than as a generic card
dashboard. It treats the installation and immutable physical controllers as the primary product
entities while retaining raw connection/device provenance for engineering views.

> **Current release:** **v0.3.1**, published August 16, 2026. The v0.3.x frontend targets the
> controller-native/system-native MorningstarModbusAPI v0.6+ surface and the companion site-intelligence
> endpoints introduced by the current backend.

## v0.3.1 highlights

- restores the full multi-series **Telemetry history** explorer as a first-class controller page;
- keeps **History integrity** as a separate evidence/recovery view rather than replacing graph history;
- historical graphs use immutable `controller_uid`, so telemetry remains continuous across USB/TCP endpoint changes;
- restores **Wall display** as an explicit controller navigation item while retaining the top-bar shortcut;
- preserves 1h/6h/24h/7d/30d ranges, selectable aggregation resolution, zoom, min/max envelopes, state transitions, and window statistics;
- prioritizes battery voltage, array voltage, charge current, output/input power, and charge state in the historical explorer;
- retains the v0.3 Operations Intelligence console with incidents, transparent health scoring, local historical baselines, and charge-cycle summaries.

## v0.3 Operations Intelligence

The site and controller workspaces can consume the backend's proactive intelligence layer without
performing browser-side diagnosis. The frontend displays backend-provided incident lifecycle,
confidence, evidence, expected/observed ranges, health-score penalties, local solar baselines, and
charge-cycle summaries.

Site intelligence is available at:

```text
/site/intelligence
```

Controller-specific intelligence is available at:

```text
/controllers/:controllerUid/incidents
```

The existing system SSE stream also carries `incident_opened`, `incident_updated`, and
`incident_resolved` events. Those events invalidate the relevant TanStack Query caches immediately;
normal visibility-aware polling remains the reconnect/fallback path.

## v0.2 controller-native foundation

- `/` is a real system/site dashboard instead of redirecting to the first controller;
- stable controller workspaces are keyed by immutable `controller_uid`;
- old encoded `/devices/:deviceKey/...` bookmarks are resolved and redirected to the physical controller;
- latest telemetry, history, statistics, coverage, gap reconciliation, energy analytics, export, and polling diagnostics use controller-scoped API routes;
- site power flow, energy ledger, normalized history, events, topology, and component graph use `/v1/systems/...`;
- controller history integrity distinguishes live samples, controller-retained recovery, partial evidence, and genuinely missing days;
- controller energy compares source-backed controller-reported energy with locally integrated output-power history;
- device intelligence, register maps, and profile validation remain tied to the active raw connection only where the backend still exposes those engineering resources device-scoped.

The browser never writes Modbus registers, coils, controller settings, reset commands, equalization
commands, charge-state controls, or arbitrary protocol operations.

## Identity model

The frontend mirrors the backend's three-level model:

| Identity | Meaning | Frontend use |
| --- | --- | --- |
| `system_uid` | Persistent site/system grouping | Site dashboard, power flow, energy, events, topology, normalized history, incidents |
| `controller_uid` | Immutable physical-controller identity | **Canonical controller routes, latest telemetry, historical graphs, energy, health, incidents** |
| `device_id` | Raw telemetry-owning connection/storage identity | Current-connection engineering metadata and provenance |

A USB path, TCP address, or evidence-derived `controller_id` may change without changing the
`controller_uid`. Controller-native history therefore follows one physical controller across endpoint
changes without rewriting or losing the original `source_device_id` evidence.

## Site operations API

```http
GET /v1/systems
GET /v1/systems/{system_uid}/latest
GET /v1/systems/{system_uid}/power-flow
GET /v1/systems/{system_uid}/energy
GET /v1/systems/{system_uid}/energy-ledger
GET /v1/systems/{system_uid}/health
GET /v1/systems/{system_uid}/history
GET /v1/systems/{system_uid}/events
GET /v1/systems/{system_uid}/topology
GET /v1/systems/{system_uid}/component-graph
GET /v1/systems/{system_uid}/stream
GET /v1/systems/{system_uid}/incidents
GET /v1/systems/{system_uid}/baselines
GET /v1/systems/{system_uid}/health-score
```

Normalized metrics retain backend quality, contributor counts, source authority, and conflict
semantics. Whole-system measurements are not silently summed, Ah is not converted into invented Wh,
and unsupported energy quantities stay explicitly unknown.

## Controller-native operations API

```http
GET /v1/controllers/{controller_uid}
GET /v1/controllers/{controller_uid}/latest
GET /v1/controllers/{controller_uid}/registers/history
GET /v1/controllers/{controller_uid}/registers/stats
GET /v1/controllers/{controller_uid}/history/summary
GET /v1/controllers/{controller_uid}/history/coverage
GET /v1/controllers/{controller_uid}/history/gaps
GET /v1/controllers/{controller_uid}/energy/daily
GET /v1/controllers/{controller_uid}/energy/summary
GET /v1/controllers/{controller_uid}/history/export
GET /v1/controllers/{controller_uid}/polling/performance
GET /v1/controllers/{controller_uid}/incidents
GET /v1/controllers/{controller_uid}/health-score
GET /v1/controllers/{controller_uid}/charge-cycle
```

Raw controller-scoped history/export responses can still identify the original `source_device_id`.
The UI never fabricates high-frequency samples from retained daily history.

## Device-scoped engineering seam

Several engineering resources still describe the active raw connection rather than the lifetime
physical controller:

```http
GET /v1/devices/register-map
GET /v1/devices/intelligence
GET /v1/devices/profile/validation
```

The frontend intentionally resolves the controller's current device only for those resources. That
does not weaken controller-native routing or history ownership; it keeps the UI aligned with the
backend's actual API boundaries.

## Historical telemetry

The advanced telemetry explorer is available at:

```text
/controllers/:controllerUid/telemetry-history
```

It lazy-loads Apache ECharts and supports up to eight semantic series, range presets, selectable
aggregation resolution, zoom, representative/average lines, min/max envelopes, categorical state
transitions, and summary statistics. The default selection favors important electrical/charging
metrics when the active profile exposes them.

`/controllers/:controllerUid/history` is deliberately different: it is the **History integrity** view
for source coverage, recovered controller-retained evidence, partial periods, and real gaps.

Legacy encoded `/devices/:deviceKey/history` bookmarks redirect to the controller-native telemetry
history page.

## Register semantics

Register names and units come from the backend's active firmware-aware register map. When the backend
publishes `reserved_ranges`, documented manufacturer-reserved words are suppressed from semantic
series rather than mislabeled as unknown telemetry. The TriStar MPPT v11 frontend retains a narrow
compatibility fallback for its documented reserved spans.

Genuinely unknown raw addresses remain visible as `Unmapped ...` diagnostic evidence. Reserved words
are never given speculative semantic names.

## Live update model

For site pages, the frontend opens the read-only SSE stream:

```http
GET /v1/systems/{system_uid}/stream
```

Telemetry, system-event, and incident lifecycle messages invalidate the appropriate TanStack Query
cache entries. Visibility-aware query intervals remain active as a reconnect/fallback path.

Browser rendering cadence remains independent from controller Modbus polling and database persistence.

## Stack

- Vite 8 / Rolldown
- React 19 + strict TypeScript
- TanStack Query for server state and SSE-driven cache refresh
- React Router for URL-addressable site/controller workspaces
- Apache ECharts for the lazy-loaded advanced historical explorer
- Tailwind CSS 4 plus semantic CSS design tokens
- Vitest + Testing Library + MSW
- Playwright E2E

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

The development server proxies `/api/*` to `http://127.0.0.1:8080` and strips the `/api` prefix before
forwarding to MorningstarModbusAPI.

Run the complete quality gate with:

```bash
npm run check
```

For browser E2E:

```bash
npx playwright install chromium
npm run e2e
```

## Production deployment

```bash
npm run build
```

Serve `dist/` behind Caddy/nginx and proxy `/api/*` to the backend while stripping `/api`. Keeping the
frontend and backend on one browser origin avoids broad CORS rules and lets `EventSource` connect to
the same protected/LAN origin as normal HTTP requests.

## Routes

### Site

- `/` - default site overview;
- `/site/intelligence` - incidents, health scoring, production baseline, charge-cycle summaries;
- `/site/power` - source/quality-aware power flow;
- `/site/energy` - normalized energy plus evidence-preserving energy ledger;
- `/site/history` - normalized cross-controller metric history;
- `/site/events` - unified event timeline;
- `/site/topology` - transport topology plus component graph;
- `/devices` - physical-controller inventory.

### Physical controller

- `/controllers/:controllerUid/overview` - controller-native overview;
- `/controllers/:controllerUid/live` - active-connection semantic telemetry;
- `/controllers/:controllerUid/telemetry-history` - multi-series controller-native historical graphs;
- `/controllers/:controllerUid/history` - history integrity and gap recovery;
- `/controllers/:controllerUid/energy` - controller/local energy reconciliation;
- `/controllers/:controllerUid/incidents` - controller operations intelligence;
- `/controllers/:controllerUid/registers` - active device's firmware-aware register explorer;
- `/controllers/:controllerUid/intelligence` - active device intelligence/evidence;
- `/controllers/:controllerUid/diagnostics` - controller polling/history plus current-device engineering evidence;
- `/controllers/:controllerUid/data` - controller-scoped streaming export;
- `/display/controller/:controllerUid` - standalone wall display, also exposed directly in controller navigation.

Legacy encoded `/devices/:deviceKey/...` routes are compatibility redirects. They resolve the raw
current/canonical/historical device ID through controller inventory and replace the URL with the
corresponding immutable controller route.

## Design principles

1. Backend telemetry, identity, normalized metrics, incidents, and catalog metadata remain authoritative.
2. The frontend is read-only and exposes no controller mutation path.
3. `controller_uid` is the stable controller bookmark; connection IDs are provenance, not identity.
4. Site totals preserve aggregation/authority rules and explicit quality.
5. Retained daily evidence is never expanded into fake samples.
6. Historical telemetry graphs and history-integrity evidence remain separate operator tools.
7. Health scores are decomposable and link penalties to source-backed incidents rather than opaque AI scores.
8. Semantic register names must be source-backed; reserved words never receive invented labels.
9. Historical views remain usable when current live telemetry is unavailable.
10. Browser refresh, SSE delivery, Modbus polling, and persistence are separate cadences.

## Releases

The current published release is [v0.3.1](https://github.com/hasnocool/MorningstarModbusFrontend/releases/tag/v0.3.1).
It includes the controller-native v0.2 architecture, v0.3 Operations Intelligence, and the v0.3.1
telemetry-history/wall-display restoration.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) - application layers, identity/routing, API boundaries, reliability, and deployment.
- [`docs/design-system.md`](docs/design-system.md) - visual semantics, accessibility, register presentation, and component rules.
- [`docs/v0.2-controller-native-site-intelligence.md`](docs/v0.2-controller-native-site-intelligence.md) - controller-native migration and feature contract.
- [`docs/v0.3-operations-intelligence.md`](docs/v0.3-operations-intelligence.md) - incident/health/baseline operations-intelligence contract.
- [`docs/releases/v0.3.1.md`](docs/releases/v0.3.1.md) - published v0.3.1 release notes and compatibility summary.
