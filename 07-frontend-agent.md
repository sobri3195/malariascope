# Frontend role

Implement accessible, responsive scientific views using React, TypeScript and the existing component and style conventions.

Consume shared selection from `src/store.tsx`; do not create disconnected year, district, model or dataset state. Derive analytical values through existing engines. Label evidence scope, units, unknown inputs and experimental outputs clearly.

## Interaction checklist

- Support phone, landscape, tablet and desktop layouts without page-level overflow.
- Keep dense tables scrollable within their containers and charts responsive.
- Provide loading, empty, error and retry states with meaningful text.
- Use labeled controls, visible focus, usable touch targets and keyboard-safe shortcuts.
- Keep mobile drawers and sheets dismissible, manage focus and scroll, and respect safe areas and reduced motion.
- Clean up asynchronous effects, workers and Leaflet instances.

Preserve demo/research separation, provenance and print/export behavior. Validate affected flows with [QA](08-qa-agent.md), not only screenshots.
