# Research completion implementation

The new **Research Operations & Integration** route is `/research-operations`. Existing pages keep their scientific basis and global context. Implementation does not supply missing official evidence, declare independent validation, or deploy a live service.

## Delivered application capabilities

| Area                    | Implementation                                                                                                                                       | Evidence / limit                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Monitoring              | Separate model, version, target period, dataset version/hash cohorts; matched-period descriptive error/feature shifts; duplicate district exclusions | Mixed-model summaries are unavailable; cohort counts shown                          |
| Monitoring UX           | Structured metric table, human-readable registry labels, collapsible JSON                                                                            | Small cohorts remain explicitly limited                                             |
| Evidence completion     | Selected-year six-year district/field gap queue; export                                                                                              | No missing values synthesized; source selection changes queue                       |
| Source reconciliation   | Reviewer/date/source/license/decision ledger                                                                                                         | User-entered reviews never modify study artifacts or promote verification           |
| Administrative identity | Official-code statement import, period validity, overlap rejection, source matching                                                                  | Shape IDs remain separate; official source must be supplied                         |
| Model laboratory        | JSON artifact import/export, preprocessing contract and inference                                                                                    | No uploaded executable/pickle; user-trained outputs separate                        |
| Modeling                | Ridge full/no-climate, RF, GB and Persistence pipeline with fixed seed, chronological lagged features and optional bounded temporal tuning           | Authorized annual input CSV required; no causal effect claims                       |
| Validation              | Rolling-origin evaluation, held-out error metrics, MAE bootstrap, declared calibration limits                                                        | Small calibration samples may have no finite interval; no live forecast claim       |
| Forecast workbench      | Deterministic whole-district MAE bootstrap on loaded pairs                                                                                           | At least three districts; not prediction coverage                                   |
| Local spatial evidence  | Conditional local permutations and Benjamini–Hochberg adjustment                                                                                     | Conditional on weights/input; quadrants not confirmed epidemiological hotspots      |
| Rule expression         | Nested AND/OR groups, maximum four levels and ten children per group                                                                                 | Legacy simple rules retained                                                        |
| Rule persistence        | Local draft recovery across routes/reload; 20 editors per page                                                                                       | Draft quota failure shown; stale revision drafts not applied                        |
| Periodic surveillance   | Persistent monthly/weekly import, exact adjacency, suppression, export and global year/district scope                                                | Separate from annual dataset; metric meanings must be declared correctly            |
| Complete backup         | Versioned shared state plus companion keys and drafts                                                                                                | Whitelisted keys only; restore preview, explicit replacement, rollback attempt      |
| Storage                 | Nested consumer guards, legacy partial-state migration to v2 on save, unknown versions rejected                                                      | Scientific validity remains separate                                                |
| Cross-tab conflicts     | Global saving pause, export, reload latest or explicitly replace                                                                                     | No silent last-writer overwrite                                                     |
| Reset                   | Primary, IoT, prospective, or all stores                                                                                                             | Explicit destructive confirmation                                                   |
| Reports                 | Searchable local archive, captured report open/export/delete                                                                                         | Complete backups carry archive; browser PDF remains supported                       |
| Readiness               | Resource statement import with source/license/review/expiry and contextual table                                                                     | Separate from checklist-derived matrix; no inventory invented                       |
| Checklist freshness     | Older-than-90-day review indication                                                                                                                  | Age indicator, not independently verified capacity                                  |
| Scenario sensitivity    | Joint burden/population ±20% grid; portable-model exploratory feature input                                                                          | Climate anomaly is not silently converted to raw model feature                      |
| IoT                     | Retry with capped exponential backoff, cancel cleanup, polling deadline, QoS 1 acknowledgment                                                        | Public anonymous adapter; QoS 2/private broker auth not supported                   |
| Offline                 | Inspect cached assets/public files; scoped mobile cache clearing                                                                                     | Unvisited modules may be unavailable; cache is not source freshness                 |
| Navigation              | History scroll recovery, existing focus/announcement behavior                                                                                        | Query-only updates retain editing focus                                             |
| Diagnostics             | Local bounded failure counter/export while panel is open                                                                                             | Not remote uptime monitoring; no sensitive payload collection                       |
| Server services         | Authenticated roles, CSRF, secure session cookie, revision conflicts/history, audit, future registry, scheduler/outbox                               | Optional deployment; SQLite owner can alter records, not independently tamper-proof |
| Notifications           | Explicit administrator email/webhook dispatcher                                                                                                      | No delivery on app open/startup; no real delivery performed during implementation   |
| QA                      | Coverage thresholds, 100,000-row pure-engine smoke, Main-region WCAG audit of 24 desktop routes, three-browser smoke                                 | Not whole-app scale/accessibility certification                                     |

