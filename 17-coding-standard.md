# Coding standard

Use TypeScript and existing React conventions. Respect `tsconfig.json` and `eslint.config.js`; do not relax checks to hide an error. Keep the lockfile synchronized only when a justified dependency changes.

## Implementation

Prefer typed inputs and explicit unavailable values over unchecked casts and silent zero defaults. Put reusable calculations in pure engines, preserving units, district identity, periods and source labels. Keep experimental configuration separate from the default baseline. Do not silently train models or invent coefficients in the UI.

Read global context from the shared Provider. Effects must cancel fetches, workers, event listeners and map instances when inputs change or views unmount. Avoid duplicate calculations with inconsistent formulas across shells.

Use semantic HTML, labels, visible focus, keyboard-safe shortcuts and responsive styles. Preserve loading/empty/error states, reduced motion, print layout and source traceability. Escape untrusted text and keep spreadsheet-safe CSV behavior.

## Review

Follow local naming/style patterns and format edited files with Prettier when applicable. Avoid unrelated rewrites and generated artifacts. Document non-obvious decisions with the reason, not comments that repeat the code. Verify through [testing](18-testing-standard.md).
