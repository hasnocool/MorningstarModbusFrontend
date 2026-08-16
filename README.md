# MorningstarModbusFrontend

A read-only site operations and engineering console for
[`MorningstarModbusAPI`](https://github.com/hasnocool/MorningstarModbusAPI).

The frontend is designed for always-on solar-controller monitoring rather than as a generic card
dashboard. It now treats the installation and immutable physical controllers as the primary product
entities while retaining raw device/connection provenance for engineering views.

> **Development status:** `main` is currently released as **v0.1.0**. This branch prepares
> **v0.2.0 Controller-Native Site Intelligence** against **MorningstarModbusAPI v0.6+**.

## v0.2 highlights

- `/` is a real system/site dashboard instead of a redirect to the first controller;
- stable controller workspaces are keyed by immutable `controller_uid`;
- old encoded `/devices/:deviceKey/...` bookmarks are resolved and redirected to the physical controller;
- latest telemetry, history, statistics, coverage, gap reconciliation, energy analytics, export, and polling diagnostics use controller-scoped API routes;
- site power flow, energy ledger, health, normalized history, events, topology, and component graph use `/v1/systems/...`;
- system Server-Sent Events invalidate the TanStack Query cache for low-latency updates while interval polling remains a fallback;
- controller history integrity distinguishes live samples, controller-retained recovery, partial evidence, and genuinely missing days;
- controller energy compares source-backed controller-reported energy with locally integrated output-power history;
- device intelligence, register maps, and profile validation remain tied to the active device connection because those backend engineering surfaces are still device-scoped.

The browser never writes Modbus registers, coils, controller settings, reset commands, equalization
commands, charge-state controls, or arbitrary protocol operations.

## Identity model

The frontend mirrors the backend's three-level model:

| Identity | Meaning | Frontend use |
| --- | --- | --- |
| `system_uid` | Persistent site/system grouping | Site dashboard, power flow, energy, events, topology, normalized history |
| `controller_uid` | Immutable physical-controller identity | **Canonical controller route and history/energy scope** |
| `device_id` | Raw telemetry-owning connection/storage identity | Current-connection engineering metadata and provenance |

A USB path, TCP address, or evidence-derived `controller_id` may change without changing the
`controller_uid`. Controller-native history therefore follows one physical controller across endpoint
changes without rewriting or losing the original `source_device_id` evidence.

## Site operations

The site layer uses the backend's normalized system API:

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
```

Normalized metrics retain backend quality, contributor counts, source authority, and conflict
semantics. Whole-system measurements are not silently summed, Ah is not converted into invented Wh,
and unsupported energy quantities stay explicitly unknown.

## Controller-native operations

Controller workspaces use immutable identity for the data surfaces that describe the physical device
over time:

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
```

Raw controller-scoped history/export responses can still identify the original `source_device_id`.
The UI never fabricates high-frequency samples from retained daily history.

## Device-scoped engineering seam

MorningstarModbusAPI v0.6 still exposes several engineering resources per active raw device. The
frontend intentionally resolves the controller's current device only for these surfaces:

```http
GET /v1/devices/register-map
GET /v1/devices/intelligence
GET /v1/devices/profile/validation
```

This does not weaken controller-native routing or history ownership; it keeps the UI aligned with the
backend's actual API boundaries rather than pretending a controller-scoped endpoint exists.

## Register semantics

Register names and units come from the backend's active firmware-aware register map. Raw aliases such
as `holding_0x003F` are not automatically treated as missing mappings. When the backend publishes
`reserved_ranges`, those addresses are classified as documented reserved words and suppressed from
semantic telemetry lists. The TriStar MPPT v11 frontend retains a narrow compatibility fallback for
its documented reserved spans.

Genuinely unknown raw addresses remain visible as `Unmapped ...` diagnostic evidence. Reserved words
are never given speculative semantic names.

## Live update model

Browser rendering cadence remains independent from controller Modbus polling and database persistence.
For site pages, the frontend opens the read-only SSE stream:

```http
GET /v1/systems/{system_uid}/stream
```

`telemetry` and `system_event` messages invalidate the appropriate TanStack Query cache entries. The
normal visibility-aware query intervals remain active as a reconnect/fallback path rather than making
the UI depend on a permanently healthy stream.

## Stack

- Vite 8 / Rolldown
- React 19 + strict TypeScript
- TanStack Query for server state and SSE-driven cache refresh
- React Router for URL-addressable system/controller workspaces
- Apache ECharts for the existing advanced historical explorer
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
frontend and backend on one browser origin avoids broad CORS rules and also lets `EventSource` connect
to the same protected/LAN origin as the normal HTTP API.

## Routes

### Site

- `/` - default site overview;
- `/site/power` - source/quality-aware power flow;
- `/site/energy` - normalized energy plus evidence-preserving energy ledger;
- `/site/history` - normalized cross-controller metric history;
- `/site/events` - unified event timeline;
- `/site/topology` - transport topology plus component graph;
- `/devices` - physical-controller inventory.

### Physical controller

- `/controllers/:controllerUid/overview` - controller-native overview;
- `/controllers/:controllerUid/live` - active-connection semantic telemetry;
- `/controllers/:controllerUid/history` - unified history integrity and gap recovery;
- `/controllers/:controllerUid/energy` - controller/local energy reconciliation;
- `/controllers/:controllerUid/registers` - active device's firmware-aware register explorer;
- `/controllers/:controllerUid/intelligence` - active device intelligence/evidence;
- `/controllers/:controllerUid/diagnostics` - controller polling/history plus current-device intelligence;
- `/controllers/:controllerUid/data` - controller-scoped streaming export;
- `/display/controller/:controllerUid` - wall display resolved through the controller's current connection.

Legacy encoded `/devices/:deviceKey/...` routes are compatibility redirects. They resolve the raw
current/canonical/historical device ID through controller inventory and replace the URL with the
corresponding immutable controller route.

## Design principles

1. Backend telemetry, identity, normalized metrics, and catalog metadata remain authoritative.
2. The frontend is read-only and exposes no controller mutation path.
3. `controller_uid` is the stable controller bookmark; connection IDs are provenance, not identity.
4. Site totals preserve aggregation/authority rules and explicit quality.
5. Retained daily evidence is never expanded into fake samples.
6. Semantic register names must be source-backed; reserved words never receive invented labels.
7. Unknown raw register aliases remain available when they are genuine diagnostic evidence.
8. Historical views remain usable when current live telemetry is unavailable.
9. Loading, stale, empty, unsupported, offline, and error states are deliberate product states.
10. Browser refresh, SSE delivery, Modbus polling, and persistence are separate cadences.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) - application layers, identity/routing, API boundaries, reliability, and deployment.
- [`docs/design-system.md`](docs/design-system.md) - visual semantics, accessibility, register presentation, and component rules.
- [`docs/v0.2-controller-native-site-intelligence.md`](docs/v0.2-controller-native-site-intelligence.md) - v0.2 migration and feature contract.