## External prerequisites still required

- Original licensed surveillance/denominator/climate records: missing Supiori outcomes, historical at-risk population, unresolved 2024/2025 totals, and complete later annual outcomes.
- Official reconciliation and independent scientific/formula validation. Review UI cannot produce those facts.
- Monthly/weekly source observations for meaningful seasonal surveillance.
- Authoritative newer boundaries and official-code crosswalk evidence where historical boundaries change.
- Verified current resource inventory, legitimate sensor registry/telemetry, calibration evidence and public facility capacity sources.
- Production host/domain, users, TLS/reverse proxy, retention policy, backup location and owner-managed credentials for shared services/delivery.
- Device target, hardware and platform signing/configuration for a native Wear OS/watchOS application. `/smartwatch` remains a browser demonstration.
- Independent accessibility review and device testing. Automated checks only cover stated routes/behaviors.

## Reproducible modeling

Install Python dependencies into an isolated environment:

```sh
python -m venv /workspace/malariascope-env
/workspace/malariascope-env/bin/pip install -r research/requirements.txt -r services/requirements.txt -r services/requirements-dev.txt
```

Input CSV fields: `district,year,cases,rainfall,temperature,humidity`. Units: annual cases, annual rainfall mm, annual mean degrees C, annual humidity %. No population is inferred. Each district/year must be unique. Incomplete or noncontiguous lagged features are listed as excluded, never imputed.

```sh
/workspace/malariascope-env/bin/python research/train.py authorized-panel.csv --output research-output/run --test-year 2025 --source 'Declared authorized source' --license 'Actual permitted license'
```

The directory contains `run.json`, paired `predictions.csv` and four portable artifacts (including Ridge without climate). Import artifacts in Model Laboratory or Research Operations → Models. Import predictions using Data Center's model-output workflow; schema acceptance is not scientific verification. Raw lagged climate units are required for artifact inference; scenario anomaly controls cannot be substituted. Tree inference follows scikit-learn float32 input precision, tested against Python outputs.

## Optional shared service

Use the same origin as the application. Vite development proxies `/api` to `127.0.0.1:8000`. Production needs an owner-configured HTTPS reverse proxy; a static Vercel build does not start Python.

```sh
export MALARIASCOPE_DB=/workspace/malariascope-service.sqlite3
/workspace/malariascope-env/bin/python -m services.create_user analyst --role ANALYST
/workspace/malariascope-env/bin/uvicorn services.app:app --host 127.0.0.1 --port 8000
```

Passwords are entered using a hidden prompt and hashed with scrypt. Secure cookies are enabled by default. For local HTTP development only, launch with `MALARIASCOPE_SECURE_COOKIE=0`; production requires HTTPS and secure cookies. Configure `MALARIASCOPE_ORIGIN` to the exact application origin when a reverse proxy requires it. Roles: RESEARCHER, ANALYST, VIEWER (read only). Session expiry: eight hours. Request size limit: 20 MB. Reverse-proxy rate/body limits and database access controls are still production responsibilities.

Research Operations → Services provides sign-in, remote revision inspection/save/export, audit/outbox inspection, scheduled-job import and future forecast registration. Inspect the latest revision before saving. A 409 preserves the remote version. Export remote complete backups and restore using the Workspace tab. Server versions are retained; no destructive automatic retention policy is invented.

