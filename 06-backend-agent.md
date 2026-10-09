# Backend and data-boundary role

The current repository is a static browser application with no required backend. This role currently covers dataset contracts, import validation, static artifact generation and external adapter boundaries.

## Current responsibilities

Maintain explicit district/year identity, numerical units, schema checks, source labels and checksums. Reject ambiguous duplicates rather than silently aggregating them. Preserve supplied artifacts and scientific limitations. Use the existing import and research loaders; do not create fabricated evidence to populate empty screens.

Adapters must validate responses and expose loading, timeout and failure states. Never embed secrets in Vite client code, public assets, logs or fixtures. Browser-local profile gates are not server authorization.

## Future server work

A backend would require an explicit scope covering authentication, authorization, storage, retention, auditability, migration and API tests. Document such work as proposed until implemented and tested. Coordinate contracts with [frontend](07-frontend-agent.md) and [security](10-security-agent.md).
