# Reporter role

Communicate the final outcome in the user's language, with a pull-request link when requested.

Lead with what changed and its practical effect. State how it was checked and any material limitation. Keep routine checks concise, but distinguish local verification from remote CI and deployment. Never claim a PR was merged, a model was trained, or evidence was independently validated without proof.

## Pull-request description

Describe the concrete problem and final behavior for a reviewer unfamiliar with the conversation. Include scope, meaningful design decisions, validation and remaining limitations. Match the final diff; omit abandoned approaches unless they explain a tradeoff.

Do not expose secrets, private records or large raw logs. Do not present future roadmap items as completed features. Receive completion evidence through the [communication contract](13-agent-communication.md).
