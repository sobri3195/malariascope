# Research evidence, desktop workstation and environmental IoT

This update extends the existing application. It adds no backend, cloud IoT dependency, model training, clinical advice or operational directives. User datasets, checklists, alerts and scenarios remain local and independently labeled.

## Routes and implementation

- `/aplikasi-desktop`: a three-region workstation reusing existing dashboard, GIS, district, surveillance, climate, forecast, risk, readiness, simulator, integrity, import, report and settings components. Collapsible regions, maximize/restore, presets, comparison cards, shared filters, snapshots and command palette persist locally. The inspector uses the existing district, neighbor and readiness engines. Ctrl/Cmd K, G then D/M/F/A/R and Escape are available; text entry is protected. This is a browser workspace; a desktop service worker/Electron wrapper is intentionally not introduced. The existing scoped mobile PWA now caches the checksummed study artifacts.
- `/iot`: local environmental registry, CSV/JSON ingestion with validation preview, telemetry timeline, sensor health, alerts, local vector map, coverage/district summaries, provenance, exports and printable report. HTTP polling, JSON WebSocket and anonymous QoS 0 MQTT-over-WebSocket adapters are optional. Their URLs are not persisted. Private addresses and credential parameters are rejected; unavailable brokers leave local functionality usable.
- `/forecasting/failure-analysis`: supplied saved hindcast failures and uncertainty, separate from the legacy aggregate-only state.
- `/prospective-registry`: initially empty local user-entered forecast records, SHA-256/version/cutoff/issue metadata, immutable locked fields and later outcome import.
- `/model-monitoring`: historical reference separate from subsequently registered outcomes; calculates MAE, RMSE, bias, district errors and Persistence comparison. No automatic retraining.

Primary new code: `src/research-data/`, `src/desktop/`, `src/iot/`, `src/ProspectiveRegistry.tsx`, `src/prospective-engine.ts`. Existing store, desktop, forecasting, district aggregation, GIS, integrity, mobile and watch components use the shared package. No package dependencies were added. `vercel.json` already rewrites deep application routes while preserving data files.

## Bundled evidence and provenance

`public/data/verified/manifest.json` records versions, classifications, source/verification limits and SHA-256 for every package artifact. The shared loader validates hashes, row counts and exact annual/spatial totals before activating the study. Source-field metadata distinguishes observed cases, denominators, climate and saved model outputs even when materialized into shared records. The default package is read-only; user imports are retained and switching back to the study is available.

| File | Records / scope |
| --- | --- |
| surveillance-balanced-2020-2025.csv | 48, eight districts, 2020–2025 |
| surveillance-2025-all-nine.csv | 9, distinct spatial snapshot with Supiori |
| climate-annual-2020-2025.csv | 48 annual aggregates; modeled districts |
| model-predictions-2025.csv | 8 districts × five saved model columns |
| model-errors-2025.csv | 8 districts, supplied RF/Persistence errors |
| forecast-risk-2025.csv | 8, prior-population RF intensity/category |
| model-performance.json | Five 2025 models plus RF 2024 reference |
| spatial-analysis-2025.json | Supplied nine-district global Moran result |
| source-quality-ledger.json | Four unresolved source issues |
| papua-study-adm2.geojson | Nine actual public ADM2 Polygon/MultiPolygon features |

Other artifacts: district registry, uncertainty intervals, evidence coverage, system status and geometry metadata. The balanced annual totals are 104,544; 116,675; 180,950; 151,127; 204,727; 288,131 (total 1,046,154). All-nine 2025 sums to 288,879 cases and 1,073,637 at-risk population. These are distinct cohorts; per-district numbers agree across views. All-source joined views explicitly include nine units; the balanced dashboard total covers eight.

The classification **VERIFIED_RESEARCH_EXTRACTION** identifies faithful extraction from the supplied study tables, **not independent verification of the underlying official reports**. Research redistribution licensing was not specified by the supplier; this limitation is recorded in the manifest. Header-only legacy files remain import templates, separate from populated verified-package files.

Geometry comes from geoBoundaries gbOpen IDN ADM2, identifier `IDN-ADM2-22746128`, release `9469f09`, represented vintage 2020. Source: BPS/WFP/OCHA; license CC BY 3.0 IGO. The source-authored simplified artifact was downloaded through GitHub's LFS media endpoint and its SHA-256 verified against the release pointer: `146653d488331086ddc43d159a261b01ea6dd08c7ed422e34a9886c3c690430c`. The package contains an exact nine-feature subset with name/code/alias fields; no polygons were invented. Identifiers are geoBoundaries shape IDs, not newly asserted official district codes. Source URL, license, vintage and subset hash are recorded in geometry metadata. Local vectors require no API key or network tiles.

## Scientific limits retained