Job JSON has `id`, `expression`, `records`, `frequency` (`annual`, `monthly`, `weekly`), `persistence`, `suppress`. Records require `district,period,source,metrics`; expression leaves use `metric,operator,value` and optional `upper`; groups use `join,children`. Weekly dates must be Mondays. Missing periods rearm suppression. Run the scheduler separately:

```sh
/workspace/malariascope-env/bin/python -m services.scheduler --once
# Continuous background evaluation (no message delivery):
/workspace/malariascope-env/bin/python -m services.scheduler --seconds 60
```

Future registry JSON requires `district,model,model_version,target_start,target_end,data_cutoff,prediction,dataset_hash`; timestamps are UNIX seconds. Registration must precede target start; outcomes must follow completed target end. Server timestamping is auditable within the owner-controlled service, not independent third-party certification.

Notification dispatch requires explicit `--deliver` and an authorized destination. Webhook variables: `MALARIASCOPE_WEBHOOK_HOST`, `MALARIASCOPE_WEBHOOK_URL` (public HTTPS, no credentials/redirects). Email variables: `MALARIASCOPE_SMTP_HOST`, `MALARIASCOPE_SMTP_PORT`, `MALARIASCOPE_SMTP_FROM`, `MALARIASCOPE_SMTP_USER`, `MALARIASCOPE_SMTP_PASSWORD`, `MALARIASCOPE_ALERT_EMAIL`. Enter secret values in secure host configuration, never source files or chat. Native push delivery is not connected.

```sh
# Execute only after explicit authorization to send to the configured destination:
/workspace/malariascope-env/bin/python -m services.dispatch --channel webhook --deliver
```

Failed messages remain FAILED for administrator review; delivery is not silently retried. A crash after send can leave SENDING requiring review; exactly-once external delivery is not claimed.

Database backup:

```sh
/workspace/malariascope-env/bin/python -m services.backup /workspace/reviewed-backup.sqlite3
```

The command refuses overwrites and checks SQLite integrity. Stop service/scheduler before restoring an approved database backup. Preserve the replaced database first; restart and check `/api/health`, sign-in, revisions and audit. The service creates schema version 1 tables additively; future destructive schema migrations require a tested migration plan.

## Resource/crosswalk formats

Resource JSON array fields: `district,year,domain,status,source,license,reviewedAt,expiresAt,note`. Domains use readiness IDs; states are READY/REVIEW/ATTENTION/INSUFFICIENT DATA. Expired records remain visible and are flagged.

Crosswalk JSON array: `district,officialCode,validFrom,validTo,source,license`. Conflicting validity windows are rejected. Imported declarations do not rewrite bundled geometry or observation identities.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run test:performance
npm run test:research
npm run build
npm run test:browser
npm run test:cross-browser
npm run test:accessibility
```

Coverage thresholds apply to exercised TypeScript engine files, excluding tests/dependencies; React interaction is checked separately by browser tests. Performance smoke covers schema import, non-triggering case rules and paired-error aggregation, not GIS adjacency or dense alert generation. Three-browser smoke covers new operations navigation/controls; existing full suites run Chromium. WCAG automation checks the loaded main content of 24 desktop routes with bundled inputs and external requests blocked. It does not establish site-wide conformance, cover every interactive state, or replace assistive-technology review. Local Firefox requires a writable home configuration and WebKit its system libraries; CI installs all three browser dependencies. IoT unreadable saved values are preserved with automatic saving paused until explicit replacement.

Monitoring can capture optional prospective input features and ordered prediction interval bounds. Completed homogeneous cohorts show residual range/median and empirical interval coverage only for declared intervals. The configurable MAE-increase review threshold is exploratory, not a calibrated degradation test. Missing intervals, zero reference MAE and insufficient matched districts remain unavailable.

The follow-up [ML audit](ML-AUDIT.md) documents the run v2 contract, strict pre-holdout backtesting, fit identity, no-climate comparator, paired uncertainty and applicability limits. Legacy run v1 must be regenerated for the inspector; legacy inference artifacts remain usable with explicit unavailable provenance.
