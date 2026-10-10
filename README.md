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

`src/main.tsx` mounts the shared provider and lazy interface shells; `src/DesktopApp.tsx` contains the main workspace routes. `src/analytics.ts` provides pure validation, identity normalization, incidence, percentage change, correlation, model metrics, risk classification, alert evaluation, and export functions. `src/store.tsx` manages versioned localStorage state. `src/Map.tsx` is a lazy-loaded Leaflet GIS workspace. `src/geometry.ts` validates closed polygon rings and resolves district codes/names. `src/SpatialLab.tsx`, `src/spatial.ts`, `src/moran.ts`, and `src/spatial.worker.ts` provide queen-contiguity neighborhoods and reproducible permutation analysis in a worker. Heavy GIS code is loaded on demand. Recharts renders interactive charts. Application activity and local notes never leave the browser.

Primary routes: dashboard, risk-map, surveillance, district-intelligence, climate, forecasting, model-benchmarking, spatial-analysis, early-warning, risk-intelligence, force-health, scenario, data-center, data-quality, reports, alerts, audit, settings. Secondary routes: methodology, provenance, about, presentation. The app opens at `/dashboard`; Vercel rewrites support direct links.

## Data policy and supplied evidence

The default checksummed study package is now populated at `public/data/verified/`: 48 balanced district-year observations, a separate nine-district 2025 snapshot, 48 annual climate records, eight districts with five saved hindcasts, supplied benchmarks/uncertainty, a source-quality ledger and nine legitimate public ADM2 geometries. Extraction status does not establish independent verification against underlying reports. Public healthcare resources and actual IoT measurements remain unconnected. [Implementation, provenance, schemas and limitations](docs/RESEARCH-DESKTOP-IOT.md).

The supplied row-level balanced panel now supports every annual point from 2020 through 2025. The eight-district balanced forecasting panel (48 district-years) is distinct from the nine-district 2025 spatial assessment. Supiori's 2024 outcome is missing and is not imputed. Persistence 2025 MAE (10,425.5) is lower than the supplied Random Forest MAE (12,690.256937171625); rounded point-output recalculations remain separate. Global Moran's I is 0.165 with permutation p = 0.1301, not significant at 0.05.

Distinctions are maintained between supplied evidence, loaded observations, derived metrics, model predictions, exploratory scenarios, and user imports. Schema validation does not imply scientific verification. Imports always retain USER IMPORT status. Never label a user-selected dataset as independently verified merely because the file parses.

## Import, validation, replacement

Data Center accepts CSV, JSON arrays (or `{ "rows": [...] }`), and polygon GeoJSON up to 20 MB. Download the empty CSV template from the app. Required columns:

```csv
district,year,cases
```

Optional numeric columns: population, rainfall, temperature, humidity, prediction. Optional identifiers: model, district_code. Use one observation per district/year in each dataset. Separate model datasets when comparing predictions for multiple models. Labels for models must match the model selector. Temporal units are years; climate lag exploration therefore uses annual lags.

The import preview checks required fields, numeric values, valid years, positive population, nonnegative counts, humidity range, duplicate normalized district/year keys, and basic polygon coordinates. Errors and duplicate observations block loading. Every committed dataset receives a session UUID, SHA-256 checksum, timestamp, local filename, and classification. Imports create separate datasets rather than overwriting supplied evidence. Activate a dataset using the global source filter. Remove imports in the registry; export before deletion.

For static replacement, put authorized datasets under `public/data/`, inspect them through the import workflow, and preserve source documentation in `data-provenance.json`. Never replace aggregates with fabricated district rows. Core workflows do not require a remote API.

Country outlines in `boundaries.geojson` come from the Natural Earth public-domain dataset distributed by datasets/geo-countries. They are geographic context, **not district administrative boundaries**. Local analytical vectors render on a neutral canvas without an external basemap. OpenStreetMap tiles are optional online context; failure never removes vectors. Replace district geometry through Data Center with a FeatureCollection of Polygon/MultiPolygon features and a `district` or `name` property. Names are normalized for spacing, punctuation, and capitalization. Geometry district_code/code identifiers are matched to observation district_code first, then normalized names. Regency naming variants are resolved; city and regency identities remain distinct. Ambiguous duplicates require manual resolution.

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

## Forecasting Workbench Pro

The forecasting route and Model Laboratory compare Persistence, Ridge Regression, Random Forest, and Gradient Boosting through Model Comparison, District Forecast Inspection, and Error Analysis. Select MAE, RMSE, R², median absolute error, or absolute prediction bias to recalculate the leaderboard. Lower error metrics rank first; higher R² ranks first. Ties share a rank and unavailable values remain unranked. Scientific interpretation and model failure summaries use deterministic calculations, with no generative explanation or preferred model.

Loaded comparisons aggregate the selected model outputs across imported datasets, retaining the observed and predicted source references for every district-year pair. Import separate datasets for each model; the CSV validator continues to reject duplicate district-year rows within one dataset. Active-source precedence resolves observed fields, while conflicting prediction sources or disagreement between prediction-source cases and the chosen observed cases withhold the pair. The default common cohort intersects district-years across participating models; missing models stay unranked. Available-per-model comparisons expose different cohorts and suppress superiority claims when their cohorts differ. Comparison covers all district-years in the evaluation period, independently of the global district display selection. End year and model synchronize with the shared controls; optional multi-year evaluation pools paired observations rather than averaging annual metrics.

