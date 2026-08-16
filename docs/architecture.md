# Frontend architecture

## Product boundary

MorningstarModbusFrontend is a read-only browser client for MorningstarModbusAPI. It never opens
serial devices, issues Modbus writes, mutates controller configuration, acknowledges alarms, or owns
telemetry truth. The backend owns discovery, physical-controller identity, decoding, persistence,
retained-history reconciliation, incidents, system aggregation, and engineering metadata.

```text
Morningstar controller(s)
        |
        v
MorningstarModbusAPI
        |
        +-- controller inventory / immutable controller_uid
        +-- raw connection/device provenance
        +-- controller-native history + energy
        +-- system/site aggregation
        +-- incidents + baselines + health scores
        +-- engineering catalog/register metadata
        |
        v
same-origin reverse proxy
        |
        +-- /       Vite frontend
        +-- /api/*  backend (prefix stripped)
        |
        v
browser
```

The frontend may derive presentation state, labels, chart selection, and layout, but backend evidence
and quality metadata remain authoritative.

## Application layers

```text
src/
├── api.ts                    raw-device engineering HTTP contracts and shared primitives
├── controller-api.ts         physical-controller inventory (`/v1/controllers`)
├── controller-data.ts        controller-native latest/history/stats/energy/polling/export hooks
├── system-api.ts             site/system latest, power, energy, history, events, topology, SSE
├── intelligence-api.ts       incidents, health score, baselines, charge-cycle hooks
├── lib.ts                    formatting, URL compatibility IDs, telemetry helpers
├── register-semantics.ts     semantic/reserved register classification
├── components.tsx            reusable operator UI primitives
├── app.tsx                   providers, shell, canonical routing, legacy redirects
├── pages/
│   ├── core.tsx              inventory, active telemetry, standalone wall display
│   ├── controller-native.tsx controller overview, integrity, energy, diagnostics, data
│   ├── history.tsx           lazy ECharts controller-native telemetry explorer
│   ├── site.tsx              site overview/power/energy/history/events/topology
│   ├── operations-intelligence.tsx
│   │                         site + controller incident/health/baseline views
│   └── engineering.tsx       register map, device intelligence, catalog, settings
└── styles / feature CSS
```

TanStack Query owns server state. Route state identifies the site/controller workspace; local
component state owns filters and chart selections; localStorage owns presentation preferences such as
theme.

## Identity model

The UI uses three backend identity levels.

### `system_uid`

Represents the persistent installation/site grouping. Site pages use `/v1/systems/{system_uid}/...`
for normalized latest telemetry, power flow, energy, history, events, topology, component graph,
incidents, baselines, health scoring, and the SSE stream.

### `controller_uid`

Represents the immutable physical Morningstar controller and is the canonical controller route key.
The following operator surfaces are controller-native:

- latest telemetry;
- multi-series historical telemetry;
- register statistics;
- history summary/coverage/gaps;
- energy daily/summary reconciliation;
- polling diagnostics;
- controller-scoped export;
- incidents and health scoring;
- charge-cycle summaries.

A USB path, TCP address, or backend `device_id` can change without changing the controller URL.
Historical API responses may still expose `source_device_id` so provenance is preserved.

### `device_id`

Represents the raw telemetry-owning connection/storage identity. It is no longer the canonical
controller bookmark. The frontend resolves the controller's current `device_id` only for engineering
resources that remain device-scoped in the backend, such as register-map, device-intelligence, and
profile-validation endpoints.

## Routing

Canonical site routes:

```text
/
/site/intelligence
/site/power
/site/energy
/site/history
/site/events
/site/topology
/devices
```

Canonical controller routes:

```text
/controllers/:controllerUid/overview
/controllers/:controllerUid/live
/controllers/:controllerUid/telemetry-history
/controllers/:controllerUid/history
/controllers/:controllerUid/energy
/controllers/:controllerUid/incidents
/controllers/:controllerUid/registers
/controllers/:controllerUid/intelligence
/controllers/:controllerUid/diagnostics
/controllers/:controllerUid/data
/display/controller/:controllerUid
```

`telemetry-history` and `history` deliberately mean different things. The former is the interactive
multi-series chart explorer. The latter is History Integrity: evidence coverage, controller-retained
recovery, partial periods, and real gaps.

Legacy `/devices/:deviceKey/...` bookmarks decode the historical raw device ID, resolve it through the
controller inventory, and replace the route with the immutable controller path. Legacy `history`
bookmarks map to `telemetry-history` to preserve the pre-v0.2 graphing behavior.

