# MALARIASCOPE

Spatial Early-Warning and Geospatial Risk Intelligence System for Malaria.

**Research Prototype — Retrospective Geospatial Risk Intelligence — Not for Autonomous Clinical Decision-Making or Operational Deployment.**

A React + Vite + TypeScript browser application for loading district surveillance records, validating data, inspecting GIS context, calculating transparent incidence risk, evaluating analytical alert rules, reviewing readiness, and exporting local reports. No backend or secrets are required. This is a research prototype, not an operationally validated production surveillance system.

## Develop and validate

Node 22 or newer is recommended.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Development binds to all interfaces on port 5173; preview defaults to 4173. If the default npm cache is not writable, use `npm ci --cache /workspace/.npm-cache`.

## Architecture

`src/main.tsx` contains the application shell and routed analytical modules. `src/analytics.ts` provides pure validation, identity normalization, incidence, percentage change, correlation, model metrics, risk classification, alert evaluation, and export functions. `src/store.tsx` manages versioned localStorage state. `src/Map.tsx` is a lazy-loaded Leaflet GIS workspace. `src/geometry.ts` validates closed polygon rings and resolves district codes/names. `src/SpatialLab.tsx`, `src/spatial.ts`, `src/moran.ts`, and `src/spatial.worker.ts` provide queen-contiguity neighborhoods and reproducible permutation analysis in a worker. Heavy GIS code is loaded on demand. Recharts renders interactive charts. Application activity and local notes never leave the browser.

Primary routes: dashboard, risk-map, surveillance, district-intelligence, climate, forecasting, model-benchmarking, spatial-analysis, early-warning, risk-intelligence, force-health, scenario, data-center, data-quality, reports, alerts, audit, settings. Secondary routes: methodology, provenance, about, presentation. The app opens at `/dashboard`; Vercel rewrites support direct links.

## Data policy and supplied evidence

`public/data/research-summary.json`, `model-performance.json`, and `spatial-analysis.json` contain only results explicitly supplied in the request. Those results have not been independently verified against underlying records. District-year surveillance, climate, detailed model predictions, healthcare facilities, and district boundaries were **not supplied**. The application uses empty states for them and never synthesizes missing values.

The supplied 2020 and 2025 annual aggregates are plotted as separate points; intervening years are unavailable. The eight-district balanced forecasting panel (48 district-years) is distinct from the nine-district 2025 spatial assessment. Supiori's 2024 outcome is missing and is not imputed. Persistence 2025 MAE (10,426) is lower than Random Forest MAE (12,690). Global Moran's I is 0.165 with permutation p = 0.1301, not significant at 0.05.

Distinctions are maintained between supplied evidence, loaded observations, derived metrics, model predictions, exploratory scenarios, and user imports. Schema validation does not imply scientific verification. Imports always retain USER IMPORT status. Never label a user-selected dataset as independently verified merely because the file parses.

## Import, validation, replacement

Data Center accepts CSV, JSON arrays (or `{ "rows": [...] }`), and polygon GeoJSON up to 20 MB. Download the empty CSV template from the app. Required columns:

```csv
district,year,cases
```

Optional numeric columns: population, rainfall, temperature, humidity, prediction. Optional identifiers: model, district_code. Use one observation per district/year in each dataset. Separate model datasets when comparing predictions for multiple models. Labels for models must match the model selector. Temporal units are years; climate lag exploration therefore uses annual lags.

The import preview checks required fields, numeric values, valid years, positive population, nonnegative counts, humidity range, duplicate normalized district/year keys, and basic polygon coordinates. Errors and duplicate observations block loading. Every committed dataset receives a session UUID, SHA-256 checksum, timestamp, local filename, and classification. Imports create separate datasets rather than overwriting supplied evidence. Activate a dataset using the global source filter. Remove imports in the registry; export before deletion.

For static replacement, put authorized datasets under `public/data/`, inspect them through the import workflow, and preserve source documentation in `data-provenance.json`. Never replace aggregates with fabricated district rows. Core workflows do not require a remote API.