MAE is mean absolute residual, RMSE is square root of mean squared residual, median absolute error is the median of absolute residuals, and bias is mean signed residual (prediction minus observed). R² is unavailable for constant observed outcomes. Interactive scatter and residual points support mouse and keyboard inspection, with equivalent paired tables and exact source provenance. Error rankings order districts by descending mean absolute error; failure analysis identifies measured district errors, signed bias, and error concentration without claiming causal explanations or future performance. District inspection shows loaded history and leaves missing predictions as gaps.

Supplied study aggregates are explicitly separate from loaded evaluation. The supplied 2025 MAE values favor Persistence over Random Forest, while missing metrics never imply a winner. Aggregate results cannot reconstruct district errors, residual distributions, bias, sample sizes, or forecasts. Registry labels do not establish independent verification, untouched test sets, training leakage checks, confidence intervals, or successful retraining. This workbench inspects supplied outputs and does not train models or invent predictions. JSON export includes the selected metric/period, evaluated pairs, metrics, failure findings, source references, and data-quality issues.

Run `node tests/forecast-workbench.mjs` against the running app, or set `APP_URL` to a production preview. The browser test checks dynamic rankings, point inspection, keyboard access, modes, global-year synchronization, source scope, export, aggregate isolation, and mobile overflow. Fixtures remain isolated from production data. `npm test` validates mathematical definitions, missing cohorts, ties, source conflicts, study results, and deterministic failure summaries.

## Explainable Risk Engine 2.0

`/risk-intelligence` supports Observed Risk, Spatial Risk, Model-Assisted Risk, and Composite Research Risk. Every available district identity has a selected-year calculation or an explicit INSUFFICIENT DATA result. Year, district, active source, and model follow the shared controls. The default scope aggregates all loaded datasets; active-source-only scope is available. Ambiguous identities are reported and withheld; unresolved conflicting fields remain unavailable. Source registry classifications are displayed without claiming independent verification.

The immutable, versioned Default Research Model preserves the previous baseline: incidence thresholds 100 / 300 / 500 per 1,000 and composite weights observed 1, predicted 1, neighbor 0. LOW is below 100, MODERATE starts at 100, HIGH at 300, and VERY HIGH at 500. This versioned formula has no independent research-verification record in the repository, and the interface labels that limitation explicitly. These are research classifications, not clinical recommendations. Legacy global thresholds still belong to their existing modules; risk-workspace scenarios never modify them.

Observed Risk uses cases / population × 1,000, or source-supplied incidence when both underlying count and denominator are not available. Model-Assisted Risk uses the selected model's prediction / population × 1,000. Spatial Risk uses the arithmetic mean incidence of every queen-contiguous adjacent district, requiring actual administrative polygons, unique one-to-one source matches, and valid inputs for every neighbor. A missing neighbor or isolated/unmatched district produces insufficient data; this is not a significance-tested cluster. Composite Research Risk uses a weighted arithmetic mean of the three incidence components. There is no min-max scaling, z-score transformation, clipping, imputation, or silent reweighting of missing positive-weight components.

Each district’s “How was this risk calculated?” action opens the Risk Formula Inspector. It includes raw input values and transformations, component values in common units, raw and sum-normalized weights, additive contributions, final score, classification interval, source dataset/year/checksum, distinct formula/input/geometry verification labels, and an exact JSON audit record. Contribution bars show additive score contributions and their shares when a complete nonzero score exists. Keyboard focus is trapped and restored, Escape closes the inspector, and tables scroll within the responsive dialog.

The Experimental Scenario Model is stored separately in browser-local `riskScenario` state. Researcher and Analyst profiles may activate and adjust finite weights between 0 and 100 with a positive total. Viewer and Demo profiles cannot activate or edit weights, but may inspect or reset. This is a **local interface profile gate, not authenticated server authorization**; production role enforcement requires a trusted identity service and server-side permissions. An active scenario always displays “EXPERIMENTAL RISK CONFIGURATION — NOT VERIFIED RESEARCH OUTPUT.” Weights affect only Composite Research Risk, leaving the other modes' single-variable definitions intact. Reset restores baseline weights and deactivates the scenario with one click; the shared settings reset also clears the local risk scenario. Source datasets, shared thresholds, GIS classifications, alert rules, and observed records are never modified by risk scenarios.

JSON export includes the active configuration, a separate immutable default snapshot, scenario metadata, full calculations and source references, spatial input/geometry provenance when used, and identity issues. `npm test` validates formulas, category boundaries, source conflicts, missing inputs, scenario isolation, local profile gates, and spatial joins. Run `node tests/risk-engine.mjs` against a running app (or use `APP_URL` for a production preview) for all four modes, exact contributions, provenance, persistent scenarios, reset, profile restrictions, exports, global selections, keyboard focus, and mobile layout. All browser/analytical fixtures are isolated test evidence and are not production data.

