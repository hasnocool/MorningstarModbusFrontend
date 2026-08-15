# Frontend architecture

## Product boundary

MorningstarModbusFrontend is a read-only browser client for MorningstarModbusAPI. It does not open
serial devices, issue Modbus requests, mutate controller configuration, or own telemetry truth.
The backend owns discovery, decoding, persistence, device intelligence, and time-series aggregation.

```text
Morningstar controller
        |
        v
MorningstarModbusAPI
        |
        +-- SQLite telemetry/history
        +-- device intelligence/catalog
        +-- optional polling performance
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

## Application layers

```text
src/
├── api.ts                  HTTP contracts, errors, query hooks, refresh policies
├── lib.ts                  URL IDs, telemetry selection, formatting, register-map flattening
├── components.tsx          reusable operational UI primitives
├── app.tsx                 providers, shell, routing, feature-level lazy loading
├── pages/
│   ├── core.tsx            device inventory, overview, live telemetry, wall display
│   ├── history.tsx         ECharts time-series explorer (lazy chunk)
│   └── engineering.tsx     registers, intelligence, diagnostics, data/export, catalog, settings
└── styles.css              semantic design tokens + responsive industrial theme
```

TanStack Query owns server state. The application intentionally avoids a general client-side state
store. Route state owns the active device; local component state owns filters; localStorage owns only
presentation preferences such as theme.

## Device routing

Backend stable IDs can include serial paths such as `/dev/ttyUSB0`. Raw IDs therefore must not be
used directly as React Router path segments. `encodeDeviceId` converts the UTF-8 identifier to
base64url and `decodeDeviceId` restores it before API calls.

This avoids ambiguous wildcard routing while keeping links deterministic and bookmarkable.

## Query cadence

| Resource | Browser refresh |
| --- | ---: |
| `/health` | 10 s |
| device inventory | 5 s |
| latest telemetry | 1 s |
| intelligence | 60 s / stale cache |
| register map | 5 min / stale cache |
| history | user/request driven |
| polling performance | 5 s when supported |

Intervals pause/reduce when the page is hidden. Browser query cadence does not change Modbus polling
cadence.

## Historical telemetry

The history route is the only route that imports Apache ECharts. Vite therefore emits charting as a
lazy route chunk instead of making the initial operations shell pay the chart-library cost.

Numeric aggregated series display the backend average/representative line and, when present, retain
min/max envelope lines. Text/state registers are kept out of numeric axes and receive a transition
timeline.

The frontend honors the backend `413` history-size guardrail and explains that the operator should use
a coarser resolution or shorter range instead of presenting a generic HTTP error.

## Optional backend features

Polling performance is feature detected:

```text
GET /v1/devices/polling/performance
  200 -> render diagnostics metrics
  404 -> render an unavailable/upgrade state
```

The optional endpoint cannot break the core dashboard.

## Reliability states

Every major data surface must be able to represent:

- loading
- loaded
- empty
- stale
- backend unavailable
- device unavailable
- unsupported feature/register
- oversized history query

Historical views remain navigable when live telemetry is unavailable.

## Theming and accessibility

Visual styling is based on semantic variables such as `--energy-solar`, `--energy-battery`,
`--state-warning`, and `--surface-panel`. Components do not embed product-specific hex values.

The app ships dark, light, and high-contrast themes. It respects `prefers-reduced-motion`, uses
visible focus rings, preserves table semantics, and exposes chart/power-flow labels for assistive
technology.

## Testing

- Vitest + Testing Library for component behavior.
- MSW for backend contracts without a live Morningstar API.
- Playwright for browser-shell and production-build smoke coverage.
- TypeScript strict mode.
- ESLint + Prettier.
- A gzip chunk budget prevents accidental initial bundle growth.

## Deployment

Recommended Caddy/nginx behavior:

```text
/           -> static dist/
/api/*      -> 127.0.0.1:8080, stripping /api
```

Keeping both surfaces on one origin avoids broad CORS rules and makes local/off-grid deployment
simple.