Country outlines in `boundaries.geojson` come from the Natural Earth public-domain dataset distributed by datasets/geo-countries. They are geographic context, **not district administrative boundaries**. The CARTO basemap uses public OpenStreetMap tiles and requires network access; local outlines remain available if tiles fail. Replace district geometry through Data Center with a FeatureCollection of Polygon/MultiPolygon features and a `district` or `name` property. Names are normalized for spacing, punctuation, and capitalization. Geometry district_code/code identifiers are matched to observation district_code first, then normalized names. Regency naming variants are resolved; city and regency identities remain distinct. Ambiguous duplicates require manual resolution.

## Analytics and model limitations

Incidence = cases / population × 1,000. Year-on-year change requires adjacent-year observations with a positive previous denominator. Risk is based on configurable ascending incidence thresholds (defaults 100, 300, 500 per 1,000). These are illustrative configurable research cutoffs, not validated clinical thresholds. Missing population yields INSUFFICIENT DATA. Formula and thresholds remain visible.

Predictions must be imported with an explicit model label. The application computes paired MAE, RMSE, R² and residuals for available outputs. It does not train Random Forest, Ridge, or Gradient Boosting; trained artifacts, hyperparameters and feature matrices were not provided. Model-assisted risk uses labeled predictions divided by population. Spatial risk uses mean observed incidence of matched queen-contiguous neighbors. Composite risk uses explicit user-selected weights over observed, predicted, and neighbor incidence. Missing required inputs yield INSUFFICIENT DATA; these configurable formulas are exploratory and not validated clinical methodologies. Global Moran’s I uses row-standardized queen-contiguity weights, fixed seed 2025, and a two-sided permutation test around expected I. Local quadrant classifications are exploratory and do not assert local statistical significance. Do not interpret empty modules as evidence of low risk.

Climate correlations use matched district/year pairs, with a minimum of three. They are exploratory associations and do not establish causality. Annual records cannot justify monthly seasonality. Scenario cases use baseline × (1 + assumed trend / 100); climate assumptions are recorded but do not change the result without validated coefficients. Scenarios export separately and are never written into observation datasets.

## Alerts, readiness, persistence, reports

Early Warning Center supports adding, editing, duplicating, disabling, and deleting rules with optional AND/OR secondary conditions. Metrics include cases, incidence, annual percentage change, absolute prediction residual, prediction increase over recent history, rainfall anomaly, consecutive increases, missing optional fields, and climate age. Missing inputs never trigger numeric alerts. Alert IDs are stable by dataset, rule, district, and year; local timestamps, status, and notes persist. Rule changes are logged, but there is no external notification service. Alerts are analytical signals, not clinical emergencies.

Readiness checklists cover eight preparedness domains. AVAILABLE / NOT APPLICABLE entries lead to READY; unavailable or limited entries lead to ATTENTION; unreviewed evidence remains INSUFFICIENT DATA. Elevated loaded risk with unconfirmed diagnostics also prompts ATTENTION. No troop locations, routes, identities, movement information, or operational instructions are accepted or generated.

Settings, local interface profiles, alert state, datasets, geometry, readiness entries, snapshots, and activity logs are stored under `malariascope-v1` in localStorage. Profiles customize local interface context and are not authentication. Browser storage is finite; export important records. Reset application data clears only this app's storage key. Snapshots represent application state, not new scientific evidence.

Reports generate a print-friendly view and export JSON or filtered CSV. Browser Print → Save as PDF creates PDFs without a backend. Audit timestamps are displayed in Asia/Bangkok. Ctrl/Cmd+K opens search. Presentation supports left/right arrow navigation and reuses live system components.

## GitHub and Vercel

The GitHub Actions workflow runs `npm ci`, typecheck, lint, analytics tests, and build on pushes and pull requests. Commit the lockfile. To deploy, import the repository in Vercel using the Vite preset, build command `npm run build`, and output directory `dist`. `vercel.json` rewrites application routes while preserving data/assets. No environment variables are required. Publishing to GitHub or Vercel is a separate action; this repository has not been remotely published by the build workflow.

