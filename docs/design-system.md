# Design system

The UI is themed as industrial solar operations software: dense enough for diagnostics, calm enough
for an always-on display, and readable in both dim and daylight environments.

## Semantic color roles

- `energy-solar`: PV-side voltage/current/power
- `energy-battery`: battery-side electrical values
- `energy-charge`: active charging/controller flow
- `state-online`: confirmed healthy/online
- `state-warning`: degraded/stale/caution
- `state-fault`: error/fault/offline where appropriate
- neutral slate: metadata, borders, inactive controls

Status colors are never decorative.

## Typography

The application intentionally uses local system sans-serif and monospace stacks. This makes an
isolated LAN deployment self-contained with no external font requests. Numeric telemetry uses
tabular monospace presentation.

## Layout targets

1. Desktop engineering workstation.
2. Tablet field diagnostics.
3. Wall display.
4. Mobile remains functional but is not the primary optimization target.

## Component rules

- Panels use one-pixel technical borders and restrained elevation.
- Gauges are avoided where exact numbers or trends communicate more clearly.
- Power flow is represented as PV -> controller -> battery.
- Register names, addresses, raw words, firmware IDs, and timing use monospace.
- Errors remain visible but do not block access to historical data.
- Data visualizations do not average categorical states.
