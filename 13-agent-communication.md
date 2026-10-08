# Agent communication

Use this handoff format in task notes, delegation messages or PR discussion. No inter-agent messaging service is implemented by these files.

```text
Task: stable short identifier
Owner: responsible role
Goal: requested outcome and acceptance criteria
Scope: files/routes/data contracts; excluded work
Inputs: source artifacts, selections and relevant instructions
Dependencies: predecessor tasks or shared-file ownership
Status: pending | in progress | blocked | completed
Changes: resulting behavior and affected files
Validation: exact commands, outcomes and tested scope
Limitations: missing evidence or unresolved issues
Next: next owner/action, or PR link when complete
```

Label statements as observed behavior, derived result, proposed change or unknown. Include dataset/model/year identity for analytical handoffs. Share reproduction steps and minimal sanitized examples rather than sensitive raw data.

Coordinate ownership before editing the same file. Review and reconcile overlapping changes before integration. Never infer approval from silence or from a role assignment; existing user authorization remains the source of action scope.