## Privacy, accessibility, and review

Use only public, authorized, aggregated, de-identified research records. Never import personal medical records, classified facilities or coordinates, unit identities, deployment schedules, or other sensitive operational data. Local browser storage is not an encrypted secure datastore and is unsuitable for sensitive records. No secrets are included. React escapes text rendering, and filenames are sanitized. CSV exports protect leading spreadsheet formula characters.

The app includes keyboard focus states, semantic controls, a skip link, text chart summaries, reduced-motion styling, mobile navigation, responsive map controls, and print styles. Dialogs close with buttons; global search supports Escape. Keyboard traps and Escape handling are implemented for dialogs. Full accessibility certification, independent epidemiological validation, multi-user authorization, external alert delivery, secure storage, and operational deployment certification are outside this prototype's scope.

## License

Application source licensing is pending owner review. See LICENSE. Natural Earth geographic data are public domain; map tile attribution is retained. Study data licensing was not supplied.

## Browser acceptance checks

With the development or preview server running, execute `node tests/browser.mjs`. This environment uses `/usr/bin/chromium`; browser fixtures are isolated to test browser storage and never included in production datasets. The suite exercises all 22 routes, annual filter updates, required-field and duplicate validation, dataset import, rule triggering, acknowledgement persistence, checklist persistence, GeoJSON layers, spatial worker analysis, risk explanations, snapshots, report downloads, scenario isolation, and mobile overflow. `npm test` runs the deterministic analytical test suite including permutation reproducibility and spreadsheet-safe CSV export. Vercel rewriting is configured but remote deployment has not been performed or independently validated.

## District Intelligence 360°

The district route now provides Overview, Malaria, Climate, Forecast, Spatial, Risk, Readiness, Data Quality, and Provenance tabs. District and year selections share the application store and URL with GIS; opening a district on the map updates this workspace, and Locate district in GIS highlights and zooms to the selected administrative feature. Bookmark names and district/year preparedness checklist reviews persist locally.

The 360° evidence join reads every loaded district dataset. District codes take precedence over normalized names; conflicting identities require manual confirmation. Matching district-year records are combined without double counting cases. The explicitly selected global source takes precedence for fields it supplies. Compatible missing values are filled from other sources; conflicting alternative-source values are withheld and listed for review. Predictions are joined only for the selected model. Registry classifications remain intact: local file imports are USER IMPORT, and the Verified datasets only selector excludes every dataset without explicit VERIFIED registry metadata. The application does not independently verify scientific sources.

The supplied Mamberamo Raya incidence figure is also available as a source-labeled, unverified study ratio. Underlying cases and population remain unavailable. When cases and population are connected, incidence is calculated from them; otherwise an explicitly supplied per-1,000 incidence input may be used, with its provenance visible. Supplied ratios are excluded from verified-only mode. Conflicting study and connected figures are retained for review rather than silently substituted.

Every explanation is deterministic. HIGH/VERY HIGH requires the configured incidence cutoff; supporting signals include incidence midrank percentile ≥90 with at least three comparable districts, strict increases over at least two adjacent years, and high mean neighbor incidence under the same explicit thresholds. Supporting signals do not secretly change the incidence risk category. Spatial quadrants compare current and neighboring burden with the loaded cohort mean; they are exploratory labels, not significant local hotspots. Neighborhood incidence is withheld if an adjacent district lacks an incidence input.

Year-over-year percentages require a positive prior-year denominator. Three-year rolling means require three contiguous observed years. Rainfall and temperature anomalies use the mean and sample standard deviation of at least three earlier available annual observations and exclude future records. Zero baseline variance produces an unavailable anomaly. Historical totals include only known observed periods through the selected year. Latest loaded surveillance/climate years are labeled separately and do not enter an earlier-year calculation.

