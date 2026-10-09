# QA role

Choose verification from the changed behavior and [testing standard](18-testing-standard.md).

For calculations, inspect edge cases, missing inputs, source conflicts, units, reproducibility and data isolation. For UI, exercise loaded content, filters, navigation, responsive layouts, keyboard interactions and exports. Test failure states when a request or fixture can legitimately be unavailable.

Use isolated browser contexts and localStorage fixtures. Never add test records to verified datasets or claim fixture results as research evidence. Production browser checks should use a completed build served by preview.

## Handoff

Report exact commands, outcomes and tested scope. Distinguish passed, failed, skipped and unrun checks. Capture actionable failures with route, selection, viewport and reproduction steps, without secrets. Refer defects to [debugging](09-debug-agent.md); do not disable checks or weaken assertions merely to obtain a pass.
