# System overview

MALARIASCOPE combines surveillance, geospatial context, district evidence, climate exploration, saved hindcast evaluation, explainable risk, analytical alerts, readiness reviews and reports in a browser research workspace.

## Available interfaces

| Interface           | Route               | Purpose                                              |
| ------------------- | ------------------- | ---------------------------------------------------- |
| Main workspace      | `/dashboard`        | Analytical modules with shared context               |
| Mobile              | `/mobile`           | Touch-friendly views, filters and cached evidence    |
| Desktop workstation | `/aplikasi-desktop` | Dedicated desktop analytical interface               |
| Environmental IoT   | `/iot`              | Environmental observations and adapter configuration |
| Watch demonstration | `/smartwatch`       | Companion demonstration interface                    |

Year, district, model, risk mode and active dataset share the provider in `src/store.tsx`. URL selection and browser-local persistence support navigation across views.

The current application has no mandatory backend, server authentication, model-training service or external alert delivery. IoT adapters do not establish that live sensors are connected. Mobile cache availability does not establish data freshness. Research outputs are retrospective, not live forecasts or operationally validated decisions.

See [architecture](02-architecture.md) and the existing [research documentation](docs/RESEARCH-DESKTOP-IOT.md).