Comparisons include the loaded Papua-workspace median, highest-incidence district, previous year, and a selectable contiguous neighbor; the Malaria tab also preserves comparison of up to five selected districts. Medians exclude missing values per metric and do not represent verified coverage of all Papua districts. Incidence rank uses competition ranking; percentile = 100 × (number below + half of tied values) / comparable districts. Completeness reports available cases, population, rainfall, temperature, humidity, and selected-model prediction divided by six, plus observed temporal completeness over the loaded analytical span. Neither completeness measure is a verification score.

Generate District Intelligence Report captures all summary metrics, rule explanations, spatial context, comparisons, alerts, readiness review, data-quality issues, historical records, and field-level provenance. The captured report supports JSON download and print/save as PDF without a backend. It is separate from scientific datasets and clears when its district/year/model/source context changes.

Run `node tests/district-360.mjs` against a running development server. Set APP_URL to the preview server origin to check the production bundle. Its isolated test fixtures exercise all nine tabs, cross-source joins, verified-only filtering, anomaly math, comparisons, bookmarks, district/year checklist isolation, report JSON/printing, GIS/year synchronization, keyboard tabs, and mobile overflow. These fixtures are never included in production data.

## Advanced Early-Warning Engine

The Early Warning Center provides a visual IF / AND-or-OR / THEN builder with saved rule revisions, activation, priority, category, description, persistence, and episode suppression. Six editable templates cover High Burden, Rapid Increase, Climate Anomaly, Model Deviation, Data Gap, and Persistent High Risk. New custom rules start inactive; save a rule to apply edits. Rules evaluate all loaded years in the active surveillance dataset, independently of display-year filters, while forecast metrics respect the shared selected model.

Supported conditions include cases, incidence, year-over-year change, three-year rolling average, predicted cases, prediction deviation from historical burden, rainfall/temperature anomalies, incidence-based risk level, signed residual, absolute prediction error, completeness, dataset age, consecutive increases, missing fields, and climate age. Operators are `>`, `>=`, `<`, `<=`, `=`, inclusive `between`, exclusive `outside range`, and `increased by` / `decreased by` (percentage change of the selected metric versus the adjacent year, with a positive baseline).

Persistence requires the full compound expression to match for one, two, or three adjacent observed annual periods. Missing years or an unmatched/unknown expression break the streak. With suppression enabled, only the first qualifying period in each uninterrupted episode emits a signal; a clear condition or missing period rearms it. Without suppression, each qualifying district-year emits one signal. Replay preserves alert identity and first-recorded timestamp rather than duplicating events. Legacy rules retain their previous per-period behavior until suppression is enabled.

Rolling means require three contiguous observed years. Climate anomalies use at least three earlier valid observations and sample standard deviation, excluding future data. Prediction deviation uses the mean of up to three earlier observed periods; missing forecasts or nonpositive baselines are unavailable. Risk levels encode LOW/MODERATE/HIGH/VERY HIGH as 0/1/2/3 with global incidence thresholds. Signed residual is prediction minus observed cases. Completeness is availability of cases, population, rainfall, temperature, humidity, and selected-model prediction divided by six.

Dataset age is elapsed days since registry ingestion at evaluation, **not** age of surveillance observations or source publication. It is evaluated on load or rule/source/model changes, only for the latest district-year: historical ingestion timestamps are unavailable, so dataset-age persistence and year-over-year age changes cannot be confirmed. This browser application does not run a background surveillance scheduler.

The Alert Center retains immutable local snapshots with exact rule configuration, all persistence-period condition values, underlying historical observations, source identifier/name/classification/checksum, model, risk thresholds, severity, priority, category, deterministic explanation, and first-recorded timestamp. Editing, disabling, or deleting a rule preserves previous alerts, which are labeled historical when the current configuration no longer produces them. Statuses, notes, rules, and alert history persist in this browser; export alerts as JSON for a portable copy. No autonomous clinical or military recommendations are generated.

