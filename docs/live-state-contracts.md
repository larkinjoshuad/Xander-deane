# Live State Contracts

The web shell now uses formal contract shapes for the live learning loop. These contracts sit between problem content and future persistence/AI orchestration.

## Contracts Added

| Contract | File | Purpose |
| --- | --- | --- |
| `WorkspaceSnapshot` | `schemas/workspace-snapshot.schema.json` | Captures live workspace state, version, session, problem, and update time. |
| `TutorPolicy` | `schemas/tutor-policy.schema.json` | Constrains answer reveal, hint levels, allowed feedback, modalities, and safety behavior. |
| `EvaluationResult` | `schemas/evaluation-result.schema.json` | Captures deterministic evaluator output before tutor feedback or AI explanation. |
| `SessionRecord` | `schemas/session-record.schema.json` | Captures recoverable session state, append-oriented events, snapshot history, and latest tutor/evaluation output. |

## Runtime Flow

1. `createInitialLearningSession` creates a `WorkspaceSnapshot` and `TutorPolicy`.
2. Learner actions update the `WorkspaceSnapshot` and append `InteractionEvent` records.
3. `checkWorkspaceAnswer` converts the snapshot into a submitted answer.
4. The subject-pack evaluator returns raw deterministic diagnostics.
5. `createEvaluationResult` normalizes the result into a portable `EvaluationResult`.
6. Tutor feedback is generated from `EvaluationResult` plus `TutorPolicy`.
7. `session-persistence` writes a `SessionRecord` so the browser shell can recover current workspace state and append a snapshot/event audit trail.

## Why This Matters

Formal live-state contracts unlock:

- replayable sessions,
- offline synchronization,
- append-only event persistence,
- AI tutor context,
- deterministic audit trails,
- cross-device recovery,
- safer answer reveal behavior.

## Current Limitations

The contracts are intentionally generic and allow subject-specific `state` and `diagnostics` objects. Future subject packs should define tighter subject-specific state conventions when they become stable.

The web shell now has a generic `WorkspaceHost` for math equal-groups, language token-selection, and science classification sorting, plus browser-storage, memory, and file-backed service adapters for prototype recovery. The next major product step is browser-level verification across all workspace kinds and a production persistence adapter with authentication and retention controls.
