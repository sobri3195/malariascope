# ASEAN geospatial workspace

## Initial audit and integration plan

The existing React 19 / TypeScript / Vite application uses Leaflet. `/risk-map`, its embedded dashboard map, mobile GIS and the spatial lab already provide district selection, temporal comparisons, worker-based statistics and source-aware exports. The provider verifies a bundled Papua research package by SHA-256. Nine ADM2 study boundaries and 2020–2025 annual surveillance/climate extracts are available; eight districts have 2025 retrospective model outputs. The old country-context artifact contains Indonesia and Papua New Guinea only.

Core workflows run locally in the browser. Optional FastAPI services use separate authentication; there is no required backend, national epidemiology API, ASEAN data-sharing connection or client secret. Existing `.env.example`, Vite API proxy and Vercel SPA rewrites remain applicable. Research profiles are interface preferences, not authorization. Country outlines must never be joined to district records as national totals.

The implementation adds a lazy `/asean-map` workspace and a link from the current GIS. It extends the existing stack without migrating or replacing existing GIS routes. Pure typed adapters resolve country membership, validated URL filters, annual observations and export values; small React components own controls, timeline, comparison/detail panels and Leaflet lifecycle. Only the supplied study scope can carry thematic values. Natural Earth country outlines provide navigation, not authoritative subnational units.

Implementation order: (1) country geometry and regional navigation; (2) connected layer/filter/detail controls; (3) annual timeline, comparison, saved configurations and exports; (4) unit/browser regression checks and documentation. No breaking data migrations or dependency changes are planned. New national feeds and advanced analyses require separately validated sources and methods.

## Coverage and limits

No epidemiological observations are invented to populate empty countries. Papua New Guinea remains neighboring context in the existing map and is never an ASEAN member. Timor-Leste is included. Brunei and Singapore have navigation-point affordances at regional zoom; these points are not analytical geometry or facility locations. Greater Mekong is a navigation extent, not a complete GMS integration: Chinese provincial polygons are not supplied.

## Implemented behavior

### Map composition and interaction redesign

The first regional implementation retained a fixed 510px canvas, permanent layer sidebar and expanded timeline. It fitted navigation presets to hardcoded bounds, did not refit after container changes and showed the study palette even at a country-only extent. These choices reduced the usable map area and mixed administrative context with thematic evidence.

The redesign uses a desktop canvas of at least 70vh, fractional zoom steps and bounds derived from the actual selected country/study/district geometry. ResizeObserver updates the Leaflet size and fits the selected geography when no explicit saved camera is in use; saved cameras retain their center/zoom. Opening a panel refits with padding for its occupied area. Country and district selections clear the previous camera. Clickable ASEAN/country/Papua-study breadcrumbs provide the reverse path; Papua is explicitly a study extent, not a fabricated ADM1 boundary. The existing `/risk-map` district GIS and dashboard/mobile maps remain available, while `/asean-map` opens the regional experience by default.

Layers and Tools are collapsible floating panels. On mobile they use a map-contained bottom sheet, with navigation controls above it. A compact annual timeline expands on demand. The contextual legend starts with administrative context, and only shows epidemiological bins when an active thematic study layer has values. A provenance strip exposes dataset, period, availability, source/license, retrieval date and EPSG:4326. The existing source manifest and ledger links remain available. Unsupported indicators remain explicitly unavailable.

`MapChrome.tsx` owns breadcrumbs, contextual legend and provenance; `MapTools.tsx` owns the tool UI; `RegionalCanvas.tsx` owns map/layer lifecycle and real vertex placement. `measurement.ts` calculates great-circle distance and spherical polygon area through the existing Turf dependency. Tools accept map taps or keyboard-entered coordinates, support undo/clear/finish and export drawn study polygons with their method and USER-DRAWN classification. Polygon intersection lists the loaded study districts it touches; it never apportions district case counts into a custom area. Measurements are exploratory, not survey-grade. Invalid coordinates, self intersections, degenerate polygons, more than 256 vertices and polygons crossing the antimeridian are rejected (split antimeridian polygons first). ASEAN country geometry itself does not cross that meridian. Measurements run only when explicitly finished, against the nine available study polygons.

No new mapping provider, database, dependency, API credential or backend process is introduced. Only local vector context is offered as a basemap; external/raster providers remain unconfigured. No province/place gazetteer, monthly/weekly observations or national surveillance feed is implied.