Validation includes the analytical suite (`npm test`) and browser workflows:

```sh
node tests/warning-engine.mjs
node tests/district-360.mjs
node tests/browser.mjs
```

Start the app first; set `APP_URL` for a production preview and `CHROMIUM_PATH` when Chromium is elsewhere. Browser fixtures are isolated automated test data and are never installed as production evidence.

## Geospatial Hotspot Intelligence

The Papua GIS (`/risk-map`) offers six analytical modes: Observed Burden, Incidence, Predicted Risk, Spatial Cluster, Residual Error, and Data Completeness. Additional layers show predicted burden, derived observed incidence risk, population, rainfall, temperature, humidity, climate anomalies, and signed model residuals. Forecast fields must match the shared model selection. Completeness uses the six analytical input fields defined by the early-warning engine. Country outlines remain geographic context; district shading, statistics, and neighborhood analysis require actual administrative Polygon/MultiPolygon GeoJSON.

The year slider steps through observed years in the active source and updates the global selector. Playback advances every 1.5 seconds, stops at the last year, and is disabled for reduced-motion preferences. Colors transition over 180 ms; observations are not interpolated. Year A follows the global selection; Year B is independently configurable. Comparison maps share a linked viewport, source/model, and pooled class breaks so the same color means the same numeric interval in both panes. Maps stack on smaller screens. Risk cutoffs remain fixed, and missing values remain gray. Region/risk display filters apply to the observation table, while map cohorts use all active-source districts.

Viewport statistics use actual polygon intersection and exclude unmatched or ambiguous observations. They report visible polygons, matched districts, known values, highest/lowest values, median, mean, and HIGH/VERY HIGH counts from **observed incidence**. Means and medians are omitted for categorical layers. District codes take precedence; mismatched codes cannot fall back to contradictory names, and multiple polygons cannot duplicate a single district observation.

Selecting a district highlights it and its queen-contiguous neighbors (shared edge or vertex). The Spatial Context panel reports neighboring districts, cases and incidence relative to the arithmetic neighbor mean, incidence-based neighborhood risk, and exploratory burden quadrants. Neighbor means and quadrants require every adjacent input; missing neighbors remain listed without imputation. Moran calculations run in a worker with reproducible seed 2025 and configurable permutations. They use the matched induced graph, row-standardized weights, and the existing two-sided global permutation test. Local I and quadrants have no local significance tests. Results are invalidated when source/year/weights change; supplied study statistics are never substituted for loaded-data results.

Map exports include a vector SVG of the current viewport, separate Year A/B images during comparison, and JSON containing map values, statistics, comparisons, spatial context, derived Moran outputs, a viewport GeoJSON feature collection, and provenance. SVGs contain legends, missing-data/neighbor/facility context, source metadata, and attribution; basemap tiles are omitted. Fullscreen uses the browser API and retains the interactive workspace.

Public healthcare points are optional, fetched explicitly from OpenStreetMap via the public Overpass API. Only public hospital/clinic/doctors records in the documented Papua-region bounding extent are retained. Private, restricted, military-tagged, or military-described records are excluded, and raw OSM tags are not propagated into displayed/exported records. No tactical layers, routes, troop positions, or deployment information are ingested. Coverage is volunteered and incomplete; a current OSM snapshot is not historical facility coverage, service availability, or readiness evidence. Source timestamp, retrieval time, extent, ODbL license, cap, and errors are visible. Service failures leave an explicit unavailable state or the previously labeled snapshot; no positions are fabricated.

The map adds no dependencies or environment secrets. Run `node tests/hotspot.mjs` against the running development server (or set `APP_URL` for a production preview) to verify comparison, time controls, spatial context, viewport statistics, exports, fullscreen, accessibility preferences, responsive layout, and public-response filtering. Facility responses in browser tests are isolated fixtures, not production data. The analytical suite (`npm test`) also tests spatial adjacency, sparse evidence, precise viewport intersections, and ambiguous joins.