## Scientific Integrity Center

`/data-quality` automatically inspects every loaded dataset and exposes Dataset Health, GIS Match Rate, Temporal Completeness, District Coverage, Field Completeness, Validation Status, an issue register, analysis eligibility, and a score inspector. Selecting a dataset or filtering issues changes the display, never the inspected rows or score denominator. The inspector is read-only: it does not fix, delete, impute, or promote source verification. JSON export includes all dataset reports, policy constants, original/loaded row counts, detailed issues and corrective actions, score numerators/denominators/weights/contributions, eligibility reasons, source checksums, and GIS metadata.

Checks include required and optional missing fields, exact duplicates and normalized district-year duplicates, impossible negative values (negative temperature is allowed), finite numeric types, positive population, humidity bounds, supplied incidence consistency, supported years 1900–2100, future observation warnings, documented code/name matching, coordinate ranges/pairs/conflicts, missing or invalid administrative geometry, unmatched/ambiguous district identities, annual panel gaps, abrupt adjacent count changes, registry staleness, surveillance lag, and schema mismatches. Issues have INFO, WARNING, ERROR, or BLOCKING severity, a source observation row (1-based, excluding CSV headers) or dataset-level scope, field, explanation, and corrective action. Distinct model/source datasets are inspected separately; cross-dataset replication is not automatically treated as a within-dataset duplicate.

New Data Center imports preserve `sourceRows` alongside normalized observations, including columns previously ignored by the observation schema. Scientific inspection uses all original rows, accepts documented CSV numeric normalization, and exposes disagreements with loaded fields or row counts. Older datasets fall back to loaded rows with an explicit original-source-unavailable label. Rejected imports remain blocked by the existing importer; this center does not bypass validation. Preserving source rows increases local storage use; existing storage-full handling retains the current in-memory session and advises exporting/removing datasets.

The quality score uses fixed weights totaling 100: field completeness 30, record validity 20, observation uniqueness 10, temporal completeness 20, GIS match rate 10, and reference district coverage 10. Each contribution is weight × numerator / denominator. Unknown components contribute zero, with no redistribution; empty datasets have no score. Field completeness uses every source row × the fixed nine fields `district, year, cases, population, rainfall, temperature, humidity, prediction, model`. Missing optional analytical fields remain in this broad-research denominator. Present-but-invalid fields receive presence credit only; their rows lose validity credit. Validity counts rows without ERROR/BLOCKING row issues, and dataset-level BLOCKING issues invalidate all rows. Uniqueness subtracts excess duplicate district-year rows without deleting them from inspection. Temporal coverage counts occupied distinct district-years across all loaded district identities and the inclusive loaded earliest–latest annual range; it does not establish completeness outside that range. GIS rate counts unique matches / dataset district identities; district coverage counts matched features / all loaded reference features, not all Papua districts. Staleness and abrupt-change warnings remain separately visible and do not directly deduct numeric score points. A score of 100 is not independent scientific verification.

Inspection policy v1 uses incidence tolerance 0.1 per 1,000, abrupt adjacent changes of at least 100% in either direction (zero-baseline increases are flagged with undefined percentage), ingestion age greater than 365 days, and latest surveillance lag greater than two selected analysis years. Registry ingestion age is explicitly distinct from observation or source publication age. Abrupt changes are review signals rather than evidence that a count should be deleted.

Analysis eligibility is conservative and specific to the application: Forecasting requires valid observed/selected-model predicted pairs for every selected-year row and means **output inspection**, not model training or untouched-test certification. Spatial Analysis requires valid administrative geometry, uniquely matched selected-year cases, at least three districts, nonconstant burden, and at least one queen-contiguous pair. Trend Analysis requires at least two annual periods, complete loaded-panel district-years, and valid cases. Risk Calculation covers observed cases/positive-population incidence in the selected year and requires resolving inconsistent supplied incidence; other risk modes need their own inputs. Structural/duplicate/identity BLOCKING issues prevent every analysis. Optional errors can remain even when another analysis's required inputs pass, so eligibility is not scientific approval or operational deployment permission.

Run `node tests/scientific-integrity.mjs` against the app, or set `APP_URL` to a production preview. It verifies all-dataset inspection, issue details, exact score denominators, filter invariance, eligibility reasons, global model/year settings, original-row preservation during a real CSV import, exports, missing GIS, keyboard tabs, and mobile overflow. The analytical suite (`npm test`) covers malformed records, duplicate aliases, invalid values and coordinates, incidence tolerance, spatial matching ambiguity, temporal gaps, abrupt changes, source snapshot discrepancies, score reproducibility, and eligibility boundaries. All fixtures are isolated test evidence.

## Force Health Readiness Matrix

`/force-health` provides District × Readiness Domain assessment for surveillance awareness, diagnostics, prevention resources, staffing preparedness, referral readiness, evacuation preparedness, communication preparedness, and data readiness. Each READY / REVIEW / ATTENTION / INSUFFICIENT DATA cell has a deterministic rule, triggering values, reason, evidence status, missing-information list, and suggested human review category. Selecting a cell changes the evidence/checklist panels; the matrix continues to show all loaded and manually documented districts. Search only filters the display. Assessment year synchronizes with the global selector.