- The study metadata reports 53 of 54 outcomes. Only **49 unique observed outcomes were supplied** in these tables. Supiori 2020–2023 are NOT SUPPLIED; 2024 is MISSING. No historical values or predictions were reconstructed for Supiori.
- Four unresolved source issues remain visible: missing Supiori 2024, repeated Biak 2023/2024 count, 2024 narrative/table discrepancy and 2025 district-table vs contemporary statement discrepancy. The latter totals (288,879 and 303,931) are never averaged.
- All saved 2025 predictions are **RETROSPECTIVE HINDCAST**, using preceding-year predictors. Chronological separation does not establish historical operational source availability. No real-time outbreak prediction is claimed.
- Reported full-precision MAEs remain separate from recalculations of rounded forecasts. RF supplied MAE is 12,690.256937171625; paired rounded-row MAE is 12,690.2625. Persistence supplied MAE is 10,425.5. Leaderboards are metric-dependent; no model is hard-coded as best.
- RF/Persistence paired MAE-difference uncertainty crosses zero. Statistical superiority is not established. Climate ablation did not improve ridge MAE in this evaluation; that is not a statement about biological effects. Numerical permutation-importance values and trained artifacts were not supplied.
- RF relative intensity uses prior population and training-derived cutpoints (126.86557, 200.00036, 371.14424); it is separate from observed API, individual probability and clinical thresholds.
- Supplied Moran I = 0.165, p = 0.1301, 9,999 permutations, expected I = −0.125, symmetrized row-standardized three-nearest-centroid weights. Global clustering is not established. The application's optional queen-contiguity calculations and descriptive quadrants are a different analysis; no confirmed local hotspot claims are made.
- Population/observed API are supplied only for 2025. Earlier incidence, missing climate, healthcare resources, completed 2026 outcomes and prospective forecasts retain honest unavailable states. Readiness checklists remain local user-entered evidence, not resource availability verification.
- The prospective registry is not independently timestamped or tamper-proof. Forecasts must be locked before the target period starts; outcomes can be entered only after the annual/monthly/daily target period is complete; registered counts are user-entered and do not independently verify outcomes.

## IoT schema and isolation

The three `public/data/iot/` files deliberately contain no sensors or measurements. Default state: **No IoT sensor dataset connected.** Nothing is randomized into production.

Registry fields: `sensor_id`, `sensor_name`, `sensor_type` (environmental research), `district`, `installation_type`, `data_source`; optional `district_code`, paired finite `latitude`/`longitude`, `last_seen`, battery 0–100, firmware, MAINTENANCE status and source-declared research verification status. Imported declarations are not independent verification. Both coordinates must be supplied or both absent; no missing position is converted to zero. Environmental metadata with credentials, private addresses or sensitive identifying/tracking fields is rejected.

Telemetry fields: `measurement_timestamp` (or `timestamp`), optional `received_timestamp` (defaults to import reception), `sensor_id`, optional `district_code`, `variable`, numeric/null `value`, explicit `unit`, optional source quality flag, `source`. Accepted variables/units: rainfall_mm/mm, temperature_c/°C, humidity_pct/%, pressure_hpa/hPa, battery_pct/%, optional mosquito_count/count. Missing/invalid/duplicate records are retained with flags and issues; invalid values are excluded from summaries. No automatic unit conversion or scientific correction occurs. Measurement time is distinct from delayed synchronization time.

Sensor health derives ONLINE/DEGRADED/OFFLINE/MAINTENANCE/NOT CONNECTED. Thresholds, missing readings, time gaps, battery, last seen and historical sample z-score anomalies are explicit. Completeness is accepted readings / supplied readings; unknown sampling schedules prevent claims about uncollected measurements. District summaries average each sensor's latest accepted environmental reading, not geographic interpolation or population coverage. Annual malaria and recent sensor readings have different time resolution: **Exploratory association — not causal inference.** Missing coverage is gray, never normal conditions.

Simulation is opt-in, deterministic and in memory, with Start/Pause/Reset/Speed. Every generated reading carries `simulation: true` and **SIMULATED SENSOR STREAM — NOT OBSERVED DATA**. The map never invents simulation coordinates. Simulation cannot enter observed imports, study records or persistence storage; exports and printed reports retain warnings. CSV exports escape spreadsheet formula strings. Live adapters accept public secure feed URLs only; anonymous MQTT QoS 0 is intentionally limited and does not provide authenticated cloud-device management.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. There are 157 unit tests, including artifact corruption/totals, five-model saved output joins, missing-data behavior, geometry provenance, prospective locking/outcome handling, IoT validation/security/health/simulation and optional feed failure.

After building, start `npm run preview -- --port 4173`. Run `APP_URL=http://127.0.0.1:4173 node tests/research-desktop-iot.mjs` plus the fourteen existing browser scripts. The new suite covers common Kota Jayapura values across eight modules, all-nine geometry, five models, desktop 1366/1920/2560 layouts, palette/shortcuts/comparison/refresh, empty prospective state, IoT import/alerts/quality/map, simulation isolation/export, and phone/tablet/desktop fit. Existing empty-state tests explicitly select disconnected USER IMPORT mode; no assertions are disabled.

Local preview/direct refresh checks validate static route fallback, not authenticated remote Vercel behavior. Vercel preview may require SSO; a certificate/access failure is reported separately and is never bypassed by disabling TLS verification.
