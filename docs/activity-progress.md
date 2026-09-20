# Local Activity Progress

The synthetic activity library resumes each activity independently in the same browser and origin. It remembers the selected round, answers, whether a sequence was checked, memory-card order, face-up cards, and matched pairs. Previous/Next revisits saved rounds. Again restarts only the current round. Hints and audio playback are not restored.

There are no accounts, learner identifiers, names, timestamps, analytics, or network synchronization. Saves are not assessments or evidence of mastery. The feature remains for synthetic testing only, and is not approval for real child-data collection.

## Storage Boundary

- One bounded record per known activity, under `xander-deane.activity-progress.v1.` in localStorage.
- `schemas/activity-progress.schema.json` defines the format. Runtime validation additionally checks IDs, array sizes, sequence states, deck multiplicities, and indices against authored content.
- Completion is recomputed using the current answer keys. Free-form feedback and client-provided completion flags are never restored.
- A content key includes the complete current activity kind and rounds. Changed content or an unsupported format starts that activity fresh.
- Invalid JSON, unknown fields, and oversized records are discarded without blocking play. Storage failures retain progress in memory for the current page and show a temporary-progress warning.
- Clear saved progress asks for confirmation and removes only known library keys. Other lessons and browser data are untouched. Failed deletion is reported rather than described as successful.

## Limits

Progress is shared by everyone using this browser profile; there is no multi-learner separation. Different ports, devices, browsers, and private sessions have separate storage. Browser data removal loses progress. Simultaneous tabs use last-write-wins per activity; no cross-tab merge is promised. No automatic expiry is implemented for this synthetic prototype. Real-data release requires retention, consent, shared-device, and parent-control review.

## Verification

`test/activity-progress.test.js` covers contracts, all activity families, invalid/stale saves, and storage failures. `release-e2e/activity-progress.spec.js` checks refresh, game switching, resume, reset, deletion, and fallback through the isolated public artifact.