The Readiness Evidence Panel separates Known (present source records, not necessarily verified), Unknown (unavailable values/reviews), Not Connected (no independent readiness evidence feed), Derived (explicit observed-data arithmetic), and User-entered (local checklist statements/notes). There are no connected resource-capacity feeds in this browser application. Public facility locations do not prove diagnostics, staffing, referral, evacuation, communication, or resource availability. Source classifications and checksums remain visible without promoting local entries or model outputs to verified facts.

Rules run in explicit priority order: a local LIMITED/UNAVAILABLE applicable item gives ATTENTION; diagnostics also give ATTENTION when observed cases exceed 20,000 or observed incidence reaches the configured HIGH cutoff while diagnostic items remain unreviewed. A rise is reported only from adjacent annual observed incidence values; percentage change needs a positive prior denominator. Predicted malaria burden is excluded from these resource-attention rules. Missing required surveillance/case/population/provenance inputs give INSUFFICIENT DATA in surveillance/data domains; unresolved contributing source conflicts or ERROR/BLOCKING Scientific Integrity findings keep those domains in REVIEW. Every applicable item explicitly AVAILABLE gives READY, while all NOT APPLICABLE gives INSUFFICIENT DATA. Partial documentation gives REVIEW; absent resource documentation gives INSUFFICIENT DATA. READY means locally documented checklist completion rather than independently verified capacity. The matrix provides analytical evidence review only and generates no autonomous clinical or operational instructions.

Checklists persist by normalized district name and year in `districtChecklists`; metadata in `readinessMetadata` retains the recorded status, local note/reference, and UTC update timestamp (displayed in ICT). Timestamp/notes are not attached to a different status when legacy metadata no longer matches. Entries synchronize with the District Intelligence 360° Readiness tab and reports, which use the same engine and respect the district page's source/verification scope. Old regional `checklist` entries remain separate and are never automatically copied to districts. Manually added districts in `readinessDistricts` establish a user-entered identity only, leaving unavailable surveillance/GIS evidence unknown. Status and note changes save locally without changing observed datasets, risk thresholds, alert rules, or model outputs.

Export includes the full matrix, rule explanations, categorized evidence, source references/quality issues, domain checklists, notes/timestamps, manual district identities, and the separately labeled legacy regional checklist. Local storage is the persistence boundary; export is the portable copy. No external messages are sent or background operational workflow is run.

`npm test` covers the eight domains, rule ordering, local gap/partial/completed states, all-not-applicable boundaries, exact burden/incidence evidence, high-prediction exclusion, missing/non-adjacent periods, district-year isolation, source-quality conflicts, note timestamps, and deterministic assessment. Run `node tests/readiness-matrix.mjs` against the running app (or set `APP_URL` for a production preview) for persistence, notes, five evidence categories, shared District 360 edits, legacy checklist separation, manual districts, export, unchanged source data, keyboard matrix cells, and mobile overflow. Fixtures are isolated test evidence and do not seed production observations.

### What-If Analytical Simulator

The Scenario Explorer now compares a source baseline with a distinctly styled exploratory projection. The global year and scenario district determine the baseline. Source status remains explicit: the **VERIFIED BASELINE** comparison slot does not certify imported or unverified records. Historical annual change requires the preceding year; climate anomalies require at least three prior annual observations and nonzero sample variation.

Adjust burden, annual percentage change, population, climate anomalies, model, and three strictly increasing experimental incidence cutoffs. One-period projected cases are `burden × (1 + change / 100)`; the analytical risk score is projected incidence per 1,000. Persistence separately returns the adjusted baseline burden. Ridge, Random Forest, and Gradient Boosting counterfactual outputs remain unavailable without trained inference artifacts. Climate inputs are saved assumptions; no unsupported climate coefficients are invented.

Save, duplicate, compare, delete, reset, and JSON export operate on a separate local `analyticalScenarios` collection. Saved records include immutable baseline snapshots, input assumptions, source checksums and verification status. Working assumptions reset when district, year, or source context changes; existing saved scenarios remain unchanged. Every scenario result panel and table is labeled **Scenario Output — Not Observed Data**. Observation datasets and default research thresholds are never updated by this workflow.

Sensitivity ranks the absolute score effects of restoring each adjusted input to its captured baseline while holding others fixed. Effects overlap and are not additive or causal. Unsupported climate effects remain unavailable, rather than being represented as evidence of no biological effect. Scenarios from different districts or periods retain their own comparison context.

Validation: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `APP_URL=http://127.0.0.1:4173 node tests/scenario-simulator.mjs` (with a production preview running). Scenario data persist only in this browser; exporting JSON provides a portable copy, not a write to research datasets.

### Professional Research Report Builder

Reports provides nine presets: Executive Intelligence Summary, District Intelligence, Malaria Surveillance, Geospatial Risk, Climate Intelligence, Forecasting Performance, Spatial Analysis, Data Quality, and Force Health Readiness. Fourteen section checkboxes select the evidence to include. Provenance and limitations are mandatory, together with the research-prototype disclaimer, analysis date, captured filters, source checksums, and analytical configuration.

