# Deployment

MALARIASCOPE is built as a static Vite application. A deployable build does not establish clinical, operational or independent scientific validation.

## Vercel configuration

| Setting                  | Value                                 |
| ------------------------ | ------------------------------------- |
| Framework                | Vite                                  |
| Build command            | `npm run build`                       |
| Output directory         | `dist`                                |
| Install                  | `npm ci` using the committed lockfile |
| Core application secrets | None required                         |

`vercel.json` rewrites application routes to `index.html` while preserving data, assets and the mobile service worker. Keep its no-cache worker header and `/mobile` scope. Verify direct `/mobile`, `/risk-map`, `/methodology`, `/iot` and workstation links after routing changes.

## Release checks

Review the diff and applicable local checks, then inspect GitHub CI and Vercel preview status for the actual commit. Check source loading, provenance, empty/error states and mobile cache behavior when relevant. A successful deployment status is not evidence that an authenticated remote browser audit occurred.

A pull-request request authorizes branch publication and review, not merging. Production release follows the repository owner's authorized merge/release process. Rollback uses the host's previous deployment or a reviewed revert; preserve exported local evidence before clearing browser state. Do not publish sensitive data or credentials in static assets.
