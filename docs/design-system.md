# Design system

The UI is themed as industrial solar operations software: dense enough for engineering diagnostics,
calm enough for an always-on display, and readable in dim or daylight environments. Visual polish
must not obscure provenance, uncertainty, controller state, or the difference between semantic and
raw data.

## Semantic color roles

- `energy-solar`: PV-side voltage/current/power
- `energy-battery`: battery-side electrical values
- `energy-charge`: active charging/controller flow
- `state-online`: confirmed healthy/online
- `state-warning`: degraded/stale/caution
- `state-fault`: error/fault/offline where appropriate
- neutral slate: metadata, borders, inactive controls, provenance, and engineering reference data

Status colors are semantic, not decorative, and should never be the only indication of state.

## Typography

The application intentionally uses local system sans-serif and monospace stacks. This keeps isolated
LAN deployments self-contained with no external font requests.

Use monospace/tabular presentation for:

- numeric telemetry;
- register names and addresses;
- raw words;
- device/connection IDs;
- firmware/catalog revisions;
- timings and low-level communications data.

Human-facing labels should remain plain-language and operator-oriented while preserving useful
technical acronyms such as MPPT, RTS, DIP, Vmp, Voc, Ah, Wh, and kWh.

## Controller identity presentation

A physical controller and a connection endpoint are not interchangeable concepts.

- Controller inventory cards represent physical controllers.
- USB paths, TCP targets, Modbus IDs, and historical endpoints are connection metadata.
- The current connection may be highlighted, but prior connections remain available as history.
- If serial identity is unavailable and endpoint identity is temporary, the UI should say so rather than implying certainty.

The design must avoid presenting one controller as several devices merely because its connection
changed.

## Register presentation rules

Register UI has three distinct semantic states:

1. **Named/documented** - display the backend semantic name, operator-friendly label, decoded value, unit, address, and description where relevant.
2. **Reserved** - do not invent a label or offer the word as a semantic chart series. Reserved raw evidence may remain available through lower-level/raw backend surfaces.
3. **Unknown/unmapped** - keep the raw alias visible as `Unmapped ...` when it represents a genuine catalog gap or diagnostic observation.

A raw alias that overlaps a documented multi-word register or reserved range must not appear as a
separate semantic metric.

The UI should prefer backend register-map metadata. Narrow profile-specific compatibility knowledge is
acceptable only when it is source-backed and exists to keep behavior correct against an older backend.

## Data-density hierarchy

The product has several information densities and should not force them into one visual style:

- **Overview** - operational values and status first.
- **Live telemetry** - semantic engineering snapshot with addresses/raw evidence available in tables.
- **History** - trends, envelopes, and state transitions.
- **Register explorer** - catalog/reference density with search and monospace identifiers.
- **Intelligence** - identity confidence, provenance, warnings, and structured evidence.
- **Diagnostics** - communications and storage health with explicit unsupported states.
- **Data/export** - coverage and extraction controls without loading full datasets into browser memory.

## Layout targets

1. Desktop engineering workstation.
2. Tablet field diagnostics.
3. Wall display.
4. Mobile remains functional but is not the primary optimization target.

Responsive layouts may reduce column count and visual density, but must not hide critical status,
units, provenance, or error information.

## Component rules

- Panels use one-pixel technical borders and restrained elevation.
- Gauges are avoided where exact numbers or trends communicate more clearly.
- Power flow is represented as PV -> controller -> battery.
- Register names, addresses, raw words, firmware IDs, and timing use monospace.
- Errors remain visible but do not block access to historical data when history is still available.
- Data visualizations do not average categorical states.
- State timelines and categorical values remain visually separate from numeric axes.
- Loading, empty, stale, unavailable, and unsupported are different states and must not share one generic placeholder.
- A `404` for an optional backend feature should be rendered as unsupported/upgrade-needed, not as a fatal application failure.

## Historical chart rules

Numeric history should preserve excursions:

- use the backend representative/average value as the primary line;
- retain min/max envelopes when supplied;
- avoid smoothing that implies unobserved physical behavior;
- keep categorical transitions out of the numeric Y-axis;
- show an explicit oversized-query state when the backend returns its history guardrail response.

Reserved registers must never appear as selectable history series merely because their raw words were
captured by a broad Modbus block read.

## Freshness and cadence

The browser refresh rate is a presentation concern, not a statement about controller polling rate or
database write rate.

- Latest telemetry can refresh every second while the backend polls faster or slower.
- Persisted polling-performance metrics may describe stored sample cadence rather than every in-memory Modbus read.
- Fresh/stale/old indicators should describe age of the displayed observation, not infer transport health beyond the backend evidence.

## Accessibility

- Maintain visible keyboard focus states.
- Keep tables as semantic HTML tables.
- Give charts and power-flow graphics accessible labels.
- Respect `prefers-reduced-motion`.
- Support dark, light, and high-contrast themes.
- Do not communicate alarm/fault/online state through color alone.
- Preserve readable contrast for dense engineering metadata and code text.

## Self-contained deployment

The frontend should not require external fonts, analytics, image CDNs, or third-party runtime assets.
That keeps local/off-grid operation predictable and reduces avoidable network dependencies.