Customize the title, annual reporting period, district, model, risk filter, and region filter, then generate a report snapshot. District/model use the global selections; a global-year change resets the draft period. Report risk and region filters are explicit local report controls. Editing the draft or changing source context leaves the previous generated snapshot intact and marks it as outdated; regenerate to incorporate changes. Print, browser “Save as PDF”, CSV, and JSON always use that generated snapshot.

Reports render readable tables, an annual case chart with missing periods visibly unavailable, and a static printable administrative SVG map when valid district geometry exists. Country outlines are never passed off as district boundaries. Loaded spatial reports use queen adjacency, row-standardized weights and a seeded 999-permutation global Moran calculation on the matched end-year cohort. They do not assert causation or local hotspot significance. The spatial analysis is included in that report type’s Overview section. Source aggregates are labeled as separate supplied, unverified study evidence and never reassigned to selected districts or loaded cohorts.

Climate anomalies use at least three earlier annual observations and sample standard deviation. Forecast inspection withholds inconsistent observation/prediction pairs; model performance uses common loaded validation pairs, ranks MAE dynamically, and reports unavailable metrics explicitly. No new model inference or climate coefficients are invented. Observed risk uses the captured incidence cutoffs; experimental weights and scenario outputs are excluded. Readiness retains eight review domains and separate Known, Unknown, Not Connected, Derived and User-entered evidence. Data Quality audits the entire registry and original source rows, so district/period filters cannot improve quality scores by hiding missing or invalid records.

CSV is a long-format export (`section, table, record, district, year, field, value`) of the selected report tables, automatic provenance, integrity metadata, and known limitations. Missing values stay empty; potentially executable spreadsheet strings are escaped. JSON includes the generated metadata, selected analytical evidence, source versions, map/temporal snapshots, and limitations. Generation/export does not modify source datasets, research settings, or saved scenarios; the generated report is held in memory until navigation or reload, so export a copy to retain it.

Validation: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `APP_URL=http://127.0.0.1:4173 node tests/research-reports.mjs` against a production preview. The browser suite verifies all presets, section controls, immutable snapshots, filters, map and analytical sections, CSV/JSON, print controls, actual PDF content, and mobile layout. Its PDF-content check uses Chromium and `pdftotext`; these are test prerequisites, not application dependencies.

### Command Center UX and synchronized context

Every view now shares a YEAR / DISTRICT / RISK MODE / MODEL / DATASET context bar. Year, district, model, risk mode and the primary dataset persist locally and in the URL. Selecting a dataset establishes the primary source; modules that join compatible registry evidence or evaluate complete validation cohorts continue to label those scopes explicitly. Risk mode synchronizes the Risk Engine and the universal calculation inspector. Observed burden, retrospective readiness, model-validation cohorts and exploratory formulas retain their stated scientific basis; reports capture the global risk mode while explicitly retaining observed-incidence research sections and excluding scenario weights.

Use **Ctrl/Cmd + K** for commands, modules, districts and datasets. The palette supports arrow selection, Enter, Escape, a focus trap and focus restoration. Commands include district inspection, GIS, alerts, dataset search, model comparison, report building, settings and presentation. Outside inputs, selects, editable content and open dialogs, press **G**, then **D / M / A / F / R** for Dashboard / Map / Alerts / Forecasting / Reports. Contextual breadcrumbs retain the view, district and year. The existing mobile bottom navigation provides Dashboard, Map, Alerts, District and More.

The universal side inspector shows provenance, selected-district values, deterministic calculation details/risk explanations, model metadata and whole-registry quality checks without navigating away. It also contains Recent Activity and Analytical Snapshots. Lifecycle notifications use actual local audit events for imports, completed validation, newly generated analytical alerts, saved snapshots, generated reports and settings changes; no synthetic surveillance alerts are added for presentation purposes. Activity remains bounded local history and user-facing times use Asia/Bangkok (ICT).

Snapshot management is shared by Settings and the inspector: save, restore, rename, duplicate and delete. Snapshots capture the current view, year, district, primary dataset/checksum, selected model/risk mode, primary map layer, filters, threshold configuration, experimental-risk settings and timestamp. They are view configurations, not historical source backups, tile/facility caches or new scientific evidence. A missing dataset blocks restoration; changed checksums and legacy defaults are reported explicitly. Restoring a snapshot navigates to its saved view while URL synchronization retains that destination.

Loading skeletons replace module-loading empty states, respect reduced motion, and avoid suggesting that observations are absent while code is loading. Application source-load errors are announced accessibly and can be retried. Context controls, modals and notifications adapt to desktop, tablet and mobile; print layouts exclude workspace chrome. Forecast plots continue to resize through their responsive containers and GIS retains its responsive renderer and reduced-motion playback behavior.

Production audit: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and the browser suites against the production preview. `tests/command-center.mjs` covers shared context/deep links, risk-mode synchronization, palette and shortcut safety, inspector/activity/notifications, the full snapshot lifecycle, missing observations, tablet/mobile layout, reduced-motion skeletons, and application-error retry. Browser fixture data remain separate from production evidence.

### Dedicated mobile research workspace

