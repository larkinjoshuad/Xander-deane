# Web Shell Prototype

The web shell is the first runnable implementation of the original sketch. It keeps the experience intentionally small: a tutor communication panel, a generic workspace host with math equal-groups, language token-selection, and science classification-sort renderers, action controls, a learner progress dashboard, a recent-session picker, a guardian preview, and a learner-friendly activity timeline.

## What It Proves

The prototype demonstrates that the contract-first base layer can drive a learner-facing experience:

1. It loads the math, language, and science objective/problem fixtures from `examples/`.
2. It creates a subject pack using the runtime in `src/core/subject-pack.js`.
3. It creates a workspace descriptor and schema-compatible workspace snapshot through `src/app/learning-session.js`.
4. It lets the learner tap counters/groups, select sentence tokens, or sort classification items as kinetic interactions.
5. It emits structured `InteractionEvent` records for presentation, movement, reset, and answer checking.
6. It evaluates the workspace deterministically before showing tutor-style feedback.
7. It keeps tutor policy, evaluation results, and session recovery records in explicit contract shapes.
8. It summarizes attempts, accuracy, mastery status, saved snapshots, and next-step guidance in the learner-facing dashboard.
9. It lets learners intentionally resume or clear recent saved sessions from browser storage.
10. It gives adults a quick preview of progress, consent readiness, local-storage status, and audit/export signals.
11. It translates raw interaction events into learner-friendly recent-work timeline entries.

## Running Locally

Start a static server from the repository root:

```bash
npm start
```

Then open:

```text
http://localhost:4173/app/
```

The app uses browser-native JavaScript modules and `fetch`, so it should be served over HTTP rather than opened directly from the filesystem.

## Current Scope

Included:

- math equal-groups problem,
- language token-selection problem,
- science classification-sort problem,
- generic workspace-host routing,
- tap/click counter placement,
- keyboard-accessible group targets,
- reset and check actions,
- browser speech synthesis button when available,
- structured tutor feedback,
- schema-compatible workspace snapshots, tutor policy, and evaluation results,
- learner progress dashboard for attempts, accuracy, mastery status, saved snapshots, and next steps,
- recent-session picker for intentionally resuming or clearing saved browser work,
- guardian/educator preview for progress, consent readiness, local-storage status, and audit/export signals,
- learner-friendly activity timeline backed by structured interaction events,
- browser-storage-backed prototype session and progress recovery,
- DOM-oriented product-flow tests for workspace interactions and recovery.

Not included yet:

- real AI calls,
- authentication,
- production persistence,
- offline sync,
- advanced drag-and-drop,
- production analytics.

## Next UI Steps

1. Continue accessibility tests and screen-reader review across dashboard, guardian preview, timeline, session picker, and all three workspace kinds.
2. Replace local browser-only recovery with a server-backed persistence adapter for authenticated pilots.
3. Add AI tutor orchestration only after deterministic state, policy, persistence, and audit contracts are stable.
