# MorningstarModbusFrontend

A read-only operations and engineering console for
[`MorningstarModbusAPI`](https://github.com/hasnocool/MorningstarModbusAPI).

The frontend is designed for always-on solar-controller monitoring rather than as a generic card
dashboard. It combines physical-controller inventory, live power flow, device intelligence, register
inspection, historical telemetry, charge-state analysis, export tooling, communications diagnostics,
and a wall-display mode while keeping the backend as the source of truth.

## Current capabilities

- physical-controller inventory backed by `GET /v1/controllers`;
- connection-history display so USB paths and network endpoints are not presented as separate physical controllers;
- latest decoded telemetry and PV -> controller -> battery power flow;
- firmware-aware register explorer with current values and catalog metadata;
- reserved-register handling that distinguishes Morningstar-documented reserved words from genuinely unknown raw addresses;
- historical multi-series charts with min/max envelopes and categorical state-transition timelines;
- device-intelligence evidence, warnings, profile validation, firmware, hardware, model, and serial metadata;
- database coverage, CSV/JSONL streaming export, and history-size guardrail handling;
- optional polling-performance diagnostics with graceful fallback when the backend does not expose them;
- dark, light, high-contrast, responsive, and wall-display presentation modes;
- explicit loading, stale, empty, unsupported, offline, and error states.

The browser never writes Modbus registers, coils, controller settings, reset commands, or charge-state
controls.

## Controller and connection model

The UI has two related identity layers:

1. **Physical controller inventory** - `/v1/controllers` supplies one inventory record for one physical controller, including current and historical connections.
2. **Current device connection** - controller workspaces currently route using that controller's `current_device_id` and query the legacy-compatible `/v1/devices/...` telemetry/history endpoints.

This means a USB path or DHCP address is treated as connection history in the inventory, while the
workspace still has an exact raw-device provenance key for current API calls. The frontend does not
invent controller identity itself.

## Register semantics

Register names and units come from the backend's active firmware-aware register map.

Raw aliases such as `holding_0x003F` are not automatically treated as missing mappings. When the
backend publishes `reserved_ranges`, those addresses are classified as documented reserved words and
suppressed from semantic telemetry/series lists. The TriStar MPPT v11 frontend also carries a narrow
compatibility fallback for its documented reserved spans so it behaves correctly with an older
backend that has not yet added `reserved_ranges`.

Genuinely unknown raw addresses remain visible as `Unmapped ...` diagnostic evidence. Reserved words
are never given speculative semantic names.

## Polling and persistence semantics

Browser refresh cadence is independent of both controller Modbus polling and backend database
persistence cadence. For example, the UI may refresh latest telemetry every second even if the
backend is polling the controller faster than that.

Polling-performance values displayed by the frontend are whatever the backend has persisted and
published. On a backend that polls faster than it stores telemetry, `poll_rate_hz` can therefore be a
persisted performance/history sample rate rather than the instantaneous in-memory Modbus read rate.

## Stack

- Vite 8 / Rolldown
- React 19 + strict TypeScript
- TanStack Query for server state
- React Router for URL-addressable workspaces
- Apache ECharts, lazy-loaded on the history route
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

That runs lint, strict TypeScript checks, unit tests, the production build, and the bundle-size check.
For browser E2E:

```bash
npx playwright install chromium
npm run e2e
```

## Production deployment

Build static assets:

```bash
npm run build
```

Serve `dist/` behind Caddy/nginx and proxy `/api/*` to the backend while stripping `/api`. Keeping the
frontend and backend on one browser origin avoids broad CORS rules and is well suited to isolated LAN
or off-grid deployments.

## Backend compatibility

Core inventory expects the backend controller inventory endpoint:

```http
GET /v1/controllers
```

Current controller workspaces use the selected connection's raw device ID with endpoints such as:

```http
GET /v1/devices/latest
GET /v1/devices/register-map
GET /v1/devices/registers/history
GET /v1/devices/registers/stats
GET /v1/devices/history/summary
GET /v1/devices/history/export
GET /v1/devices/intelligence
GET /v1/devices/profile/validation
```

Polling diagnostics are feature-detected. A `404` from `/v1/devices/polling/performance` is rendered
as an unavailable/upgrade state rather than breaking the rest of the console.

The frontend can consume backend `reserved_ranges` register-map metadata when available and retains a
TriStar MPPT v11 reserved-range compatibility fallback for older API deployments.

## OpenAPI types

When a backend is running locally, refresh generated API schema/types with:

```bash
npm run api:types
```

`OPENAPI_URL` can point at another backend OpenAPI document.

## Routes

- `/` - redirects to the first physical controller's current connection when one exists;
- `/devices` - physical-controller inventory;
- `/devices/:deviceKey/overview` - selected connection overview;
- `/devices/:deviceKey/live` - latest semantic telemetry;
- `/devices/:deviceKey/history` - multi-series historical telemetry;
- `/devices/:deviceKey/registers` - firmware-filtered register explorer;
- `/devices/:deviceKey/intelligence` - identity evidence and validation;
- `/devices/:deviceKey/diagnostics` - health, communications, coverage, and polling diagnostics;
- `/devices/:deviceKey/data` - streaming data export;
- `/catalog` - backend device catalog;
- `/settings` - UI/runtime information and theme settings;
- `/display/:deviceKey` - wall-display mode.

Raw device IDs are encoded into URL-safe keys so serial IDs containing `/` do not break routing.

## Design principles

1. Backend telemetry and catalog metadata remain authoritative; the frontend is read-only.
2. One physical controller is not duplicated merely because its USB or network endpoint changed.
3. Semantic register names must be source-backed; reserved words never receive invented labels.
4. Unknown raw register aliases remain available when they are genuine diagnostic evidence.
5. Status colors are semantic, not decorative.
6. Historical views retain min/max excursions and state transitions instead of flattening everything into averages.
7. Offline live telemetry must not make historical data inaccessible.
8. Every data surface must represent loading, stale, empty, unsupported, and error states deliberately.
9. Browser refresh, Modbus polling, and database persistence are separate cadences.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) - data flow, API boundaries, identity/routing, register semantics, query cadence, reliability, and deployment.
- [`docs/design-system.md`](docs/design-system.md) - visual semantics, accessibility, register presentation, and component rules.
