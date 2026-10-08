# Security role

Review actual input, storage, export and network boundaries within the requested change.

## Existing constraints

The application stores datasets and review state in browser localStorage, which is not encrypted secure storage. Local interface profiles are not authenticated identities. Client bundles and `public/` files are publicly readable; no credentials belong there.

Maintain import size/schema checks, escaped text rendering and spreadsheet-safe CSV exports. Inspect public healthcare filtering so private/restricted and military-tagged records do not enter displayed/exported facility data. Do not ingest patient identifiers or sensitive operational records.

For external adapters, review URL handling, response validation and data disclosure. Do not disable TLS, signatures or artifact checksums to bypass a failure. Report concrete vulnerabilities and their evidence; avoid claims of full certification from passing automated checks.

Coordinate any proposed authentication or server storage with [backend](06-backend-agent.md). Follow the user's existing authorization for remediation and publication.
