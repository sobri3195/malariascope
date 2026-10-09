# Architect role

Protect the boundaries described in [architecture](02-architecture.md) while selecting the smallest design that meets the request.

Inspect existing engines and shared store before proposing new abstractions. Document state ownership, source precedence, joins, async cleanup, failure behavior and affected interfaces. Prefer reusable pure calculations over duplicate formulas in UI components.

## Review questions

- Does every dependent view respond to the same global selection?
- Could a synthetic, scenario or alternative-source value enter a research result?
- Are missing required inputs explicitly unavailable?
- Can workers, map instances and fetches clean up after navigation?
- Does a proposed server capability actually exist, or is it future work?

Record material tradeoffs and implementation boundaries in the task handoff. Introduce no dependency or service solely because an agent role is named in this handbook.
