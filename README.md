# MorningstarModbusFrontend

A serious, read-only solar-controller operations console for
[`MorningstarModbusAPI`](https://github.com/hasnocool/MorningstarModbusAPI).

The application is designed as industrial monitoring software rather than a generic card dashboard:
live power flow, device intelligence, register inspection, historical telemetry, charge-state
analysis, data coverage/export, and feature-detected polling diagnostics.

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

The development server proxies `/api/*` to `http://127.0.0.1:8080` and strips the `/api`
prefix before forwarding to MorningstarModbusAPI.

Run the full local quality gate with:

```bash
npm run check
```

For E2E:

```bash
npx playwright install chromium
npm run e2e
```

## Production deployment

Build static assets:

```bash
npm run build
```

Serve `dist/` behind Caddy/nginx and proxy `/api/*` to the backend, stripping the `/api` prefix.
This keeps browser and backend on one origin and avoids exposing secrets or broad CORS rules.

## API compatibility

The frontend targets the current backend history/intelligence API and feature-detects the optional
polling-performance endpoints introduced by the adaptive polling work. A backend returning `404` for
those endpoints simply hides that diagnostics module.

## OpenAPI types

When a backend is running locally, refresh the checked/generated schema with:

```bash
npm run api:types
```

`OPENAPI_URL` can point at another backend OpenAPI document.

## Routes

- `/` system overview
- `/devices` device inventory
- `/devices/:deviceKey/overview`
- `/devices/:deviceKey/live`
- `/devices/:deviceKey/history`
- `/devices/:deviceKey/registers`
- `/devices/:deviceKey/intelligence`
- `/devices/:deviceKey/diagnostics`
- `/devices/:deviceKey/data`
- `/catalog`
- `/settings`
- `/display/:deviceKey` wall-display mode

Device IDs are encoded into URL-safe keys so serial stable IDs containing `/` do not break routing.

## Design principles

1. Raw telemetry remains authoritative; the frontend never writes Modbus/controller state.
2. Status colors are semantic, not decorative.
3. Historical views retain min/max envelopes and state transitions instead of flattening everything
   into averages.
4. Offline devices do not make historical data inaccessible.
5. Every data surface has explicit loading, stale, empty, unsupported, and error states.
6. Browser refresh cadence is independent of controller Modbus polling cadence.
