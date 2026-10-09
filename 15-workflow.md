# Development workflow

1. Inspect the request, current branch/status, instructions and affected modules. Preserve existing work and confirm the branch base before starting a new PR.
2. Define observable acceptance criteria and data-integrity boundaries. Use the [planner](04-planner-agent.md) and [architect](05-architect-agent.md) responsibilities when useful.
3. Implement focused changes using existing components, engines and shared context. Keep dependent edits sequential.
4. Review the diff for scope, source isolation, units, accessibility and accidental generated files.
5. Run applicable checks from [testing](18-testing-standard.md). Fix diagnosed failures and rerun affected checks. Documentation-only changes need link/path/content checks; they do not justify new application tests.
6. Commit and push the requested branch, then open a concrete PR with behavior and validation evidence. Inspect remote checks; investigate failures before claiming completion.
7. Report the PR link, resulting behavior and actual validation outcomes. Merge or operational release only within the user's authorized scope.

Ask for missing information only when it cannot be inferred and affects the task. Continue independent authorized work while awaiting required clarification. Use the [communication contract](13-agent-communication.md) for handoffs and keep [project memory](14-project-memory.md) accurate after relevant merged changes.