- Eleven clickable country polygons, keyboard selection, country/ISO/district autocomplete, multi-country comparisons, ASEAN/Indonesia/Papua/Greater Mekong presets, pan/zoom, reset/fit, fullscreen, scale, pointer/tap coordinates and coordinate copying.
- Separate country and study layers, visibility, thematic opacity, ordering, explanatory legends, missing-data styling and model-output dashed outlines. One thematic indicator is displayed at a time to avoid silent unit overlays.
- The fixed, checksummed Papua adapter connects reported cases, incidence, rainfall, mean temperature, humidity, at-risk population and saved model outputs. Incidence uses cases / available at-risk population × 1,000, with supplied study incidence as a documented fallback. National observations are always unavailable, including Indonesia: no study-to-national aggregation is performed.
- Annual timeline, previous/next, play/pause and speed controls iterate only available district/indicator periods. Missing intervals are skipped, never interpolated. Comparison uses matched district identities and discloses the eight-/nine-district cohort change. Changes require adjacent annual periods.
- Filtered CSV and GeoJSON, map PNG with source/legend text, browser print/Save PDF, reproducible configuration JSON, local saved view, and shareable URL filters/camera. Failed actions report errors. Missing CSV values are blank, not zero. Country exports contain explicit unavailable values.
- Context details, district annual trend, source/version/license registry and links to the existing spatial/model tools. Existing GIS, dashboard and mobile routes remain available. The global study selector is hidden on this isolated fixed-study route so it cannot imply that an unrelated import or demo supplies these values; global command navigation remains mounted.
- No new dependencies, remote basemap requests, API keys, server routes, authentication changes, epidemiological alert thresholds or forecast generation.

This delivers the foundation and selected annual exploration/export capabilities. It does **not** claim completion of every phase in the master brief.

## Source and licensing records

`public/data/geography/asean-metadata.json` records the pinned source URL/commit, original and subset SHA-256, retrieval date, resolution, CRS, transformation history and limitations. Country outlines are an exact eleven-feature subset of Natural Earth 1:10m data distributed by `datasets/geo-countries` at `ca3b7150caa5d3cc3fb108a87fc6e3d57bd97d99`. Coordinate arrays are unchanged; JSON whitespace is compacted. Natural Earth is public domain; the maps are generalized navigation context, not a current legal or administrative determination.

To reproduce the subset, download `sourceArtifactURL` in the metadata, verify `sourceArtifactSha256`, select features whose `ISO3166-1-Alpha-3` is one of BRN/KHM/IDN/LAO/MYS/MMR/PHL/SGP/THA/TLS/VNM, and serialize `{type: 'FeatureCollection', features}` with compact JSON and a trailing newline. Verify the resulting SHA-256 against the metadata. No invented or manually drawn country polygons are used.

The existing `public/data/verified/geometry-metadata.json` attributes nine Papua ADM2 features to geoBoundaries, BPS, WFP and OCHA ROAP under CC BY 3.0 IGO, release `9469f09`, geometry vintage 2020. Its existing identifier caveats apply. The research manifest describes supplied study extractions, **not independent verification** of the underlying reports. Its source redistribution license was not specified by the supplier; review rights before redistributing study exports. Attribution and this limitation accompany data and map exports. No new provider license is inferred for existing study values.

WHO GHO/WMR, WHO Malaria Threats Map, ASEAN BTSC, national malaria programmes, ERA5, CHIRPS and WorldPop are candidate sources only. No network calls or data access agreements with these providers are introduced.

## Data model and contracts

`src/asean/engine.ts` owns typed map contracts:

| Contract             | Fields and behavior                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Country              | ISO alpha-3 `code`, display `name`, navigation `center`; country outlines retain ISO properties                                                                |
| Geometry             | GeoJSON FeatureCollection of Polygon/MultiPolygon, EPSG:4326; ADM0 and ADM2 never mixed as observation units                                                   |
| Filters              | Area preset, country array, study district, indicator, year, comparison year, model, layer visibility/opacity/order, optional `[lat, lon, zoom]` camera        |
| Indicator            | ID, title, unit, category, evidence kind and optional connected Row field; unconnected fields return null                                                      |
| Observation adapter  | Existing typed district/year Row from the checksummed package, preserving missing population/climate/prediction values; model values only in their target year |
| Export record        | Country/code, geographic scope, district, year, indicator, nullable value, unit, classification, model, version, source, license and limitation                |
| Configuration export | `schemaVersion: 1`, filters/camera, study version, metadata path, classification method and limitations                                                        |

