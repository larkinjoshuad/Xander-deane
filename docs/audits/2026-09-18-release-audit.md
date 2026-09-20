# Public Release Readiness Audit

Date: September 18, 2026 (America/Los_Angeles; probes recorded September 19 UTC).
Scope: working tree on `codex/expanded-activity-library`, HEAD `7fa9c45`, including the uncommitted Shanon narration changes. Inspected the actual repository, not prior PR diffs. No production fixes, deployments, real learner data, or live model calls were made during this audit. Provider tests used a stub.

## Decision

**NO-GO for a public child-facing release today.** This is a useful, well-tested prototype, not yet a production learning product. Passing contracts and tests do not establish child safety, educational effectiveness, regulatory compliance, or store acceptance.

Recommended direction: a bounded, caregiver-led, offline-capable first release, with reviewed authored content and prerecorded narration. Keep accounts, live AI, payments, vouchers, tracking, and cloud learner records out of that release. See `docs/public-release-plan.md` for the sequence and acceptance gates.

The owner selected international launch from the start. The release plan therefore requires an explicit country/language approval matrix; it does not assume US-only or worldwide legal readiness.

No evidence of an active compromise was found. That is not a security certification. High-priority security findings below concern development surfaces that must not be deployed publicly.

## Findings, Ordered by Priority

### R01 - P1: Live tutor endpoint is unauthenticated and can be exposed beyond localhost

Evidence: `scripts/tutor-server.js:18` calls `server.listen(port)` without a host. `src/app/tutor-api-server.js:26` defaults CORS to `*`; the POST handler at line 73 has no authentication, rate limiter, concurrency budget, or caller authorization. `src/app/model-gateway-claude.js:216` enables the provider when an API key exists.

Reproduced: a local HTTP request without credentials, with an unrelated Origin, returned 200, wildcard CORS, and invoked a stub gateway. No real provider request was made. Network reachability still depends on the host firewall and deployment; this does not prove Internet exposure today.

Impact: publishing this server with a key could allow unauthorized model use, costs, and unreviewed output. A console message advertising 127.0.0.1 does not restrict binding.

Release gate: exclude the endpoint from the public artifact; bind development servers to loopback. Any later production service requires real authorization, strict input validation, resource limits, redacted errors, and explicit server-side feature approval. CORS alone is not authentication.

### R02 - P1: Provider calls occur before consent enforcement

Evidence: `src/app/model-gateway-claude.js:136` validates context shape, then calls `messages.parse` at line 147; `finalizeTutorResponse` runs only afterward at line 173. Shape validation does not enforce `mayCallAi`. The API stamps client-submitted sessions as synthetic and sets `mayCallAi: true` (`src/app/tutor-api-server.js:46`). Problem text and evaluator diagnostics are interpolated into the provider prompt.

Reproduced: a context with no consent and `mayCallAi: false` still invoked the stub provider once. A synthetic sentinel inserted into the problem prompt appeared in the provider payload. Labeling input synthetic does not prove that its contents are synthetic or free of personal information.

Impact: blocking a response after generation does not prevent unauthorized data disclosure to the provider. The offline human-review system is not a gate on this path.

The shared safety evaluator also consumes caller-supplied detected categories/triggers; the API supplies no detector results. It is a policy evaluator, not evidence of an integrated content-moderation system. Likewise, `retainedPrompt: false` is application metadata, not enforcement of a provider's retention policy. Review these claims before any future AI release.

Release gate: no live adapter in v1. Before any later activation, deny before all provider calls; derive trusted content and permissions server-side; verify consent revocation, scope, provenance, retention agreements, and no-call tests for denied states.

### R03 - P1: Diagnostic shell can send session data to a query-selected destination

Evidence: `app/tutor-client.js:16` accepts `tutorApi` from the URL and persists it; line 51 posts the session to that address. `app/main.js:158` uses this helper. No origin allowlist is applied. `/app/prototype.html` is currently served by the local preview.