Open `/mobile` directly on a phone or desktop. This is a separate mobile shell with Home / Map / Alerts / District / More navigation, compact surveillance cards, district evidence, metric-ranked model comparison, eight-domain readiness review, provenance/quality inspection and selectable report sections. Filters use the existing shared year/district/model/risk-mode/dataset context; bookmarks, alert review/acknowledgement and district-year checklists use the same local state as desktop. Reports export JSON/CSV, browser printing/PDF and Web Share when supported. Historical burden is explicitly dated when the selected year has no observation. Missing inputs show **Data not available**; supplied study aggregates and model scores retain their unverified classification.

The touch map lazy-loads Leaflet and analytical geometry. It supports pinch zoom, polygon tap → district evidence sheet, locate/reset, year/metric/layer selection, neighbor highlighting and a viewport fullscreen presentation. Research Risk on the map is explicitly observed-incidence classification; the district inspector uses the globally selected risk mode and its exact formula. Without a validated administrative import, public country outlines remain geographic context with no invented district joins. Climate anomalies use historical observations, not just the current-year subset. Readiness is analytical review, never an operational directive.

On HTTPS (or localhost), a service worker scoped to `/mobile` caches the mobile shell, existing public research files and application assets already visited. **DATA CACHED** appears after the public files and visited assets are confirmed in cache. **OFFLINE** and cache timestamps/freshness warnings distinguish cached evidence from live connectivity. Reloads and previously visited modules can work offline; unvisited modules, external basemap tiles and optional browser features may still require connectivity. Uploads/checklists/acknowledgements remain local browser storage and are never sent to the service-worker public-data cache. Browser eviction or disabled/full storage can limit persistence; storage warnings are surfaced in mobile.

Mobile entry points, map and heavier analytical modules are split from desktop. The default observed-risk mobile home does not request the desktop application, Recharts, Leaflet or spatial bundles. Optional desktop web fonts load independently so a font-service outage cannot prevent application startup. Vercel SPA rewrites support `/mobile` and nested refreshes while excluding the service-worker JavaScript endpoint; deploy the normal `dist` build, with no additional backend.

Validation: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and `APP_URL=http://127.0.0.1:4173 node tests/mobile.mjs` against a production preview. The mobile suite covers direct/nested routes, lazy loading, 320px phones, touch GIS/sheets/fullscreen, landscape/tablet sizing, year/district synchronization, deterministic evidence, model ranking, acknowledgements, local checklist/bookmark persistence, report exports/print and offline reload plus desktop state reuse. Synthetic browser fixtures remain isolated from public research datasets. The existing eleven desktop browser suites remain regression checks.

### MALARIASCOPE Watch companion demonstration

Open `/smartwatch`, the desktop sidebar’s **MALARIASCOPE Watch** link, or the mobile More menu. The separate lazy-loaded demonstration renders a round charcoal watch with Risk, Surveillance, Climate, Forecast, Alerts, Readiness, Sync, Data and District screens. Use the selector, Previous/Next, horizontal swipes or arrow keys while the watch is focused. Compact screens scroll vertically. Optional autoplay pauses when the watch has focus, a notification is open or the document is hidden, and is disabled under reduced-motion preferences. District/year/model/risk-mode selections share the main application context; the selected watch screen is saved locally.

Typed watch adapters reuse the existing aggregate join, risk engine, adjacent-year changes, climate anomalies, analytical alerts and readiness matrix. The six compact readiness domains project SURV / DX / PREV / REF / EVAC / DATA from the existing eight-domain system; full review evidence remains in MALARIASCOPE. The circular ring represents ordinal research categories, not a risk probability or model confidence. Predictions are only loaded model outputs, with unavailable confidence intervals labeled explicitly. Unknown, invalid or ambiguous values remain `—` / **No Data**. When no imported registry exists, the existing supplied study incidence ratio can be inspected at its actual observation year, clearly marked as not independently verified; cases, population, predictions and alerts are never invented from that ratio. Loaded datasets are never supplemented with unrelated supplied results.

Notifications preview existing district-year analytical alerts. VIEW opens Alerts; DISMISS closes only the visual preview, leaving the shared review/acknowledgement status unchanged. Sync means local application evidence is connected, not physical watch pairing or a live surveillance feed. Last Loaded/Update is the actual session ingestion time, separate from the observation year. Data status distinguishes source-labeled VERIFIED inputs, derived calculations and absent evidence; source labels are not independent verification, and spatial risk provenance includes neighboring inputs and geometry status. Watch projections omit original rows, individual attributes, coordinates, checklist notes and custom alert descriptions.

This is a browser presentation companion, not a patient monitor, diagnostic device or troop-tracking system. The required research-prototype/aggregate-intelligence disclaimer remains outside the watch. No new scientific datasets, wearable backend or dependency is introduced. Existing Vercel SPA rewrites cover `/smartwatch` and direct refreshes.

Validation: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and `APP_URL=http://127.0.0.1:4173 node tests/watch.mjs` against a production preview. The watch suite covers all screens, source-derived risk, filters, actual alerts, notification dismissal, readiness, missing inputs, private-field exclusion, direct refresh, screen persistence, keyboard/swipe/autoplay/reduced motion, 320px phones, tablet/landscape sizing and shared desktop state. Browser fixtures are synthetic and never enter public research files.

