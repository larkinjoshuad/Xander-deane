# Base Layer Architecture

## Mission

Create a subject-agnostic, multilingual, multimodal AI learning platform that can support math, language, science, history, arts, and custom educational domains while remaining portable across programming languages and scalable to global traffic.

The first screen from the concept sketch becomes a reusable pattern:

- **Tutor communication surface:** text, speech, captions, visual highlights, and future avatar/video.
- **Interactive problem workspace:** drawing, touch, drag/drop manipulatives, typed answers, spoken answers, camera/gesture extensions.
- **Event stream:** every meaningful learner, AI, and UI action is captured as structured data.

## Non-Negotiable Design Principles

1. **Subject neutrality:** The core platform must not assume math-only behavior. Math multiplication, language vocabulary, science classification, and music rhythm exercises all use the same objective/problem/event/tutor-response contracts.
2. **Language portability:** JSON Schema contracts in `schemas/` are the source of truth so services can be implemented in TypeScript, Python, Go, Rust, Swift, Kotlin, or other languages.
3. **AI as a tutor, not the database:** Deterministic services evaluate known facts and rules first. AI generates guidance, questions, explanations, and multimodal instruction from structured context.
4. **Multimodal by default:** Text is required, audio/video/gesture/drawing/touch are optional capabilities negotiated per learner, device, and problem.
5. **Accessibility first:** Captions, keyboard operation, alternative input, reduced motion, and screen-reader friendly state are core data fields, not afterthoughts.
6. **Global scale:** The platform should be stateless at the edge, event-driven in the core, partitioned by tenant/region, and observable by trace IDs.
7. **Privacy and safety:** Learner data should be minimized, encrypted, region-aware, age-aware, and separated from AI model training unless explicitly authorized.

## Core Domain Contracts

| Contract | Purpose |
| --- | --- |
| `LearningObjective` | Defines the skill or understanding being taught across any subject. |
| `Problem` | Defines a prompt, expected answer, modalities, and workspace shape. |
| `InteractionEvent` | Captures learner, AI, and UI events as an append-only learning record. |
| `TutorResponse` | Gives the UI structured text, speech, feedback type, highlights, next action, and safety metadata. |
| `LearnerProfile` | Stores locale, accessibility requirements, and tutoring preferences. |

These contracts allow the UI and services to work consistently across subjects. For example:

- Math: build three groups of four counters.
- Language: identify the verb in a sentence by tapping words.
- Science: drag animals into classification groups.
- History: place events on a timeline.
- Music: tap a rhythm pattern and receive corrective feedback.

## Reference Service Boundaries

```text
Client Applications
  - Web
  - iOS / Android
  - Classroom smart board
  - Assistive-device UI
        |
Global Edge/API Gateway
  - Auth/session verification
  - Locale/device capability negotiation
  - Rate limits and abuse protection
        |
Learning Runtime APIs
  - Objective service
  - Problem service
  - Workspace state service
  - Deterministic evaluation service
  - Tutor orchestration service
  - Progress/adaptation service
        |
Event Backbone
  - Interaction events
  - Evaluation events
  - Tutor response events
  - Analytics-safe derived events
        |
Storage and Intelligence
  - Regional OLTP database
  - Append-only event lake
  - Vector/search indexes for curriculum retrieval
  - Feature store for adaptation
  - Model provider abstraction
```

## Scale Strategy for Potentially Billions of Users

### Stateless Runtime

Frontend and API runtime nodes should be stateless. Session state, workspace snapshots, and progress should live in distributed storage. This allows horizontal scaling across regions and cloud providers.

### Partitioning Model

Partition high-volume data by:

1. region,
2. tenant or institution,
3. learner/session shard,
4. time bucket for append-only events.

The `InteractionEvent.trace` object exists so every event can carry request IDs, region IDs, model IDs, experiment IDs, and latency markers without changing the contract.

### Event-Driven Learning Record

Every learner action becomes an append-only event. This supports:

- replaying sessions,
- debugging tutor behavior,
- generating progress summaries,
- offline-first synchronization,
- analytics without coupling analytics to the live tutoring flow.

### Model Provider Abstraction

The tutor orchestration service should not bind the platform to a single AI vendor. It should accept `TutorContext` and return `TutorResponse`, regardless of whether the underlying implementation uses hosted LLMs, local models, rules, retrieval, or human-authored content.

### Latency Budget

Recommended initial targets:

| Operation | Target |
| --- | ---: |
| Render cached problem | under 100 ms |
| Check deterministic answer | under 150 ms |
| Produce scripted hint | under 200 ms |
| Produce AI-generated text hint | under 2 s |
| Produce speech audio | under 3 s or streamed |
| Persist interaction event | async, under 500 ms end-to-end |

The learner should never be blocked from continuing work while analytics or long-running AI enrichment completes.

## Subject Extension Model

Each subject adds content and evaluators without changing the base layer.

```text
subject-pack/
  objectives.json
  problems.json
  evaluators/
  workspace-renderers/
  tutor-prompt-policy.md
  localization/
```

Examples:

- **Math pack:** numeric equivalence, visual grouping, geometry canvas, equation editor.
- **Language pack:** token selection, pronunciation, grammar classification, reading comprehension.
- **Science pack:** classification, simulation labs, diagrams, claim-evidence-reasoning.
- **World language pack:** speech practice, translation, listening comprehension, spaced repetition.

## UI Base Layer

The scalable UI shell should be composed from these areas:

1. **TutorPanel**: renders `TutorResponse.messageText`, speech controls, hint actions, transcript, and safety handoff.
2. **Workspace**: renders the subject-specific interactive area from `Problem.workspace`.
3. **InputAdapter**: normalizes typing, speech, drawing, touch, drag/drop, camera, and keyboard events into `InteractionEvent`.
4. **FeedbackOverlay**: renders highlights from `TutorResponse.highlightTargets`.
5. **AccessibilityLayer**: exposes captions, ARIA labels, focus order, reduced motion, and alternative controls.

The UI should never need to understand every subject deeply. It should know the contracts and load subject-specific renderers/evaluators as plugins.

## First Implementation Slice

1. Keep the JSON Schemas stable and versioned.
2. Use the JavaScript reference implementation in `src/core/domain.js` for early prototypes.
3. Build a single math multiplication UI against the same contracts.
4. Add a language or science mini-problem next to prove the base layer is subject-agnostic.
5. Move deterministic evaluators into subject packs.
6. Add AI tutor orchestration once state and events are reliable.

## Open Decisions

- Initial app framework: Next.js, React Native, native mobile, or shared monorepo.
- First deployment target: web-only MVP or web plus tablet.
- Account model: anonymous learner sessions first or authenticated classroom accounts.
- Content strategy: hand-authored seed curriculum, generated problems, imported standards, or hybrid.
- Model strategy: hosted AI-only, hybrid rules plus AI, or pluggable providers from day one.