Impact: a crafted diagnostic-page link could direct session payloads to an attacker-controlled CORS-enabled endpoint, and the preference persists. This is not an observed compromise, and `learn.html` does not use this client. Current records are demo data; the danger grows if real records are introduced.

Release gate: exclude the diagnostic shell/client from production; never accept production data destinations from URL parameters or local storage. Tests must prove those routes are unavailable in the release artifact.

### R04 - P1: Arithmetic distractors allow a non-mathematical shortcut

Evidence: `src/app/activity-library.js:10`, line 12, and line 14 choose distractors above the answer.

Reproduced: **72 of 72** addition, subtraction, and multiplication questions have the smallest option as the correct answer. Shuffling button position does not fix value bias.

Impact: children can succeed without using the intended skill, undermining learning and future reporting.

Release gate: reviewed misconception-based distractors, balanced relative answer positions, independent answer checks, and tests for systematic shortcuts. Do not simply add random wrong numbers without checking age fit and ambiguity.

### R05 - P1: Repeated checks can manufacture mastery

Evidence: `app/learn.js:78` processes every Check; `src/app/progress-model.js:108` increments evidence on every evaluation. Lines 309 and 315 derive mastery/confidence from counts.

Reproduced: five checks of the unchanged correct language answer produce `mastered`, `high` confidence, with one distinct problem. The family view already cautions against subject-mastery claims, which is good; the underlying record still carries misleading mastery values and the diagnostic view can display them.

Release gate: count distinct meaningful attempts, make duplicate submissions idempotent, distinguish aided/unaided work, and separate practice evidence from validated mastery. New-problem transfer and educator-approved criteria must precede mastery claims.

### R06 - P1: Storage failure can prevent the main learning screen from working

Evidence: `src/app/session-persistence.js:86` writes without recovery; line 92 parses stored JSON without corruption handling. Snapshot/event history is unbounded. `app/learn.js` persists before rendering.

Reproduced: simulated quota failure displays "Something went wrong loading the lesson" instead of a playable activity. The corruption and long-session growth risks were identified from code, not stress-tested to exhaustion.

Release gate: recover to a usable in-memory mode, quarantine corrupt data, cap history, version migrations, and clearly distinguish saved from unsaved work. Test blocked storage, exhausted quota, malformed records, interruption, and upgrades. A retry/reset must not silently destroy unrelated data.

### R07 - P1: Release verification has cross-browser gaps and a failing phone flow

Evidence: `playwright.config.js:34` uses the iPad device preset in a project named `tablet-chromium`; the preset selects WebKit. `e2e/visual-sorting.spec.js:14`, `e2e/toddler-matching.spec.js:14`, and `e2e/play-together.spec.js:16` call Chromium-only CDP APIs. CI runs every project.

Observed: local desktop/phone run finished **77 passed, 1 failed**. The failure is `e2e/recorded-voice.spec.js:20`: the open menu intercepts the Next-button click on a phone. Audio started successfully; this is not evidence that Shanon audio decoding failed. The flow needs intentional menu dismissal and a matching test, or an explicitly tested close-menu step.

WebKit was not installed locally, so its runtime failures were not executed. Configuration/API incompatibility is confirmed by source. Six SQLite tests skipped locally. Physical iPhone/iPad/Android behavior remains unknown.

Release gate: accurately named browser projects, portable interaction tests, no unexplained skips, and clean browser plus physical-device release runs.

### R08 - P1: No isolated, hardened production artifact exists

Evidence: `package.json` starts Python's repository-root development server; no production build/deployment or native project configuration was found. Local responses have no CSP, nosniff, or frame protection headers. `/package.json` and `/app/prototype.html` return 200. `/.git/HEAD` returned 404; no Git or credential exposure is claimed.

Additional backend concerns: `src/app/session-http-api.js:332` buffers the request body without an application byte limit, before authentication; `src/app/session-api-server.js:87` checks the token only when configured. The session CLI binds loopback but defaults to `prototype-dev-token`. These are development adapters, not production identity.

