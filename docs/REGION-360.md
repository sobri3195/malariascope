# Profil Wilayah 360°

Perbandingan dua pilihan Profil Wilayah 360° tersedia melalui **Tetapkan sebagai A/B**. Lihat [Bandingkan Dua Wilayah](REGION-COMPARISON.md) untuk aturan kesebandingan, URL publik, cakupan geometri, dan pengujiannya.

This follow-up starts from `main` `e54f7b9` (PR #36). It completes shared profiles for annual SISMAL as well as weekly SKDR, adds child selectors to the breadcrumb, makes administrative polygons keyboard-operable, and fixes late/lazy geometry focusing and alias-safe selection. The existing research `/risk-map` and its source identities remain intact.

## Shared context

Open `/risk-map?dataset=skdr-indonesia&source=skdr&snapshot=2026-m44&year=2026&region=11.03&gisLayer=cases`, or the same query on `/surveilans-indonesia`. Annual context uses `source=sismal&snapshot=sismal-2025&year=2025`. The existing provider owns source, year, snapshot and official region code; `gisLayer` remains the layer key. Neither a polygon label nor an unrelated research dataset name is used to join different sources.

Search, breadcrumb buttons, province/district selectors, polygon activation and table buttons select the same code. Enter/Space activate polygon buttons. A source polygon's explicit identity takes precedence over its display label, so a source alias cannot accidentally select a different master region. Polygon `aria-pressed`, selected table row, profile title/code and values all follow the current selection. Reload and Back/Forward restore the URL context. Selecting the current region reopens its profile without adding a duplicate regional-GIS history entry; legacy external tables may navigate to the same context to reopen a closed profile.

SKDR and SISMAL retain their own metrics and report periods. SISMAL's table now selects a region and opens the shared profile. No district count is summed into a province unless that source actually reports the province row. When a district value is missing, its own card remains unavailable. A parent card appears only for an available parent observation and is explicitly labelled as provincial context. Explicit zero is available data and does not trigger a parent fallback.

The profile's coverage is **source availability against master identities at the source level**: province rows for SKDR, district rows for SISMAL. National rows, duplicates and unknown codes do not inflate coverage. This is not official facility reporting completeness; that unavailable measure remains labelled as unavailable. The master supplies the denominator rather than a hardcoded provincial count for every source.

## Geometry and layout

The same lazy MapCanvas supplies polygon rendering. Regional profiles opt into focusing the selected identity after the canvas and geometry mount, and after a map resize, so a response that arrives after another region is selected focuses the current region. The general research/comparison canvas keeps its existing camera behavior unless it opts into this feature. Collapsing a profile gives the map the full grid width.

The source geometry remains the existing authorized public file. The profile does not fabricate national/provincial boundaries or convert unmatched source identifiers into Kemendagri codes. If valid matching geometry is absent, search, master selectors and the table still work. Existing geometry validation and no-data hatching apply. Right-side desktop profiles become bottom sheets on phones. No source snapshots, official figures or personnel permissions are changed by this follow-up.

## Validation

`src/region-profile.ts` holds the shared profile lookup and availability calculation. Unit tests in `src/region-profile.test.ts` check zero/null distinctions, absent/available parent observations, source-level master counts, national-row exclusion, duplicate identities and invalid codes.

`tests/region-360.mjs` exercises public profiles at 1440px and 390px against the built preview. A deliberately delayed, route-isolated synthetic geometry response arrives after the selected code changes. It checks initial focus/viewport alignment, latest highlight, keyboard Enter/Space, aliases differing from master names, direct reload, Back/Forward, shared Surveillance selection, annual SISMAL period/case data, district coverage and external-table reopening. Synthetic polygons are test-only and are not shipped as administrative boundaries.

Commands:

```sh
npm run typecheck
npm run lint
npm test
npm run build
# Start npm run preview -- --port 4173 in a separate terminal.
APP_URL=http://127.0.0.1:4173 node tests/region-360.mjs
# Full regression suite (Python dependencies from existing CI/setup are needed for personnel tests):
APP_URL=http://127.0.0.1:4173 npm run test:browser
```

Changed files: `src/MapCanvas.tsx`, `src/personnel/RegionalGIS.tsx`, `src/personnel/regional-gis.css`, `src/indonesia/SismalDashboard.tsx`, `src/DesktopApp.tsx`, `src/region-profile.ts`, `src/region-profile.test.ts`, `tests/region-360.mjs`, and this document. No dependencies or lockfiles changed. No deployment or merge is performed.

Actual local results: typecheck, lint and production build passed; **260 unit tests passed, 0 failed/skipped**; the dedicated public-profile test passed on desktop/mobile; and the complete browser runner passed **35/35 suites**, including personnel, research GIS, source loading and workspace navigation regressions. Real nationwide geometry and new official source publications were not obtained or claimed; the geometry test fixtures are isolated responses.
