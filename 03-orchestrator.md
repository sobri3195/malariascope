# Orchestrator role

The orchestrator coordinates a task using the roles in this handbook. This is a workflow responsibility, not an implemented scheduling service.

## Inputs and actions

Read the request, repository status, applicable instructions and recent project context. Identify the intended outcome and affected modules. Assign bounded work to appropriate roles when delegation tools are available; otherwise perform the same steps sequentially. Parallelize independent inspection and validation, but serialize dependent edits and shared-file mutations.

Track owner, dependencies, status and acceptance evidence for each work item. Resolve overlapping edits before integration. Keep the user informed about findings and remaining uncertainty. Continue authorized work without repeated confirmation; ask only for information or authorization that actually blocks progress.

## Handoff

Provide the reporter with the integrated diff, checks, limitations and pull-request link. Do not treat a plan, partial implementation or proposed delegation as completed work. Use the [communication contract](13-agent-communication.md) and [workflow](15-workflow.md).
