# Architecture

## Runtime layers

1. `src/main.tsx` mounts React, BrowserRouter and the shared Provider, and lazily selects the appropriate interface shell.
2. `src/DesktopApp.tsx` routes the main analytical workspace. Mobile, desktop workstation, IoT and watch have their own shell directories.
3. `src/store.tsx` manages shared selection, dataset projection, evidence source isolation and persistence under `malariascope-v1`.
4. Pure TypeScript engines handle validation, incidence, risk, warnings, forecasts, readiness, scenarios and reports. UI components present their results.
5. Static research artifacts live under `public/data/`; checksummed study inputs are under `public/data/verified/`.

Leaflet displays public vectors and optional tiles. Recharts presents analytical charts. Spatial and hotspot workers move expensive calculations off the main thread. Vite splits heavy vendor modules; GIS lifecycle cleanup must survive navigation and StrictMode.

## Boundaries

Observed rows remain distinct from saved predictions and scenario outputs. Synthetic demo projection excludes research joins and historical research-alert persistence. Public geometry gives geographic context, not proof of observed burden. No server database, authenticated API or fitted model runtime exists in the current implementation.

Review [repository structure](16-repository-structure.md) before adding modules and [project rules](00-project-rules.md) before changing evidence behavior.