`aArea`, `aCountries`, `aDistrict`, `aIndicator`, `aYear`, `aCompare`, `aModel`, `aVisible`, `aBoundaries`, `aOpacity`, `aOrder` and `aCamera` are non-sensitive URL state. Parsing rejects unknown country/indicator/model/preset identities, invalid years/cameras and nonfinite opacity. Country filtering also gates study observations: excluding Indonesia empties the study data and export. Independent existing workspace parameters are preserved. Saved views use `malariascope-asean-map-view` in localStorage and hold filter configuration only, not observation data or credentials.

The current application uses local source adapters, not a new HTTP API. The following are **proposed future backend contracts**, not implemented endpoints:

| Endpoint                     | Inputs → response / constraints                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/geographies`       | `q`, parent ISO/admin ID, level → bounded list of IDs/names/levels/bounds                                                              |
| `GET /api/boundaries`        | IDs, version, bbox, zoom → licensed GeoJSON or vector-tile descriptor, source version and CRS                                          |
| `GET /api/observations`      | ISO/admin IDs, indicator, period range, source/version → values with unit, evidence kind, provenance, quality flags and explicit nulls |
| `GET /api/series`            | Same geographic/indicator identity → observations at the source's declared resolution, with missing intervals                          |
| `GET /api/metadata/:version` | Version → provider, URL, license, period, retrieval, aggregation method, CRS and transformation record                                 |
| `POST /api/analyses`         | Authorized geography IDs, dataset versions, method/parameters/seed → asynchronous job ID, status and reproducible result descriptor    |
| `POST /api/exports`          | Validated filter/configuration and format → authorized export job, progress, attribution and expiry                                    |

Any future national adapter must retain denominator definitions, reporting periods, source definitions and coverage; reject incompatible aggregation rather than summing across providers. Large feeds require viewport queries, pagination/vector tiles, server aggregation, cancellation and authorization/rate limits. These capabilities are not simulated by the current static study adapter.

## Remaining capabilities and blocked integrations

National/subnational feeds outside the supplied study, ADM1 geometry, monthly/weekly or parasite/case-classification filters, deaths/testing, raster basemaps/environmental products, NDVI, facility/accessibility feeds, dense-point clustering, buffering, intervention analyses, new region-wide LISA/Gi* analyses and prospective forecasting remain unimplemented. The existing Papua spatial/model workspaces retain their supported analyses and parameters; linking to them does not establish ASEAN-wide model validation. Country data-sharing, live surveillance, authorization for external providers, uncertainty intervals and reliable prospective outputs have not been supplied. No artificial data or confidence intervals stand in for them.

## Performance and security

The route is lazy-loaded and adds no dependencies. The country geometry is ~1.0 MB before HTTP compression; target budget is 1.1 MB for this static ADM0 artifact. It is fetched once per route mount with cancellation and checked against its manifest digest before rendering. The provider reuses its existing checksummed study package. Leaflet instances persist during filtering; styles change in place, while geometries are rebuilt only when the study extent/geometry changes. All observers, timers and map instances are disposed on unmount. Bins are fixed over the complete study-period cohort so panning, country filters and playback do not silently change the numeric scale. No spatial-statistics workload runs on map movement.

Tooltip text is assigned through `textContent`, not interpolated HTML. Country/data files are local; the module exposes no API key. CSV string cells escape quotes and formula prefixes. Saved configurations contain public aggregate research filters only. Clipboard/storage/fullscreen/export failures produce explicit feedback. Existing authentication and deployment policies are unchanged. Checksums detect asset mismatch, not scientific truth or licensing rights.

## Validation and deployment

Run the existing Node 22+ workflow from the checkout root:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# In a second terminal:
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/asean-map.mjs
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/maps-redesign.mjs
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/browser.mjs
```

The ASEAN suite covers real local boundaries, all eleven identities, keyboard country selection, Papua drill-down, exact study values, temporal playback, observed/model distinction, layer controls, saved/URL state, comparison, downloaded CSV/GeoJSON/PNG, mobile layout, explicit load failure/retry, and the existing GIS route. The redesign suite checks the 70vh budget, projection-based containment of selected geometry, breadcrumbs, resize/fullscreen, layer/legend/provenance transitions, real map-click vertex placement, distance/area calculations, drawn-area exports and mobile sheet/control separation. Unit tests verify membership/checksum, URL validation, missing versus zero, geographic/period filtering, export attribution, formula escaping and measurement validity. The full browser runner discovers both suites.

Vercel continues to use `npm run build` and `dist`; the existing SPA rewrites cover `/asean-map` while preserving `/data/` assets. No extra environment variables, backend or Vercel configuration changes are required. Remote Vercel deployment is a separate owner action and is not claimed as verified by local browser tests.
