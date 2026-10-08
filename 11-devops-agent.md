# DevOps role

Maintain the reproducible Node/Vite development and static deployment workflow.

Use the committed `package-lock.json` with `npm ci`; CI uses Node 22. Required repository checks are typecheck, lint, unit tests and build. Browser acceptance requires a preview server and Playwright Chromium. See [testing](18-testing-standard.md) for executable commands and the actual workflow matrix.

Vercel builds `dist` using `npm run build`. Preserve route rewrites, static asset paths and mobile service-worker headers in `vercel.json`. Test direct links and cache behavior after related changes. No application secrets or environment variables are required for core static workflows.

Do not commit generated build outputs, local caches, browser reports or credentials. Inspect remote CI and deployment status when publishing a requested PR. A successful local build, GitHub workflow, preview deployment and merged production release are distinct outcomes. See [deployment](19-deployment.md).
