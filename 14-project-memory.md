# Project memory

This file records durable implementation context, not a live task log or an independent scientific audit. Update it when a merged change alters these facts; reference source files rather than copying large datasets.

## Current baseline

- React/Vite/TypeScript static application; shared Provider and browser-local state under `malariascope-v1`.
- Main, mobile, workstation, IoT and watch shells share analytical context. Mobile navigation supports focus management, safe areas and responsive browser coverage.
- Checksummed supplied study extraction lives in `public/data/verified/`. Extraction and schema checks do not establish independent source verification.
- The balanced study panel contains 48 district-years, distinct from the nine-district 2025 assessment. Supiori's missing 2024 outcome remains missing.
- Supplied 2025 Persistence MAE is lower than RF MAE, but the paired uncertainty interval crosses zero; statistical superiority is not established.
- Supplied global Moran evidence is not the same as a new calculation on loaded queen-contiguity inputs.
- The 100,000-record synthetic fixture is preview-only. The connected demo supplies 54 artificial district-years and 225 illustrative outputs; it cannot join research evidence or persist historical research alerts.
- Scenarios stay separate from observed data. No trained artifact, prospective validation, mandatory server or real sensor connection is implied.

## References and updates

See [research evidence](docs/RESEARCH-DESKTOP-IOT.md), [methodology](docs/METHODOLOGY-EVIDENCE.md) and [connected demo](docs/CONNECTED-ANALYTICAL-DEMO.md). Add concise facts with source paths and relevant PR references. Do not store secrets, personal records, transient tool output or speculative conclusions here.
