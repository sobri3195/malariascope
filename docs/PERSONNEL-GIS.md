# GIS and internal administrative personnel

The public `/risk-map` retains research GIS, source filters, collapsible layer controls, camera reset, district drawer and epidemiology exports. Search accepts feature identities/codes and names and focuses matching geometry. Missing analytical values have SVG hatching (also in vector exports); explicit zero remains a numeric value. Incidence selection is disabled when the existing availability check finds no valid denominator/period. The internal entry link grants no API permission.

SKDR's shared GIS uses the current source/version, report period, master `regions.json` (boundary version 2025), selected code and existing selection callback. Search, breadcrumb, table and polygon use that same code. Heavy Leaflet rendering is lazy; unmatched official codes/invalid geometry preserve the region table and do not invent polygons. Clicking the main SKDR table updates this selection too. The loaded geometry is the existing public study geometry; it may not map to Kemendagri codes. Full national official GIS remains dependent on matching authorized geometry. No personnel data are added to public GeoJSON.

`/internal-personnel?region=11.03` checks `/api/personnel/access` before exposing the Personel layer. Authorized users choose province → district → Personel → unit → record. The right detail panel becomes a bottom sheet on mobile. Public cases and personnel administrative coverage have separate legends. The personnel layer uses administrative outlines; it does not plot people, GPS coordinates or facility/staff locations. Summaries and lists report only the assigned units. Placement reference date is independent of the malaria report period.

## Authentication and grants

The implementation reuses the existing FastAPI authenticated session resolver (`services.app.actor`). There is no institutional SSO integration or approved roster binding in this repository/environment. No headers or client-supplied roles are trusted. Use opaque institution account subjects, not NRP/NIP, as account IDs. Production institutional login must be integrated with that server resolver by the institution's identity owner before real roster use; the existing local session login is sufficient to test the complete synthetic flow. Do not describe the feature as institution-connected until that integration has been verified.

A normal application account has **no** personnel access. An operator with DB access provisions each allowed unit explicitly:

```sh
python -m services.create_user analyst --role ANALYST
python -m services.provision_personnel analyst approved-unit-id --role UNIT_OFFICER \
  --fields name maskedId role placementStatus
```

`SUPERVISOR` also needs explicit unit grants; it does not imply global access. `VIEWER`/`ANALYST`/`RESEARCHER` are application roles, separate from personnel privileges. Grants are stored in `personnel_grants(actor, unit_id, role, fields)` and cannot be edited over HTTP. Remove grants with an operator-managed DB change; every API request re-reads them. Session status is rechecked on focus and every 30 seconds. An opaque authorization version changes when the account or its grants/fields change; the private panel remounts and clears previous profiles on that change. Any failed personnel request removes displayed personal data; changing region remounts the private panel and aborts old requests. No personnel profile is written to localStorage or application workspace state.

## Private adapter and region–unit mapping

Set `MALARIASCOPE_ROSTER_FILE` to an approved JSON file **outside the checkout and all HTTP-served directories**. The adapter resolves symlinks and rejects checkout paths. Mount it read-only with operator-only access. Do not commit it, place it under `public/`, include it in static builds, or add it to an offline cache. Metadata contract:

```json
{
  "source": "Approved institutional administrative roster",
  "version": "institution-version-id",
  "placementAsOf": "2026-11-17",
  "units": [],
  "people": []
}
```

Unit fields are exactly `id` (stable approved administrative unit ID, letters/digits/underscore/hyphen, at most 100 characters), `regionCode` (existing master code, e.g. `11.03`), and `label`. Personnel fields are opaque UUID-v4 `id`, `unitId`, `name`, `maskedId`, `role`, `placementStatus` (`ACTIVE`/`INACTIVE`), optional `administrativeNote`. Only opaque IDs join personnel to units; NRP/NIP are not keys returned by the API. Pre-mask identifiers upstream: an optional alphabetic prefix, at least three `*`, and at most four suffix characters (e.g. `STAFF-***1234`). Full staffing identifiers and extra columns (including diagnosis, GPS or home addresses) are rejected. The approved adapter owner must also review the content of free-text fields.

The mapping is exact string code → unit ID → opaque person UUID. `11` includes units mapped to `11.xx`; `11.03` includes only that district. A parent summary never reports excluded child units, counts, records or hints of their presence. Unknown and unauthorized children/units/individuals return 404; unauthenticated requests return 401 and accounts with no personnel privilege return 403. Source failures return 503. Field projection applies to search as well as list/detail; querying a hidden role cannot infer a match. Filtering by a disallowed placement-status field is denied. Scope filtering happens before total/pagination; page size is bounded to 50.

