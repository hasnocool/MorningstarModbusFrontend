# Frontend architecture

## Product boundary

MorningstarModbusFrontend is a read-only browser client for MorningstarModbusAPI. It does not open
serial devices, issue Modbus requests, mutate controller configuration, or own telemetry truth.
The backend owns discovery, device identity, register decoding, persistence, controller history,
device intelligence, catalog semantics, and time-series aggregation.

```text
Morningstar controller
        |
        v
MorningstarModbusAPI
        |
        +-- physical-controller inventory
        +-- raw device/connection records
        +-- SQLite telemetry/history
        +-- device intelligence/catalog/register map
        +-- optional polling-performance metrics
        |
        v
same-origin reverse proxy
        |
        +-- /       Vite static frontend
        +-- /api/*  backend (prefix stripped)
        |
        v
browser
```

The frontend treats backend data as authoritative. It may derive labels, filtering, layout, and
presentation state, but it must not invent controller semantics.

## Application layers

```text
src/
├── api.ts                  raw-device HTTP contracts, errors, query hooks, refresh policies
├── controller-api.ts       physical-controller inventory contract (`/v1/controllers`)
├── lib.ts                  URL IDs, telemetry selection, formatting, register-map flattening
├── register-semantics.ts   reserved-range classification and semantic-series filtering
├── components.tsx          reusable operational UI primitives
├── app.tsx                 providers, shell, routing, feature-level lazy loading
├── pages/
│   ├── core.tsx            controller inventory, overview, live telemetry, wall display
│   ├── history.tsx         ECharts time-series explorer (lazy chunk)
│   └── engineering.tsx     registers, intelligence, diagnostics, data/export, catalog, settings
├── controller-inventory.css
└── styles.css              semantic design tokens + responsive industrial theme
```

TanStack Query owns server state. The application intentionally avoids a general client-side state
store. Route state owns the active connection; local component state owns filters; localStorage owns
presentation preferences such as theme.

## Identity model: controller versus connection

The frontend currently uses two backend identity surfaces.

### Physical controller inventory

`GET /v1/controllers` supplies controller records used by the `/devices` inventory and system shell.
One record represents one physical Morningstar controller and can contain several historical or
current connections.

A controller record includes its current raw `device_id`, current endpoint, prior endpoint history,
status, model/profile metadata, serial/firmware information when available, and an identity source.
The UI therefore does not duplicate one controller just because `/dev/ttyUSB0` changed to another USB
path or because a network address changed.

### Device-scoped workspaces

The current controller workspace routes still use the selected controller's `current_device_id`.
That ID is base64url-encoded into `:deviceKey` and is restored before requests to `/v1/devices/...`.
This keeps raw storage/provenance compatibility while inventory remains controller-oriented.

This distinction is intentional and should be preserved until the workspace query layer is migrated
to immutable controller-scoped endpoints end-to-end.

## Device routing

Backend raw device IDs can include serial paths such as `/dev/ttyUSB0`. Raw IDs must not be used
directly as React Router path segments. `encodeDeviceId` converts the UTF-8 identifier to base64url
and `decodeDeviceId` restores it before API calls.

Routes are deterministic and bookmarkable while avoiding wildcard/path ambiguity.

`/` is not a standalone aggregate dashboard when controllers are present: it resolves the physical
controller inventory and redirects to the first controller's current connection overview.

## Query cadence

| Resource | Browser refresh/cache policy |
| --- | ---: |
| `/health` | 10 s while visible |
| physical controller inventory | 5 s while visible |
| raw device inventory | 5 s while visible |
| latest telemetry | 1 s while visible |
| intelligence | 60 s stale cache |
| register map | 5 min stale cache |
| history | user/request driven |
| register statistics | 10 s stale cache |
| history summary | 10 s stale cache |
| polling performance | 5 s while visible when supported |
| catalog | 30 min stale cache |

The visible-page interval helper stops interval refetching when the document is hidden. Browser query
cadence does not configure controller Modbus polling or backend persistence cadence.

A backend may poll the controller faster than it persists telemetry. In that case a displayed
`poll_rate_hz` derived from persisted performance rows is not necessarily the instantaneous live
Modbus read rate.

## Register semantics pipeline

Register presentation has three classes:

1. **Named semantic register** - defined by the backend's active firmware-aware register map.
2. **Documented reserved word** - intentionally unnamed by Morningstar and identified by backend `reserved_ranges` metadata.
3. **Genuinely unknown raw address** - not covered by a semantic definition or a documented reserved range.