## No API key map architecture

Before this audit, Leaflet requested CARTO tiles on every canvas. Now the default is
**LOCAL VECTOR MAP**: administrative polygons and analytical fills use locally loaded GeoJSON,
with a Papua-first camera. No GIS tokens or secrets are needed. The optional
**OpenStreetMap context — online** source uses standard `tile.openstreetmap.org` tiles with visible
attribution. No tiles are prefetched, bulk downloaded or cached for offline use. Overpass is an
optional public healthcare refresh; failure preserves the map and any loaded snapshot.

`/data/geography/papua-context.geojson` contains the existing Natural Earth country outlines,
not study districts. `/data/geography/geometry-metadata.json` records source, URL, public-domain
license, retrieval date, EPSG:4326 and SHA-256. Verified study district geometry is still **not
connected**. No substitute polygons are manufactured. The original `/data/boundaries.geojson`
remains available for older consumers. `/data/district-registry.json` lists only explicitly supplied
names, without invented codes or panel membership; it is not a complete administrative registry.
The resolver bundles this registry at build time. Replace entries only with documented administrative
identifiers and rebuild; `geometryCode` can map geometry identifiers to canonical surveillance codes.

Replace district geometry by importing a GeoJSON FeatureCollection through Data Center.
Features require Polygon/MultiPolygon closed, nonzero-area EPSG:4326 rings and `district` or `name`.
Optional identity properties: `district_code`/`code`, `canonical_name`, `normalized_name`, `aliases`
(string array). Add source URL/citation and license using the import controls. Country-tagged,
restricted, military, invalid-coordinate and duplicate-identity geometries are rejected.
Code joins precede aliases/normalized names. Ambiguous candidates are withheld and request a
manual geographic match; no automatic fuzzy match is used. Geometry imports activate analytical
map joins immediately, but validation does not establish independent source verification.

Data Center provides header-only CSV templates under `/data/templates/`:

| Dataset role         | Required fields                                                                           | Optional fields                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Observed malaria     | district, year, cases                                                                     | district_code, population, incidence, rainfall, temperature, humidity, prediction, model (legacy combined imports) |
| Population           | district, year, population                                                                | district_code                                                                                                      |
| Climate observations | district, year, at least one of rainfall/temperature/humidity                             | district_code and remaining climate variables                                                                      |
| Model predictions    | district, year, model, prediction, trainingPeriod, validationPeriod, outputClassification | district_code                                                                                                      |
| District risk        | district, year, risk, score, method, outputClassification                                 | district_code                                                                                                      |

District is nonempty text (maximum 100 characters), years are integers 1900–2100, observed cases
are nonnegative integers, population is positive, rainfall/prediction are nonnegative, humidity
is 0–100, and temperature is finite. Model names are Persistence, Ridge Regression, Random Forest,
Gradient Boosting and Ridge Regression — no climate. Risk categories are LOW, MODERATE, HIGH, VERY HIGH. Separate sources reject
empty rows, duplicates and missing metadata. Anomalies are calculated from annual history (minimum
three preceding periods with nonzero variance), rather than accepting an undocumented anomaly basis.

Choose the dataset role before selecting a file. Observations continue through the existing registry.
Supplemental population/climate/prediction inputs are stored in a separate registry, currently used
**only by GIS**. Conflicting supplementary values are withheld; the selected observed source takes
precedence. Model-only geography can display predictions but never acquires fabricated cases,
incidence or observed risk. Imported risk outputs are retained for source inspection and do not
replace the verified default formula. Scenario data remain separate from both registries.

A static facility snapshot can be imported as JSON or replaced at `/data/public-facilities.json`.
It requires `source`, `license`, ISO `retrieved`, optional ISO `dataPeriod`, and `facilities` containing
`id` (`node/123`, `way/123` or `relation/123`), `name`, `type` (hospital/clinic/doctors), `lat`, `lon`,
and matching `https://www.openstreetmap.org/{id}` URL. Only valid public records within the Papua
extent are retained; restricted/military records are excluded again on import. The bundled file
has zero facilities and honestly reports NOT CONNECTED. Live refresh remains optional.

DATA READINESS is available on Dashboard, GIS, Data Center and Scientific Integrity Center.
Legacy header-only surveillance remains an unconnected import template. The default study uses
VERIFIED RESEARCH EXTRACTION, climate aggregates and saved model outputs; supplied spatial/model
statistics are distinct from newly calculated outputs. Unsupported metrics stay unavailable. Missing metrics are never zero. Scientific
Integrity scoring continues to inspect observational datasets; separate source imports are schema
validated and listed separately, not silently included in an observational quality denominator.

Layer controls expose provenance, source versions, period, calculation, geometry metadata and
supplemental output classifications. Missing layer inputs show an unavailable message and gray
no-data polygons, distinct from LOW risk. Existing layer controls, comparison, neighbors, SVG/JSON
exports and worker Moran analysis remain available; adjacency now also runs in a worker on desktop.
Year/layer/opacity/selection changes update existing Leaflet layers, not the map instance.