Release gate: a reproducible allowlisted browser artifact and a separate development environment. Exclude server modules, demo identity/consent fixtures, diagnostics, `.git`, `.data`, environment files, and test artifacts. Approved learning-content assets and required browser modules must remain available through a build, not by exposing the repository. Apply and test HTTPS, compatible CSP, frame restrictions, nosniff, referrer and permissions policies. Do not publish the prototype APIs.

### R09 - P2: Keyboard focus is lost after answering in the library

Evidence: `app/library.js:81` replaces the board, including the focused button, after interactions.

Reproduced: focus a choice, press Enter; `document.activeElement` becomes BODY. Existing keyboard coverage asserts feedback but not post-answer focus.

Release gate: predictable focus restoration for choice, sequence, and memory interactions; no forced jump during pointer use. Verify full keyboard journeys and screen-reader announcements, not just automated accessibility scans.

### R10 - P2: Expanded activities are disconnected from family progress

Evidence: `app/library.js` keeps round state in memory; reload from question two returns to "1 of 8". `app/parent-dashboard.js:4` lists only the original math, language, and science demos. Toddler matching and Play Together also have no saved progress.

Impact: a family may do most of its work in the library and see no corresponding family history. No shared-device sibling separation or mature data-reset UX exists across these surfaces.

Release gate: either explicitly release stateless play with no broader progress promise, or implement bounded local practice evidence with caregiver-selected anonymous slots and complete coverage. Cloud accounts are not required for v1.

### R11 - P2: Content volume exceeds its review and progression structure

Evidence: 249 library problems, 25 sets, and only three interaction types. `schemas/activity-set.schema.json` has no age band, learning objective, prerequisite, review status, or content version beyond contract version. Toddler Word Match includes reading-dependent choices. That can support caregiver conversation but is not proof of independent reading suitability for ages 2-3.

Impact: counts can overstate educational breadth. The current app does not substantiate a full homeschool curriculum or all-age offering.

Release gate: item-level educator review, age/skill metadata, a content map, meaningful varied tasks, developmentally appropriate co-play, and usable hint/feedback coverage. Keep toddler tasks distinct from early-reader assessments. Do not market developmental or mastery outcomes without evidence.

### R12 - P2: Natural narration rollout and audio assurance are incomplete

Evidence: `app/recorded-voice.js:1` maps eight rhyme prompts. Other library prompts and Play Together still use browser speech; toddler matching lacks equivalent narration. Shanon's provenance says individual clips are pending listening review. Eight bundled clips total 498,203 bytes.

Impact: inconsistent voice across activities, discoverability hidden in a menu, uncertain articulation on target devices, and no demonstrated commercial redistribution entitlement in the repository. This is a licensing-evidence gap, not a finding that the license prohibits use.

Release gate: confirm usage rights, listen to every shipping clip, normalize loudness, retain transcript/voice/content version/hash/reviewer, test end/error/interruption states, and use a consistent easy-to-reach optional audio control. Audit OS/browser speech services before making an app-wide "no external data" claim.

### R13 - P2: CI uses an unsupported Node release

Evidence: `.github/workflows/quality.yml:21` and line 59 select Node 20. Local audit used Node v24.13.0. Node's official release schedule marks v20 EOL; therefore local success is not proof of parity with CI. [Node release schedule](https://github.com/nodejs/Release)

Release gate: pin a supported LTS toolchain, align CI and developer environments, install the chosen browser/SQLite prerequisites, add dependency and secret scanning, least-privilege workflow permissions, and preserve actual test reports. Do not equate an npm advisory scan with a complete supply-chain review.

## Release Gaps That Are Not Yet Implemented Features

