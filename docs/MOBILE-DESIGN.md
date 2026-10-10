# Mobile intelligence redesign

The dedicated `/mobile` workspace follows the supplied mobile reference through a centered, maximum 520px canvas; locally served Inter; mint/navy tokens; generous white cards; a compact logo/header; year/district/risk chips; an accessible filter sheet; a prototype banner; two primary KPIs; research-risk counts; source status tiles; local-vector preview; an observed-burden chart; and fixed safe-area-aware bottom navigation.

The existing eleven mobile routes remain intact. The shared mobile card/sheet treatment also applies to district profiles, analytical alerts, model inspection, readiness, data quality, provenance, and reports. More groups Research, Data, and System tools. Desktop-only source onboarding is replaced with a mobile source panel; synthetic activation/export remains available in More. Direct routes and browser refresh on the currently deployed `https://malariascope.vercel.app` returned HTTP 200 with HTML for all eleven paths. This verifies existing production routing, not deployment of this PR.

## Scientific invariants

No observed dataset files, scientific selectors, risk/forecast/alert/readiness formulas, or verified configurations are changed. Home continues to use `mobileEvidence` and existing joined district evidence. Its incidence card now also scopes the displayed cohort to the selected district; the incidence formula is unchanged.

The existing joined 2025 mobile cohort contains **nine districts and 288,879 cases**, including Supiori from the separate spatial outcome snapshot. The balanced eight-district panel and supplied aggregate remain **288,131 cases**. The redesign does not force these different analytical populations to match the illustrative screenshot. Available-record counts and source labels stay visible; extraction is not independently audited. When no observations are connected, supplied aggregates remain explicitly separate from a user dataset.

The new trend groups existing case observations by year. A period with missing case inputs remains unavailable. Only adjacent annual observed points are connected; no missing-year interpolation, uncertainty bands, or illustrated growth percentage is generated. Different-period cohort coverage is not assumed constant.

The preview and full map render the same `MapCanvas` with the existing geometry checks, values, breaks, missing-data colors, and spatial inputs. The preview defaults to observed cases, labels its layer, and exposes the calculated legend. Country outlines are geographic context only. No district geometry or facility points are synthesized.

Source statuses reuse the original availability helpers. ONLINE describes browser connectivity, not server or model health. DATA CACHED appears only after the service worker confirms its cache set. Cached/local freshness and known cache timestamp remain inspectable. The public font joins the explicit offline public-asset allowlist; uploaded data are not cached by the worker.

Filter changes still synchronize immediately. Apply filters closes the sheet; Reset resets view filters while retaining the selected dataset. The sheet adds the model control, an explicit immediacy note, a handle, visible focus, and the existing focus trap/Escape restoration. Reduced-motion users receive static skeletons and no sheet entrance animation.

## Verification

`tests/mobile-design.mjs` checks the five requested phone sizes (320×568, 360×800, 390×844, 430×932, 480×1040), landscape, and desktop preview; actual package totals; no desktop onboarding leakage; filter chips/model/reset; navigation target size; all eleven direct and refreshed routes; full mobile-shell axe accessibility; source separation; honest missing incidence; loading skeletons; empty map/risk states; public-asset failure and retry. Existing mobile tests retain offline, map taps, district sheets, fullscreen, alert review, persistence, report export, model-ranking direction, and shared desktop state.

Final local checks passed: `npm test` (181 tests), `npm run typecheck`, `npm run lint`, and `npm run build`. Browser checks passed for `mobile-design.mjs`, `mobile.mjs`, `mobile-responsive.mjs`, and `scientific-dashboard-design.mjs`. The mobile redesign suite reports zero axe violations across all eleven mobile routes. These automated checks do not establish clinical validation or accessibility certification.

## Screenshots

- [430px mobile viewport](screenshots/mobile-intelligence-430.png)
- [430px complete workspace](screenshots/mobile-intelligence-full.png)
- [Disconnected workspace](screenshots/mobile-intelligence-disconnected.png)
