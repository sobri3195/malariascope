# Research intelligence implementation inventory

## Audit before implementation

| Component           | Current implementation                                                                                                       | Evidence state / remaining gap                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Web                 | React 19, TypeScript, Vite, React Router; shared localStorage provider                                                       | Functional local research workspace; interface profiles are not authentication                                    |
| Maps                | Leaflet ASEAN explorer, eleven pinned country outlines, nine Papua study ADM2 polygons; original GIS and spatial workers     | Country context is navigable, national malaria data and ADM1 remain unconnected                                   |
| Study records       | Checksummed 48-row eight-district 2020–2025 panel, independent nine-unit 2025 snapshot, 48 annual climate records            | Supplied extractions; underlying official reports not independently audited                                       |
| Forecasting         | Saved 2025 outputs for five approaches, rounded district pairs, partial supplied benchmark metrics, error/uncertainty panels | Missing complete validation/test comparison; supplied metrics must stay separate from point-output recalculations |
| Dashboard / climate | Filtered counts, annual charts, district inspection, Pearson associations                                                    | Need explicit cohort separation and the study's reported Spearman references alongside recomputed results         |
| Provenance          | Versioned manifest, source-quality ledger, reconciliation UI, coverage gaps                                                  | Historical period conflicts and new reference metrics need a traceable, unresolved source contract                |
| Research pipeline   | Optional Python temporal training and evaluation                                                                             | Unmerged PR #24 separately audits this pipeline; no pipeline changes in this work                                 |
| Services            | Optional FastAPI / SQLite authentication, revision history, scheduler and explicit notification dispatcher                   | Static Vercel deployment does not start the service; no shared service or delivery assumed connected              |
| Desktop / mobile    | Existing responsive shared research interfaces                                                                               | Functional browser interfaces; no claim of independent usability validation                                       |
| Environmental IoT   | Registry, adapters and isolated simulation                                                                                   | Actual telemetry requires a legitimate source; simulation remains labeled                                         |
| Smartwatch          | Compact browser research demonstration                                                                                       | No native device, clinical diagnosis or authenticated operational delivery established                            |
| Deployment          | Existing Vite build and Vercel SPA rewrites                                                                                  | No additional backend needed for small local research summaries; remote deployment not performed here             |

The newly attached master brief names a full paper, abstract and slide deck, but none of those original documents is present in the checkout or attachments. New reference values therefore carry **BRIEF-REPORTED / PRIMARY DOCUMENTS NOT REVIEWED** status. The full paper remains the intended primary authority; no discrepancy is resolved by inference. Existing checksummed source files, source totals and model artifacts will remain unchanged.

## Implementation plan

Reuse the existing provider, routes, map and export utilities. Add a research evidence workspace linked from the dashboard, climate and model modules, with reusable cohort, benchmark, diagnostics, climate and provenance panels. Keep the eight-district panel, nine-unit snapshot, six-province context, historical publications and ASEAN context separate. Compute summaries only from the selected cohort; expose missing observations and denominators as unavailable. Store brief-reported references separately from original study artifacts and newly calculated outputs. Add a complete metric-selectable reference benchmark, source reconciliation tasks, model-error diagnostics and annual Spearman calculations with explicit sample sizes and methods.

No new dependencies, database, API credentials or live integrations are planned. Existing navigation, imported-data workflows and interface shells remain available. Automated checks will cover source separation, rankings, row-level errors, denominators, ties/missingness in correlations, filtered exports and browser navigation.

## Delivered workflow

`/research-intelligence` provides cohort/annual data, benchmark references, calculated diagnostics, annual climate evidence, provenance/reconciliation and interface-status sections. Non-sensitive scope/section state is shareable in URL parameters; reporting year, district and model use the existing shared provider. The fixed study adapter is labeled separately from imported and synthetic datasets. Existing routes remain available through the research navigation.

The dashboard now links its selected-year/district numbers to the panel and snapshot separately. Climate Intelligence reuses the annual Spearman evidence panel; Model Laboratory reuses the full benchmark/source selector. The ASEAN map is reused rather than rebuilt. Individual cohort rows link to the same district/year on the map; no eight-district total is represented as an ASEAN or Indonesian national total.

