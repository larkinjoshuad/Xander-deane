# Subject Pack Development

Subject packs are the next layer above the portable contracts. They let the platform add subject-specific content, deterministic evaluators, and workspace descriptors without hardcoding every educational domain into the core runtime.

## What Belongs in a Subject Pack

A subject pack should contain:

1. **Learning objectives** that match `schemas/learning-objective.schema.json`.
2. **Problems** that match `schemas/problem.schema.json`.
3. **Evaluators** for deterministic, subject-specific correctness checks.
4. **Workspace descriptors** that tell a UI shell what kind of interactive surface to render.
5. **Tutor policies** that describe hint style, answer-reveal rules, and subject-specific teaching constraints.

The JavaScript reference interface is implemented in `src/core/subject-pack.js`.

## Why This Layer Exists

The base runtime should not know how every possible school subject works. Multiplication grouping, verb selection, animal classification, pronunciation, lab simulation, and history timelines need different evaluation rules and workspace layouts.

Subject packs keep that complexity modular:

```text
Core contracts
  -> stable objective/problem/event/tutor-response data
Subject pack
  -> subject-specific evaluator and workspace descriptors
UI shell
  -> renders the descriptor and emits interaction events
Tutor orchestration
  -> uses problem state, evaluation results, and tutor policy
```

## Current Example Coverage

The repository includes schema-backed examples for:

| Subject | Example |
| --- | --- |
| Math | Equal-groups multiplication using counters. |
| Language | Tap/select the verb in a sentence. |
| Science | Sort animals by observable traits. |

These fixtures live under `examples/` and are validated by `scripts/validate-fixtures.js`.

## Runtime Flow

A subject-aware learning session should follow this flow:

1. Load a subject pack.
2. Select a `Problem` from the pack.
3. Ask `createWorkspaceDescriptor` for a serializable UI descriptor.
4. Render the workspace in the client shell.
5. Emit `InteractionEvent` objects as the learner interacts.
6. Call `evaluateSubjectProblem` when the learner submits or reaches a checkpoint.
7. Send the evaluation result, problem, workspace state, and recent events to tutor orchestration.
8. Render a structured `TutorResponse` in the tutor panel.

## Evaluator Rules

Subject-pack evaluators should be:

- deterministic whenever possible,
- side-effect free,
- fast enough for immediate learner feedback,
- explicit about partial state such as group sizes or selected tokens,
- separate from AI-generated explanation text.

AI can explain the result, but deterministic evaluators should decide correctness when the answer is known.

## Workspace Descriptor Rules

Workspace descriptors should be serializable JSON. They should not include React components, DOM nodes, class instances, or functions. A web, mobile, or classroom UI can map descriptor fields to native components independently.

Example descriptor shape:

```json
{
  "contractVersion": "0.1.0",
  "rendererId": "math.equal-groups.pack.equal-groups",
  "problemId": "math.3x4.visual-groups",
  "kind": "equal-groups",
  "component": "EqualGroupsWorkspace",
  "props": {
    "groupsRequired": 3,
    "itemsPerGroup": 4
  }
}
```

## Validation

Run fixture validation with:

```bash
npm run validate:fixtures
```

Run the full test suite with:

```bash
npm test
```

## Next Steps

1. Add more example fixtures for additional grade bands and locales.
2. Add workspace snapshot contracts so UI state can be saved and replayed.
3. Add a tutor policy schema for age band, answer reveal, and escalation behavior.
4. Build the first web UI shell against the subject-pack descriptor flow.