## Query and live-update cadence

| Resource | Browser behavior |
| --- | --- |
| health | periodic visibility-aware refresh |
| controller inventory | periodic visibility-aware refresh |
| controller latest | fast periodic refresh; also refreshed from site SSE |
| site latest/power/energy | query cache + SSE invalidation |
| controller history/statistics | user/range driven |
| history coverage/gaps | slower evidence cache |
| incidents/health/baselines/charge cycle | query cache + incident SSE invalidation |
| register map | long-lived engineering cache |
| catalog | long-lived cache |

The system `EventSource` stream can carry telemetry, system events, and incident lifecycle events.
SSE never becomes the only delivery path: normal queries remain the reconnect/fallback mechanism.
Browser refresh cadence is independent from Modbus polling and database persistence cadence.

## Historical telemetry

`pages/history.tsx` is lazy-loaded so Apache ECharts does not inflate the initial application shell.
The page queries controller-scoped history and statistics using immutable `controller_uid`.

Capabilities include:

- 1h, 6h, 24h, 7d, and 30d presets;
- auto/raw/1m/5m/15m/1h/1d resolution selection;
- up to eight simultaneous semantic series;
- inside and slider zoom;
- representative/average line plus min/max envelopes when supplied by the backend;
- categorical state transition timeline;
- range statistics;
- explicit handling of the backend `413` oversized-history guardrail.

Default series selection prioritizes battery voltage, array voltage, charge current, output/input
power, and charge state when present. Register-map semantics still come from the active engineering
connection, but the actual time-series query spans all source device IDs associated with the physical
controller.

## History integrity and retained evidence

History Integrity is separate from graph history. It uses controller coverage/gap endpoints to explain
which periods are backed by realtime samples, retained controller daily records, partial evidence, or
no recoverable evidence. The frontend must never synthesize high-frequency points from daily retained
records merely to make a graph look continuous.

## Operations Intelligence

The v0.3 intelligence UI consumes backend findings rather than implementing detector thresholds in
React. It displays:

- active and resolved incident lifecycle;
- severity and confidence;
- observed versus expected values;
- evidence/provenance;
- decomposed health score categories and incident-linked penalties;
- offline historical solar baselines;
- controller charge-cycle summaries.

Incident lifecycle SSE events invalidate the relevant site/controller intelligence caches. The UI
remains read-only and performs no alarm acknowledgement or control action.

## Register semantics pipeline

Register presentation has three classes:

1. **Named semantic register** - defined by the backend firmware-aware register map.
2. **Documented reserved word** - intentionally unnamed and identified by `reserved_ranges`.
3. **Genuinely unknown raw address** - not covered by a semantic definition or reserved range.

The frontend must never turn class 2 into class 3. `register-semantics.ts` also retains the narrow
TriStar MPPT v11 reserved-range compatibility fallback for older backend deployments.

## Wall display

The standalone wall display lives outside the normal application shell at:

```text
/display/controller/:controllerUid
```

It is linked both from the controller navigation and the top-bar monitor action. Controller identity
is stable; the page resolves the current connection for active telemetry while preserving the
controller-native URL.

## Data and export

The Data page builds controller-scoped streaming backend export URLs instead of loading complete
exports into browser memory. CSV/JSONL, time range, history resolution, and selected semantic names
remain backend-authoritative.

## Reliability states

Every major surface must represent loading, loaded, empty, stale, backend unavailable, controller
offline, unsupported feature/register, oversized history query, and persisted error states.
Historical/integrity views remain navigable when live telemetry is unavailable.

## Testing and CI

The repository quality surface includes:

- ESLint;
- strict TypeScript;
- Vitest + Testing Library;
- MSW API/component fixtures;
- production Vite build;
- gzip bundle-size guard;
- Playwright browser E2E.

The v0.3.1 telemetry-history/wall-display restoration passed this entire surface before release.

## Deployment

Recommended reverse-proxy behavior:

```text
/           -> static dist/
/api/*      -> 127.0.0.1:8080, stripping /api
```

Keeping both surfaces on one origin avoids broad CORS rules and simplifies isolated LAN/off-grid
deployment and same-origin `EventSource` use.

## Current architectural boundary

The primary operational model is now controller-native and site-native. The remaining intentional
compatibility seam is limited to engineering metadata endpoints that the backend still exposes by raw
`device_id`. Those views must continue to display their device/connection provenance explicitly and
must not be mistaken for lifetime physical-controller state.