| Phase                            | Files / outcome                                                                                                 | Evidence and remaining dependency                                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve and audit               | This inventory; existing Maps, provider, services and interface shells reviewed                                 | ASEAN map and original browser workflows remain available; no source or pipeline changes                                                                                                                 |
| Cohort dashboard                 | `research-evidence/engine.ts`, `Panels.tsx`, `Workspace.tsx`, dashboard links                                   | Panel is 48 records / eight districts; snapshot is nine records in 2025 only. No six-province/historical/national table is fabricated                                                                    |
| Benchmarking and climate         | Versioned `contract.ts`, reusable model/climate panels, existing module integration                             | Complete brief-reference table; missing original metrics stay missing. Spearman is recomputed with average-rank ties on complete annual pairs; raw monthly climate and original paper remain unavailable |
| Diagnostics and spatial evidence | Selected rounded point-output errors, observed API versus RF intensity, original Moran result, filtered exports | Matched prediction totals exclude Supiori; severe city error is visible. Reported 3-nearest-neighbor Moran and new queen-contiguity runs are explicitly different analyses                               |
| Integration / hardening          | Interface inventory, mobile styles, unit and browser acceptance                                                 | Adapter implementation is not a live connection. No new IoT/watch/service backend, clinical or operational validation is claimed                                                                         |

## Scientific contract and calculation details

`contract.ts` contains small, versioned references extracted from the **new user-provided brief**, not replacement study datasets. Each export identifies reference status/version/citation. The full paper is the intended primary source, with abstract/slides secondary; none was attached, so no value is called independently verified or a resolved manuscript result. The original artifact's RF validation MAE (11,060) and new reference (11,059.8) remain separate. RMSE/R² absent from the original artifact are not silently filled from the brief.

The selected outcome coverage denominator is the cohort's distinct district membership. Zero is a valid recorded episode count; absent records and nonfinite values remain unavailable. Ambiguous duplicate observation keys are excluded. API/population joins to the balanced panel require an exact district/year match **and agreement on episode counts** with the separate snapshot. Conflicts suppress the join and produce a warning. This is a field join, not an appended outcome row or a broader regional aggregate. Original reported API and its ratio recalculated from rounded inputs are separate export fields.

Diagnostics pair selected outcomes with model outputs having the same target year. Signed error is predicted minus observed; aggregate shortfall is observed minus predicted on the **same matched districts**. Missing predictions do not become zero, and unpredicted outcomes are excluded from paired totals. Error shares use the selected cohort's absolute-error denominator; relative error is unavailable for a zero observed count. Recalculated metrics use rounded point outputs and are not represented as the full-precision manuscript values.

Spearman uses complete annual climate/outcome pairs in the balanced cohort, average ranks for ties, at least three pairs and nonzero variation. The selected year/district changes the calculation and its `n`. Brief-reported correlations/intervals stay fixed and are labeled as references to an unreviewed original sample; the rainfall bootstrap interval is not recalculated for a subset. No causal coefficient, monthly malaria observation, interpolated outcome, new bootstrap interval or prediction probability is invented.

The provenance view preserves historical-period conflicts (2011–2020 versus 2010–2019), the brief's abstract/context period through partial-year 2026 versus complete outcomes through 2025, current-province membership uncertainty, raw monthly climate preprocessing gaps and existing 2024/2025 source discrepancies. User review remains available in Research Operations, but cannot manufacture an official resolution or promote independent validation.

## Exports, deployment and checks

Selected cohort JSON and long-format CSV retain scope/year/district, observations, units/definitions, original source files and checksums, versions, processing history, reference citation/status and explicit unknown source dates. Benchmark, diagnostics and climate panels have their own exports with the selected method/metric/model/sample. Source retrieval/publication dates are not inferred from export generation time. CSV uses the existing spreadsheet-formula-safe exporter.

No dependencies, lockfiles, original data artifacts, model pipeline, API/authentication configuration or Vercel configuration change. All calculations are bounded by the small local study package and run after selection, not on map movement. The route/panels are lazy-loaded. The existing Vite build and SPA rewrites support the route; remote deployment has not been performed or independently verified.

Validation commands from the checkout root:

```sh
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run preview -- --port 4173 --strictPort
# Separate terminal:
APP_URL=http://127.0.0.1:4173 node tests/research-evidence.mjs
APP_URL=http://127.0.0.1:4173 node tests/browser.mjs
APP_URL=http://127.0.0.1:4173 node tests/forecast-workbench.mjs
APP_URL=http://127.0.0.1:4173 node tests/asean-map.mjs
```

Unit tests cover cohort totals, true zero/missingness, conflicting field joins, metric/source ranking, original-versus-new discrepancy preservation, city/aggregate errors, missing Supiori predictions, denominator separation, correlation ties/variance/sample size and selected exports. Browser acceptance covers scope/period/district changes, JSON/CSV content, source switching, diagnostics, reference reconciliation, interface limits, URL restoration, mobile overflow, axe checks and integration into the existing dashboard/climate/model routes. The existing full browser runner discovers the new suite automatically.

Original research documents, raw monthly NASA POWER extraction, official geographic/denominator reconciliation, national datasets and operational service/device validation remain external prerequisites. This PR improves the connected research workflow and does not claim completion of those missing integrations.