The frontend must not convert class 2 into class 3.

`flattenRegisterDefinitions` expands named multi-word fields and backend `reserved_ranges` into
address coverage. `semanticRegisterValues` then removes duplicate raw aliases that overlap a named or
documented address. The History route additionally uses `register-semantics.ts` so an older backend
without `reserved_ranges` still gets the known TriStar MPPT v11 reserved spans:

- `0x0005-0x0017`
- `0x002D`
- `0x003F`
- `0x004A`
- `0xE0C4-0xE0CB`

That fallback is deliberately profile-specific. Unknown raw addresses for other profiles remain
visible rather than being hidden speculatively.

This design keeps the UI truthful: documented data receives semantic names, reserved words remain
reserved, and real catalog gaps remain observable.

## Live telemetry and register explorer

The Live page joins the latest persisted values to the effective register map and hides raw aliases
that overlap known semantic or reserved addresses. It still exposes actual unknown raw rows for
engineering diagnostics.

The Register explorer is catalog-first: it displays firmware-filtered definitions, addresses,
functions, units, descriptions, and the current persisted value when available. The frontend never
adds controls for Modbus writes.

## Historical telemetry

The history route is the only route that imports Apache ECharts. Vite therefore emits charting as a
lazy route chunk instead of making the initial operations shell pay the chart-library cost.

Numeric aggregated series display the backend average/representative line and, when present, retain
min/max envelope lines. Text/state registers are kept out of numeric axes and receive a transition
timeline.

The series picker uses the same semantic/reserved filtering as live telemetry, so documented reserved
words cannot become selectable fake time series.

The frontend honors the backend `413` history-size guardrail and explains that the operator should use
a coarser resolution or shorter range instead of presenting a generic HTTP error.

## Data and export

The Data page builds streaming backend export URLs instead of loading complete exports into browser
memory. It supports CSV or JSONL, explicit history resolution, time presets, and register selection.
Backend raw/aggregated history semantics remain authoritative.

## Device intelligence

The Intelligence page displays the backend's model/profile decision rather than attempting its own
device classifier. Evidence, warnings, confidence, firmware, hardware revision, serial metadata,
catalog revision, and runtime profile validation are shown directly from backend responses.

## Optional backend features

Polling performance is feature detected:

```text
GET /v1/devices/polling/performance
  200 -> render diagnostics metrics
  404 -> render an unavailable/upgrade state
```

A missing optional endpoint cannot break the core dashboard.

The frontend also consumes `reserved_ranges` when present in the register-map payload while retaining
the narrow TS-MPPT v11 compatibility fallback described above.

## Reliability states

Every major data surface must be able to represent:

- loading
- loaded
- empty
- stale
- backend unavailable
- controller/connection unavailable
- unsupported feature/register
- oversized history query
- persisted device error

Historical views remain navigable when live telemetry is unavailable.

## Theming and accessibility

Visual styling is based on semantic variables such as `--energy-solar`, `--energy-battery`,
`--state-warning`, and `--surface-panel`. Components should not use color as the only carrier of
meaning.

The app ships dark, light, and high-contrast themes. It respects `prefers-reduced-motion`, uses
visible focus rings, preserves table semantics, and exposes chart/power-flow labels for assistive
technology.

## Testing and CI

The repository's normal quality surface includes:

- ESLint;
- strict TypeScript build/type checking;
- Vitest + Testing Library;
- MSW-backed API/component tests;
- production Vite build;
- gzip bundle-size guard;
- Playwright browser E2E against the production build.

Register semantic tests specifically cover backend-published reserved ranges, the older-API TriStar
fallback, shared Live-page filtering, and preservation of genuinely unknown raw addresses.

## Deployment

Recommended Caddy/nginx behavior:

```text
/           -> static dist/
/api/*      -> 127.0.0.1:8080, stripping /api
```

Keeping both surfaces on one origin avoids broad CORS rules and simplifies isolated LAN/off-grid
deployment.

## Current architectural boundary

The inventory is controller-first, but most detailed controller workspace queries remain raw
`device_id` scoped. This is the primary compatibility seam in the current frontend. When the backend
controller-scoped history/latest/register APIs become the frontend's default integration surface, the
route/context layer can migrate from encoded `current_device_id` to immutable controller identity
without changing the visual workspace structure.
