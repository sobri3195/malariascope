# Workspace feature audit

This audit reviews the existing research application across its analytical modules and interface shells. Passing software checks do not establish epidemiological validation, live forecasting, authenticated access or operational readiness.

## Coverage

| Area                                                                      | Browser acceptance                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| Dashboard, imports, settings, exports and route navigation                | `browser.mjs`                                      |
| Global context, command palette, inspector, snapshots and activity        | `command-center.mjs`                               |
| District tabs, evidence, explanations and bookmarks                       | `district-360.mjs`                                 |
| GIS, spatial context, layers, comparisons and loaded spatial calculations | `gis-reliability.mjs`, `hotspot.mjs`               |
| Forecast metrics, paired outputs, ranking and error inspection            | `forecast-workbench.mjs`                           |
| Explicit rules, persistence, suppression and alerts                       | `warning-engine.mjs`                               |
| Risk modes, contributions, scenarios and missing-input behavior           | `risk-engine.mjs`                                  |
| Scientific integrity and analysis eligibility                             | `scientific-integrity.mjs`                         |
| Readiness evidence and local checklists                                   | `readiness-matrix.mjs`                             |
| Exploratory simulation and scenario isolation                             | `scenario-simulator.mjs`                           |
| Report sections, metadata, downloads and print/PDF output                 | `research-reports.mjs`                             |
| Methodology, source catalog, coverage and isolated 100k preview           | `methodology-evidence.mjs`, `coverage-summary.mjs` |
| Connected synthetic demo and research restoration                         | `connected-analytical-demo.mjs`                    |
| Research evidence, desktop workstation and environmental IoT              | `research-desktop-iot.mjs`                         |
| Mobile, offline cache, touch layouts and accessible navigation            | `mobile.mjs`, `mobile-responsive.mjs`              |
| Watch companion demonstration                                             | `watch.mjs`                                        |
| Cross-shell storage recovery, quota handling and study-source retry       | `workspace-recovery.mjs`                           |

These are the 21 current browser scripts. The full local audit runs them against a completed production build with independent browser contexts. The new `npm run test:browser` runner discovers every browser script, runs two at a time and fails if any script fails or times out. CI installs the PDF text extractor and runs the full matrix so all modules remain covered.

## Reliability improvements

Previously, a valid JSON value with an unusable workspace structure could break consumers; malformed saved contents could also be silently replaced. Structural checks now fall back to a usable session while preserving the original saved text. Automatic writes remain blocked until the user explicitly replaces it. The original can be downloaded without transformation.

A single provider persistence effect now saves all state changes, including hydrated study sources, selections and generated research-alert records. Storage failures produce a persistent warning across main, mobile, workstation, IoT and watch shells. The session remains usable, can be exported, and saving can be retried. Full session exports use underlying state so inactive uploads and geometry are retained even when a synthetic source projection is active. Structural storage validation is separate from scientific dataset validation.

Research-source loading failures now offer a retry in the shared source controls. Retrying fetches the package again with the existing checksum/count checks; it does not create fallback observations or bypass integrity checks. Pending connection and source-error details are explicit. Application reset clears only the application's storage key and removes stale selection query parameters, so defaults are restored; failed clearing produces an actionable message.

## Verification and limits

Run typecheck, lint, unit tests and build, then applicable scripts from the table with `APP_URL` and `CHROMIUM_PATH` configured as described in [testing standard](../18-testing-standard.md). Do not rebuild while browser scripts read `dist`.

Public study artifacts, synthetic fixtures, scientific formulas and default research configuration remain unchanged. Unconnected facilities, real environmental sensors, trained model artifacts, independent verification, secure multi-user storage and prospective outcomes remain external requirements. A successful software audit does not supply those missing inputs. Remote CI/deployment status is reported separately from local browser verification.