Validation adds `APP_URL=http://127.0.0.1:4173 node tests/gis-reliability.mjs` to the existing suites.
It blocks all external services, exercises OSM/Overpass failures, checks local polygons and empty
surveillance, separate predictions, provenance, invalid geometry, mobile controls and direct refreshes.
Vercel rewrites preserve `/data/` and `/data/geography/`; deployed browser verification may require
Vercel SSO. Local deep-route checks do not prove authenticated deployed-route behavior.

## Research desktop and environmental IoT

Use `/aplikasi-desktop` for the shared desktop workstation and `/iot` for environmental sensor ingestion and an isolated optional simulation. `/prospective-registry` and `/model-monitoring` prepare future evaluation without generating forecasts or outcomes. See [the implementation report](docs/RESEARCH-DESKTOP-IOT.md) for datasets, exact totals, geometry licensing, scientific limits, IoT schemas and acceptance commands.

### Brand assets

The shared MALARIASCOPE mark is in `public/brand/malariascope-mark.svg`; the full navy/teal wordmark is in `public/brand/malariascope-logo.svg`, with a 512px PNG icon alongside it. All application headers share `BrandMark`, with adjacent product text providing its accessible name. The HTML shell supplies an SVG favicon, 16/32/48px ICO fallback and 180px Apple touch icon. Mobile offline caching includes the mark and browser icons.

The `/methodology` workspace now opens with **Data Coverage & Research Summary**, global-context metrics, source coverage/quality indicators and a searchable/exportable evidence catalog. Full research metadata lives under **Advanced Technical Details**. A separately labeled **Synthetic Demo — 100,000 Records** offers on-demand worker parsing and a paginated preview of fictional records; it never replaces verified research data. See [Methodology workspace documentation](docs/METHODOLOGY-EVIDENCE.md) for provenance, limits and fixture regeneration.

Empty analytical views can now be populated through **Analytical data source & demo**: restore the supplied study package or activate a clearly labeled connected synthetic demo (nine districts, six artificial annual periods, five illustrative model labels). Synthetic sources stay separated from research/user data and historical alerts. See [Connected analytical demo](docs/CONNECTED-ANALYTICAL-DEMO.md).

## Project and agent handbook

These documents describe contributor roles and project practices; they do not add an autonomous agent runtime. Start with [project rules](00-project-rules.md) and [development workflow](15-workflow.md).

- [00-project-rules](00-project-rules.md)
- [01-system-overview](01-system-overview.md)
- [02-architecture](02-architecture.md)
- [03-orchestrator](03-orchestrator.md)
- [04-planner-agent](04-planner-agent.md)
- [05-architect-agent](05-architect-agent.md)
- [06-backend-agent](06-backend-agent.md)
- [07-frontend-agent](07-frontend-agent.md)
- [08-qa-agent](08-qa-agent.md)
- [09-debug-agent](09-debug-agent.md)
- [10-security-agent](10-security-agent.md)
- [11-devops-agent](11-devops-agent.md)
- [12-reporter-agent](12-reporter-agent.md)
- [13-agent-communication](13-agent-communication.md)
- [14-project-memory](14-project-memory.md)
- [15-workflow](15-workflow.md)
- [16-repository-structure](16-repository-structure.md)
- [17-coding-standard](17-coding-standard.md)
- [18-testing-standard](18-testing-standard.md)
- [19-deployment](19-deployment.md)
- [20-roadmap](20-roadmap.md)

## Workspace reliability and feature audit

Saved workspace structure is checked before use. If local state cannot be read safely, the original is preserved until explicitly replaced; a cross-interface recovery panel offers original/session backups. Storage-full or blocked-write failures remain visible, with retry and complete session export. Shared study-source controls also offer integrity-preserving retries after connection failures. Resetting application data clears only this application's state and stale context query parameters. See [Workspace feature audit](docs/WORKSPACE-FEATURE-AUDIT.md) for all module suites and remaining evidence limitations.

## Workspace interaction improvements

Early Warning Center supports saved-rule search, status/priority filters, explicit unsaved-edit notices and draft preservation while filtering. Shared navigation waits for lazy-loaded headings and announces page changes across interface shells without disturbing query-only context updates. See [Workspace UX polish](docs/WORKSPACE-UX-POLISH.md) for behavior, limits and browser coverage.

## Research completion & optional services

[Research Operations & Integration](docs/RESEARCH-COMPLETION.md) adds persistent rule drafts, complete backup/restore, report archives, source/resource review, periodic surveillance, portable models and local spatial significance. The documented Python pipeline and authenticated service are optional and require authorized data and owner deployment. Smartwatch remains a browser demo. Missing official outcomes, denominator records and independent verification remain explicitly unavailable.

## Machine learning audit & audited training protocol

See [detailed ML audit](docs/ML-AUDIT.md) for fixed temporal/provenance issues and remaining data, validation and MLOps requirements. The optional `--tune` pipeline produces run v2, a no-climate comparator, paired uncertainty and model provenance. Model Laboratory imports and checks captured runs without replacing supplied study evidence.
