> Historical audit: the findings below describe an earlier, pre-completion baseline. Current source availability and cross-module checks are documented in [Workspace feature audit](WORKSPACE-FEATURE-AUDIT.md) and [Research evidence](RESEARCH-DESKTOP-IOT.md).

# Production audit — vector GIS and data reliability

Audit baseline: main at 8986bc4. Existing analytical engines, routes, source classifications,
tests, CI and mobile/watch companions are retained.

## Findings before implementation

- `district-malaria.csv` contains a header and zero observations. It is not a connected source.
- Research summary, model metrics and spatial JSON contain supplied aggregate findings only;
  underlying district records and validation pairs are absent. Ridge/Gradient Boosting metrics are null.
- `boundaries.geojson` is Natural Earth country context, not district administrative geometry.
  No provenance-verifiable study district geometry is bundled. Imported polygons are validated.
- Population, climate, model predictions and public facility snapshots are not bundled.
- Every Leaflet canvas starts CARTO raster requests; tile errors leave vectors working but the
  provider is an unnecessary default dependency. Optional facilities use live Overpass.
- Desktop uses an all-or-nothing public evidence fetch; one failed summary blocks unrelated
  routes and locally imported evidence. Mobile already tolerates partial summary fetch failures.
- Code-first geometry joins exist, but aliases and explicit ambiguous-match feedback need work.
- Leaflet instances survive year/layer changes; styles are updated, ResizeObserver handles sizing.
  Moran permutations already run in a worker; adjacency currently runs on the main thread.
- Vercel SPA rewrites preserve `/data/` and assets. CI runs npm ci, typecheck, lint, tests, build.

No aggregate is expanded into fake district observations. Geometry imports remain independently
unverified. Context geometry must never enter district joins or neighborhood calculations.

## Implemented changes

- Map.tsx / MapCanvas.tsx / MobileMap.tsx: local-vector default, optional standard OSM context,
  provider status, layer availability, missing-data distinction, search/fit/clear, richer district
  drawer, layer provenance, mobile controls and supplementary scientific input projection.
- geometry.ts / district-registry.ts: code/geometry-code/canonical/alias resolution, explicit
  ambiguity, rejection of country-as-district and restricted identity properties.
- DesktopApp.tsx / scientific-sources.ts / store.tsx: separate typed population, climate,
  model-output and risk-source imports, metadata retention, source registry and removal; public
  evidence fetch failure no longer blocks local modules. Supplemental inputs currently feed GIS only.
- DataReadiness.tsx / data-readiness.ts / ScientificIntegrityCenter.tsx: system availability with
  transparent header-only, partial, summary-only, invalid and missing states.
- public-healthcare.ts: optional static snapshot validation, metadata and restricted-record
  filtering, optional failure-safe Overpass refresh and local snapshot persistence.
- hotspot.worker.ts: desktop adjacency computation off the main thread; existing Moran worker retained.
- geography assets / templates: documented local country context and checksum, missing district
  geometry declaration, partial registry, empty scientific templates and empty facility snapshot.
- mobile-sw.js: caches safe local context assets, never external tiles. No GIS API-key configuration.
- tests / CI / README / styles / tsconfig: network-failure browser gate, scientific reliability
  tests, accepted schemas, documentation, shared map status styling and registry JSON bundling.

## Evidence and limitations

`npm ci --cache /workspace/.npm-cache`, 141 unit tests, typecheck, lint and production build pass.
All 14 browser suites have passed: browser, district-360, warning-engine, hotspot,
forecast-workbench, risk-engine, scientific-integrity, readiness-matrix, scenario-simulator,
research-reports (including actual PDF checks), command-center, mobile, watch, gis-reliability.
Targeted GIS/district/mobile checks were repeated after identity and style changes. Tests use only
isolated fixtures; none are written to public research datasets. Supplied findings remain unchanged.

Actually bundled: supplied research summary, partial supplied model metrics, supplied spatial
summary and public-domain country geometry. Missing: raw district surveillance, population,
climate, district predictions, district spatial outputs, study district geometry and facility records.
The registry contains only known supplied names and is not a complete administrative registry.
Scientific schema validation does not independently verify research or imported provenance.

Remaining external dependencies are optional: OpenStreetMap context, Overpass facility refresh
and Google Fonts. The local core map requires no tile service, key or backend. Offline support is
limited to existing local imports and the mobile shell/assets previously cached; no external tile
cache is provided. Supplemental datasets do not yet feed the non-GIS analytical engines.

Vercel SPA rewrites and static data routes are preserved. Eleven specified routes were tested with
local production direct navigation and refresh. Existing production `/risk-map` responds HTTP 200
using trusted curl, but remote Chromium navigation fails with ERR_CERT_AUTHORITY_INVALID in this
environment. Deployed browser acceptance therefore remains unverified; TLS checks were not disabled.
