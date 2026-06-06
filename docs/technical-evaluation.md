# Technical Evaluation and Corrective Plan

## Evaluation Summary

The first base-layer commit established useful direction, but it was still closer to a concept scaffold than a production-grade foundation. The main issue was not that the files were wrong; it was that the contracts and reference implementation were too permissive for a platform that must scale across subjects, languages, devices, and services.

This update tightens the base layer in three areas:

1. **Contract discipline:** runtime primitives now validate enums, locales, date-times, arrays, safety metadata, and JSON-compatible payloads before creating frozen contract objects.
2. **Cross-language portability:** contract objects carry a `contractVersion`, and schemas explicitly allow that field so generated clients and services can negotiate versions safely.
3. **Production evaluation posture:** the architecture now has a written evaluation matrix that separates what is ready, what is risky, and what must be solved before UI, AI orchestration, or global rollout.

## Findings From the Previous Base Layer

| Area | Assessment | Risk | Correction |
| --- | --- | --- | --- |
| JSON Schemas | Good start, but no explicit version field. | Cross-language clients can drift silently. | Add `contractVersion` to schemas and factory outputs. |
| Runtime validation | Too permissive in several places. | Invalid tutor responses, malformed payloads, or bad locales can leak into storage/events. | Validate feedback types, next actions, confidence, date-times, locale tags, arrays, and JSON compatibility. |
| Event model | Directionally correct. | Anonymous events could serialize without `learnerId`, creating inconsistent shapes. | Default anonymous `learnerId` to `null`. |
| Answer evaluation | Useful only for simple deterministic answers. | Not enough for equations, pronunciation, essays, science simulations, or partial credit. | Keep it as a baseline evaluator and move advanced evaluation into subject packs. |
| Immutability | Contract objects were frozen, but caller-owned arrays/objects were also frozen by side effect. | Surprising behavior for UI code and service callers. | Clone contract data first, then freeze the clone. |
| Global scale plan | Useful but high-level. | Could be mistaken for implementation readiness. | Mark service boundaries, event backbone, latency budget, partitioning, and open decisions as planning artifacts. |

## Quality Gates Before Building UI

The next implementation phase should not start by hardcoding UI state directly into components. These gates should be satisfied first:

1. **Contract fixtures:** add sample objective/problem/event/response JSON files for at least math, language, and science.
2. **Schema validation tests:** run fixtures through a JSON Schema validator in CI.
3. **Subject pack boundary:** define how subject-specific renderers and evaluators plug into the base runtime.
4. **Session state model:** define workspace snapshots separately from append-only interaction events.
5. **Accessibility contract:** ensure every interactive workspace can expose keyboard alternatives and captions.
6. **Safety policy contract:** define age band, answer-reveal policy, escalation/handoff, and allowed tutor behaviors.

## Billion-User Readiness Evaluation

The current repository is **not** billion-user ready as an implementation. It is a base contract layer. To become billion-user capable, the platform will need:

- multi-region edge routing,
- stateless API workers,
- append-only event ingestion,
- partitioned OLTP storage,
- asynchronous analytics pipelines,
- CDN-backed curriculum assets,
- privacy-preserving learner profiles,
- rate limiting and abuse prevention,
- model-provider abstraction,
- offline-first client sync,
- observability with trace IDs on every event.

The contracts added here are intentionally small because global scale depends on stable, boring data boundaries more than on early feature volume.

## Recommended Next Build Sequence

1. Add `examples/` fixtures for math, language, and science using the schemas.
2. Add a schema validation test runner.
3. Create a `subject-pack` interface for evaluators and workspace renderers.
4. Build one web UI shell that reads a `Problem` and emits `InteractionEvent` objects.
5. Implement math visual grouping as the first subject pack.
6. Add language token selection as the second subject pack to prove generality.
7. Add tutor orchestration only after events, evaluation, and workspace snapshots are stable.

## Explicit Non-Goals for the Base Layer

- It should not implement a full production database.
- It should not bind to one AI provider.
- It should not define one universal UI for every subject.
- It should not store raw audio/video by default.
- It should not treat AI-generated feedback as the source of truth for correctness.