- No signed iOS/Android applications, native signing pipeline, store submissions, privacy manifests, or production update policy were found.
- No production privacy notice, support/contact flow, age/audience declarations, vendor register, or documented public-release legal approval was found. Existing regulatory documents are assumptions and safeguards, not compliance sign-off.
- No production account system, verified parental consent workflow, cloud deletion/export lifecycle, or billing integration exists. These are avoidable in v1, not reasons to build them all before a small release.
- No validated offline installation/update experience. Static local assets do not automatically make the website available after a cold offline launch.
- No production observability, availability monitoring, rollback drill, incident owner, abuse contact, or measured performance/load budget has been verified.
- No educator/family pilot evidence establishing "fun," age suitability, or learning transfer. Repeated buttons and attractive pictures do not establish these outcomes.

## What Is Already Working Well

- Contract-first models, fixtures, data inventory, and explicit synthetic-only documentation give the work a coherent foundation.
- The default touch-learning screen uses deterministic feedback and does not import the live tutor client.
- Examined renderers generally use DOM creation/textContent; the source scan found no innerHTML/eval usage in app/runtime code. This is a positive observation, not exhaustive XSS assurance.
- Tap and keyboard alternatives complement dragging; reduced motion and optional sound have coverage.
- Play Together's actual objects and simple actions fit the desired minimalist interaction direction better than the diagnostic dashboard.
- Session authorization, version conflicts, retention, audit outbox, and review adjudication have meaningful prototype tests. They are reusable engineering work, but not deployed production controls.
- Shanon clips are bundled locally; sampled ordinary child routes made no external-origin requests in the isolated browser probe. Background OS speech, hosting logs, future SDKs, and all possible routes were not covered by that observation.

## Evidence and Verification

| Check | Result | Limitation |
| --- | --- | --- |
| `node --test` | 222 passed, 6 skipped, 0 failed; 228 total | SQLite skips; local Node 24, CI Node 20 |
| Fixture validation | Passed | Valid structure is not educational accuracy |
| Data inventory validation | Passed; 33 schemas covered | Does not discover every browser/host/SDK data flow |
| API fixture replay | 9 passed | Prototype contracts, not a deployed service penetration test |
| Device preset/source QA | Passed | Not physical-device certification |
| Desktop + phone Chromium E2E | 77 passed, 1 failed; 78 total | Open-menu phone narration flow; no Safari run |
| npm audit | 0 reported advisories across 19 dependency entries | Point-in-time advisory database, not exploit proof |
| Audit probes | Completed | Synthetic stubs and isolated local browser only |
| Visual inspection | Phone library, Play Together, and family overview screenshots inspected | No representative-family usability study |

Reproduce the targeted probes with `node scripts/audit-release-readiness.js` while the existing local preview is running. They use a temporary loopback stub server, synthetic fixtures, and a fresh browser context; they do not change the user's browser state. Outputs are generated under ignored `test-results/release-audit/`. A snapshot of key results is recorded in `docs/audits/2026-09-18-observations.json`.

No exhaustive secret-history scan, fuzzing, penetration test, production infrastructure assessment, load/battery benchmark, independent legal review, commercial asset-license verification, physical assistive-technology test, or store-account inspection was completed. Do those against the actual release candidate. Do not label this audit as certification.

## Product Assessment

The touchscreen shell is restrained and readable in the sampled phone views; Play Together gives a direct visual action with little clutter. Preserve that. The library is still mostly text-led practice with an adult-style subject/activity selector, not a cohesive child-led play experience. Parent reporting uses a noticeably different visual language. Standardize navigation, replay/stop behavior, sound access, help, and return-to-caregiver without adding dashboard clutter.

Make fun a tested quality gate: children should understand the action, receive meaningful feedback, recover from mistakes without shame, and choose to explore or replay without pressure. Prefer causal manipulation, discovery, short stories, and co-play over points, timers, streak loss, or compulsory repetition. Age appropriateness and fun require supervised, consented research after the current real-data boundary is formally cleared; use adults with synthetic scenarios until then.

The immediate next implementation should be **R01-R03/R08: an isolated safe release build and fail-closed development boundary**, followed by storage resilience, honest evidence, content shortcuts, and real cross-browser verification. Adding more question count before those changes would increase review burden without resolving release risk.