All responses (including API errors) pass through the service's `Cache-Control: no-store` middleware. Detail access logs contain time, account, action `PERSONNEL_DETAIL` and result only; no names, raw identifiers, record IDs or profile contents. Standard Uvicorn access logs suppress personnel paths to prevent query terms and detail IDs entering HTTP logs; configure upstream/reverse-proxy logs to omit those paths and query strings too. The mobile service worker ignores APIs and additionally refuses to cache any `no-store` response. Epidemiology export code receives no personnel data.

## Synthetic demo and local verification

The default is disconnected (503 after authentication); no demo users or grants are installed automatically. To test with explicit synthetic server data:

```sh
export MALARIASCOPE_PERSONNEL_DEMO=1
export MALARIASCOPE_DB=/tmp/malariascope-personnel-demo.sqlite3
# Local HTTP testing only; use Secure cookies and same-origin HTTPS in production.
export MALARIASCOPE_SECURE_COOKIE=0
python -m services.create_user demo-operator --role ANALYST
python -m services.provision_personnel demo-operator demo-aceh --role UNIT_OFFICER \
  --fields name maskedId role placementStatus administrativeNote
python -m uvicorn services.app:app --host 127.0.0.1 --port 8000 --no-access-log
# In a second shell, same repo:
npm run dev
```

Use the existing Research Operations service login, then visit the internal route. Demo unit `demo-aceh` maps to `11.03`, `demo-jakarta` to `31.01`. Grant only the units required for the test. The UI prominently marks synthetic records and displays their placement date/source/version. Setting a roster file selects the real approved adapter instead of demo. No production roster or institutional credential was accessed in this task.

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:research` (now including personnel server tests). The existing CI installs Python requirements before all browser suites. With a built preview, `PYTHON=/path/to/python APP_URL=http://127.0.0.1:4173 node tests/personnel-gis.mjs` starts an isolated temporary demo server/DB on an ephemeral port and uses the real API. It verifies desktop/mobile authorization, province/district/unit/detail, search, field masking, ID tampering, session expiry, public epidemiology export isolation, no API caching, absent geometry and a clearly synthetic polygon's click/table/hatching. Mock geometry is test-only and never committed as administrative evidence.

Deployment, real roster integration, institutional SSO, and nationwide official geometry have not been validated. These are explicit integration prerequisites, not automatically enabled features.

## Region 360 profile and URL context

`/risk-map?dataset=skdr-indonesia&snapshot=2026-m44&year=2026&region=11.03` opens the same SKDR GIS/profile context used by Surveillance Indonesia. `region`, `source`, `snapshot`, `year` and `gisLayer` remain in the URL; explicit old edition links do not switch to a newer edition. Search results, table buttons, polygon clicks and breadcrumb buttons update the same selection. Native buttons support keyboard selection. Browser reload/Back/Forward read the URL rather than a second saved region state. Local GIS URL writes use the existing workspace-context synchronization marker so they cannot replay an older research-year/dataset selection.

The profile shows name/code, level, source/version/period and the available provincial reporting count. A missing district value stays unavailable; a separately labelled parent-province context card never substitutes that count for a district observation. The table highlights its selected row; matching polygons highlight the same code. Absent province boundaries are not synthesized from district values. The research map also exposes source identities and loaded-unit coverage in its existing district profile and retains research-specific identities; it does not join different study/SKDR sources by similar names. Its mobile drawer is a bottom sheet, and layer navigation is URL-backed.

The personnel entry preserves the public source selection when it comes from SKDR/SISMAL GIS. Changing personnel unit does not alter the epidemiology snapshot or put private values into that source. Metadata/counts are withheld while a response's edition/year no longer matches the selected source context.

Changed components: `src/Map.tsx`, `src/MapCanvas.tsx`, `src/hotspot.css`, `src/DesktopApp.tsx`, `src/indonesia/SkdrDashboard.tsx`, `src/personnel/RegionalGIS.tsx`, `src/personnel/PersonnelPanel.tsx`, `src/personnel/regional-gis.css`. Server/auth/adapter changes: `services/personnel.py`, `services/provision_personnel.py`, `services/app.py`. Cache guard: `public/mobile-sw.js`. Validation wiring: `package.json`, `services/test_personnel.py`, `tests/personnel-gis.mjs`, `tests/gis-reliability.mjs`. No dependency or lockfile additions and no public roster asset.


## Actual validation

Base main: `116b6c1` (PR #35). `npm run typecheck`, `npm run lint`, `npm test` (**258 passed, 0 failed/skipped**), production build, and `npm run test:research` (**13 passed**) completed successfully. The final complete browser runner passed **34/34 suites**, including the original research GIS, source/URL recovery and personnel workflows. After adding an explicit Forward check, the personnel/Profile-360 suite was rerun against the same build. Earlier runs exposed SVG-decoration selectors, legacy no-data expectations, an ambiguous parent-card label and stale workspace URL writes; these were corrected without removing the numeric, permission or persistence assertions. No external deployment or real institution roster/SSO was exercised.
