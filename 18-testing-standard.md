# Testing standard

## Baseline code checks

Run from the repository root with Node 22:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` runs `src/*.test.ts` with Node's TypeScript stripping. Use meaningful tests for analytical boundaries: missing inputs, duplicates, zero denominators, source conflicts, prediction pairing, deterministic spatial outputs and synthetic/scenario isolation. Do not add tests that merely repeat an implementation for a low-impact cosmetic change.

## Browser acceptance

Build first, then start `npm run preview -- --port 4173` in a separate terminal. Install Chromium with `npx playwright install --with-deps chromium` when needed. Browser scripts default to `/usr/bin/chromium`; override the executable for Playwright's installed browser:

```sh
export APP_URL=http://127.0.0.1:4173
export CHROMIUM_PATH="$(node --input-type=module -e 'import { chromium } from "@playwright/test"; console.log(chromium.executablePath())')"
node tests/mobile-responsive.mjs
node tests/mobile.mjs
```

Select additional suites from `tests/` for affected behavior. The authoritative automatic CI list is [.github/workflows/ci.yml](.github/workflows/ci.yml): GIS reliability, research/desktop/IoT, methodology, coverage, connected demo, responsive views and mobile/offline behavior. Other suites are available for targeted manual execution, not automatically included merely by this document.

Use isolated browser storage and distinguish fixtures from research. Wait for loaded content before layout assertions. Never rebuild while browser tests are reading `dist`. Report counts and failed/skipped/unrun checks accurately. For documentation-only work, verify links, filenames, command accuracy and diff hygiene without adding application tests.
