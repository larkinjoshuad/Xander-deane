# Website, App Store, and Google Play Release Plan

Prepared September 18, 2026. **Owner decision: international launch from the start.** Exact countries, languages, and commercial model remain undecided; other planning assumptions are proposals. This document accompanies `docs/audits/2026-09-18-release-audit.md` and is not legal advice or an app-store approval guarantee.

## Recommended First Release

Build one excellent, privacy-minimizing learning-play product for homeschool families before activating the wider platform.

- Proposed audience: caregiver-led toddler play for ages 2-3, plus clearly separated early-learning practice. Define exact age/skill bands with an educator before publishing; do not promise all-age or complete K-12 coverage.
- Market: international from day one, using an explicitly approved country list across the website and stores. Proposed starting shortlist for assessment: US, UK, Canada, Australia, New Zealand, and selected EU/EEA countries. This is not yet an approved distribution list. A public website can be accessed outside selected store territories and needs its own reviewed access/availability policy.
- Proposed business model: free, account-free initial release. Defer subscriptions, real vouchers, and payment collection. A paid launch requires a separate commercial and store-billing workstream.
- No ads, social features, child messaging, tracking SDKs, photos, microphone recording, push campaigns, or live AI in v1.
- Reviewed static content and prerecorded Shanon narration. Optional sound, transcripts, reduced motion, no time pressure, and understandable stopping points.
- Anonymous local practice slots only if family evidence is part of v1. No names, birthdays, email, or profiling needed to play. A local slot is a convenience, not verified identity or a secure access boundary.
- Never infer actual children's data are synthetic because a schema field says so. Keep development synthetic-only until privacy, legal, safety, and pilot gates explicitly approve real use.

## Architecture Decision

Reuse the existing plain JavaScript learning logic and touch UI. First produce an isolated production web artifact with only approved routes, browser modules, reviewed content, and assets. Do not deploy the repository-root server.

Use that artifact for an HTTPS website and evaluate **Capacitor** for iOS and Android packages. It supports existing web code with native integration, so a complete React Native/Flutter rewrite is not justified by the current requirements. This is an engineering recommendation, not a guarantee that wrapping the present prototype will pass review. [Capacitor documentation](https://capacitorjs.com/docs)

For native apps, bundle the core games and audio so they work on first launch without a network. Implement proper safe areas, Android back navigation, audio interruption/background handling, app lifecycle restoration, local-storage migrations, and accessible controls. Avoid arbitrary remote navigation and minimize native bridge/plugins. Audit plugin permissions and SDK data flows. No remotely configured development API endpoints.

For the website, define an explicit offline cache/update policy if installable offline use is promised. Require versioned assets, cache migration, recovery from partial downloads, and rollback. Do not silently serve incompatible combinations of content and application code.

iOS signing/build/test requires access to a supported macOS/Xcode environment, Apple developer enrollment, and physical Apple devices. Android requires its signed build pipeline and physical test devices. These capabilities have not been verified on this Windows workspace.

### Trust Boundaries

| Boundary | v1 Control and Verification |
| --- | --- |
| Child device to published assets | HTTPS website or signed bundled app; no secrets or privileged endpoints in assets; probe final build, not source checkout |
| Local storage to runtime | Treat records as untrusted; schema/version validation, bounded history, corruption recovery, explicit reset; local UI gate is not authentication |
| Child area to caregiver actions | Intentional adult gate for external/sensitive actions; no compulsory accounts or purchases; verify links cannot bypass the gate |
| App to OS/plugins/network | Minimal native permissions; approved destination list; inspect release network traffic and SDK behavior, including offline and background states |
| Publisher to content/voice | Versioned reviewed content, rights evidence, integrity checks; no live generated child output |
| Developer to distribution | MFA, least-privilege release roles, protected signing keys and branches, reproducible artifact, reviewed release and rollback |
| Family to support/hosting vendors | Minimal support fields/logs, retention and access controls, no automatic child screenshots or activity payloads |

Threats to check include accidental exposure of development services, crafted URLs, malicious/corrupt stored data, unauthorized vendor disclosure, compromised dependencies/build accounts, interrupted updates, and accidental data loss. No public backend is needed for the proposed v1; if one is added, this threat model and schedule must be revised before deployment.

## Phased Delivery

Durations below are rough planning ranges, not delivery promises. They assume one experienced engineer with dedicated QA time and part-time design, educator, and privacy counsel support. Scope, account setup, family recruitment, legal review, and store review can extend the calendar. Gate completion, not a date, determines release.

| Phase | Work | Accountable Role | Rough Range | Exit Gate |
| --- | --- | --- | --- | --- |
| 0. Decide | Confirm age bands, international country/language list, free/paid, public name, owner entity, support contact, data promise | Product owner + counsel | 1-2+ weeks | Written release scope, per-country obligations, and threat/data-flow model approved |
| 1. Contain | Isolated build, no live AI/diagnostics, loopback dev tools, supported CI, security headers, dependency/secret gates | Engineering | 1-2 weeks | Release-artifact probes show forbidden routes unavailable and no unapproved network calls |
| 2. Correct | R04-R07 and R09-R12; recovery, focus, phone menu, balanced questions, honest evidence, unified audio/navigation and locale architecture | Engineering + QA + educator | 2-4+ weeks | Clean target-browser suite and reviewed, coherent end-to-end family journey in each shipping locale |
| 3. Package | Offline-capable web build and native spike, then signed iOS/Android builds, permissions and lifecycle work | Engineering + QA | 2-4 weeks | Core games pass airplane-mode cold start and physical-device checks |
| 4. Validate | Adult synthetic usability first; then legally approved, consented caregiver/child pilot; accessibility/security review | Product + research + QA + counsel | 2-4 weeks | Quality gates below passed; serious findings resolved |
| 5. Release | Closed web beta, TestFlight, Play testing, store submissions, monitored staged launch | Release owner + support | 1-3+ weeks | Signed checklist and rollback/support readiness |

Some phases can overlap after dependencies are satisfied. International legal review, translated content/audio, regional accessibility and consumer requirements, and support coverage add work per market and are not bounded until the country/language list is approved. A broader age range, cloud accounts, subscriptions, or live AI also materially changes the estimate. Agree staffing and scope before setting a launch date.

## First Implementation Tickets

Progress: the first technical containment slice is implemented in
`docs/public-build-boundary.md`: allowlisted bundled artifact, local hardened
preview, synthetic default tutor, loopback development launchers, and artifact
tests. This is not a completed public-release gate. Reviewed content packaging,
production host header verification, independent review, and the remaining
product/privacy/store work still apply.

1. **Release boundary (R01-R03/R08):** build only approved child/parent routes and their import dependencies; move learning fixtures into a reviewed public-content package; exclude prototype, provider, credentials, database, audit, and development content. Test attempted direct access and arbitrary tutorApi parameters against the built artifact. Acceptance: deterministic mode only, no provider SDK in the browser artifact, no runtime provider destination override.
2. **Recovery (R06):** implement bounded, versioned local storage and an in-memory fallback. Acceptance: quota/denied/corrupt/old-version states remain playable and honest about save status; caregiver reset affects only selected app data.
3. **Trustworthy practice (R04/R05/R10):** correct distractors; define distinct attempts; remove unsupported mastery assertions; connect shipped activities to local family evidence or explicitly ship stateless play. Acceptance: repeated Check does not create new evidence and the parent sees only what actually occurred.
4. **Interaction quality (R07/R09/R12):** consistent optional voice controls, correct menu dismissal, stable focus, cancellation, touch targets, and captions. Acceptance: same complete journey works with touch, keyboard, VoiceOver/TalkBack, reduced motion, and no sound.
5. **Content publishing (R11/R12):** schema-backed objective, age/skill band, prerequisites, content version, educator decision, and audio/asset approval. Acceptance: unreviewed content cannot enter a release build; all shipped answers and recordings independently checked.
6. **Release CI (R07/R13):** supported Node LTS, pinned browser/tool versions, actual WebKit testing, portable gesture tests, required SQLite checks if backend work remains in scope, scanning and build-artifact smoke tests. Acceptance: clean checkout produces the tested artifact with zero unexplained skips/failures.

Each ticket should be a focused PR with regression tests. Preserve existing voice work separately; do not fold unrelated prototype refactors into the audit follow-up.

## Privacy and Child Safety

Map the actual release data flows: local progress, hosting/CDN IP logs, support messages, crash reports, update checks, OS speech services, native SDKs, and store transactions if later added. "No login" does not establish "no personal data." COPPA can cover persistent identifiers, and narrow internal-operations exceptions require careful evaluation. Obtain children's-privacy counsel review of notices, consent applicability, vendors, retention, deletion, and the amended Rule before public use. [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)

Create an adult-facing, accurate privacy notice and reachable support/privacy contact. Set explicit log retention, restrict operator access, redact payloads, and keep child activity out of URLs and support attachments. Do not deploy behavior analytics or a crash SDK until its full data collection is reviewed. Security monitoring can start with aggregate service health and synthetic probes.

A parental gate helps separate adult actions; it does not replace verifiable parental consent. Keep external links, purchase/restore flows if later added, and sensitive adult actions behind the appropriate gate. Make local privacy information accessible without an external redirect. Do not collect government identity documents merely to build a gate.

Keep pilot notes anonymous and minimal; obtain separate consent before any recording, and do not add recordings to the app. Use adults and synthetic scenarios until a reviewed protocol permits real child participation.

International distribution requires jurisdiction-specific review, not just translated copy. For example, the UK Children's Code can apply to services likely to be accessed by under-18s and emphasizes high privacy defaults. Do not assume a homeschool product is automatically exempt from children's privacy obligations or automatically governed by school-record rules. [ICO guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code)

## International Day-One Workstream

International-first does not mean claiming readiness for every country. Before submission, approve a country/locale matrix with a named legal reviewer, supported ages, notices, data flows, retention, subprocessors, required registrations/representatives, rights contact, support language, content/voice approval, and store availability. Do not enable an unreviewed market automatically when adding a translation.

| Candidate Market | Review Required Before Availability |
| --- | --- |
| US | COPPA and applicable state children's/privacy/consumer rules; public child-directed positioning; hosting/support data flows |
| UK | UK GDPR, Children's Code applicability, age-appropriate high-privacy defaults, risk assessment and any required local representation |
| Selected EU/EEA countries | GDPR lawful bases and child safeguards, country-specific consent ages where Article 8 applies, rights handling, DPIA/representative applicability, cross-border data transfers, local notices and accessibility/consumer obligations |
| Canada | Federal/provincial privacy applicability, meaningful consent and child capacity; separately review Quebec privacy/language requirements rather than treating Canada as a single uniform locale |
| Australia | Privacy Act/APP applicability and status of the evolving Children's Online Privacy Code at the actual release date; do not treat draft provisions as already-effective law |
| New Zealand | Privacy Act child-specific care, rights handling, notices, and overseas disclosure obligations |
| Other countries | Add only after the same legal, language, content, support, and store review; no implied worldwide clearance |

When GDPR Article 8 applies to consent-based online services offered directly to children, the national threshold ranges from 13 to 16. This is not a universal instruction to gather every child's birthday or the only possible lawful basis. Have counsel determine applicability and choose the least intrusive design. [European Commission child safeguards](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en)

Inventory processor locations and remote access, not only where a database is hosted. Applicable transfers outside the EEA require an appropriate legal mechanism and safeguards; choosing a regional CDN alone does not resolve this. [European Commission transfer guidance](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/rules-international-data-transfers_en)

Canada's regulator generally expects a parent/guardian's consent where a child cannot provide meaningful consent, normally including under-13s outside exceptional circumstances. Australia's regulator is developing its child-specific online code. New Zealand's regulator emphasizes extra care with children's information. These distinctions require a country matrix, not a single global consent checkbox. [Canada OPC](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/), [Australia OAIC](https://www.oaic.gov.au/privacy/privacy-registers/privacy-codes/childrens-online-privacy-code), [New Zealand OPC](https://www.privacy.org.nz/focus-areas/children-and-young-people-policy-project/)

Proposed localization sequence: English first where appropriate and legally reviewed; add other countries/languages only with reviewed interface, notices, support, curriculum vocabulary, and recordings. English content is not suitable for every market simply because a store allows distribution. Exact launch languages remain an owner decision.

Before localization, move user-visible strings out of game logic, introduce stable prompt/audio IDs rather than matching English text, and support locale-aware numbers, dates, pluralization, text expansion and right-to-left layout where needed. Rhymes and phonics need native-speaker educational re-authoring, not literal translation. Regional English pronunciations and spelling should be reviewed too; Shanon's current samples are not validated for every accent/locale.

Test one complete representative journey per launch locale and platform, including privacy/support and error states. Recruit the approved pilot across initial markets; scale the sample beyond the initial formative group when multiple languages or substantially different curricula ship. Do not claim a country curriculum alignment without that mapping and review.

## Channel Requirements

### Website

- Choose a domain, verify ownership and support email, and separate production from preview/development.
- Deploy only the release artifact over HTTPS. Set an enforced, tested CSP, HSTS when ready, frame restrictions, nosniff, referrer policy, and camera/microphone/location permissions restrictions consistent with the no-recording product.
- Test root/deep links, refresh, 404s, cache updates, offline behavior, bad connections, invalid storage, and rollback. The existing inline redirect must be compatible with the CSP or replaced in the build.
- Publish privacy/support/accessibility information. If accounts are later added, add authenticated export/deletion and verified ownership flows before collecting records.
- Log minimally, document vendor settings and retention, and verify traffic from the built version. Do not advertise offline availability until tested.

### Apple App Store

- Establish the developer entity, bundle identifier, signing ownership, recovery access, and App Store Connect roles; use MFA and least privilege.
- Target the actual audience/category. Kids Category rules constrain external links/purchases and third-party data/analytics. Apple also requires meaningful app utility beyond a repackaged website. Deliver offline games and platform-quality interaction; a wrapper is not an approval guarantee. [App Review Guidelines, 1.3 and 4.2](https://developer.apple.com/app-store/review/guidelines/)
- Complete current age-rating questions, App Privacy answers, privacy/support URLs, screenshots on representative devices, content/voice rights evidence, and reviewer notes. Include required privacy manifests/reason declarations for the chosen native APIs and SDKs. [Privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- As checked for this plan, iOS/iPadOS submissions must use the iOS/iPadOS 26 SDK or later. Recheck the submission toolchain at release time; target SDK requirements do not necessarily set the app's minimum supported OS. [Apple SDK requirements](https://developer.apple.com/news/?id=ueeok6yw)
- Run TestFlight with caregivers, complete iPhone/iPad accessibility and lifecycle checks, then submit with a stable build and precise review instructions. Do not ship debug features or credentials.

### Google Play

- Establish the developer account/entity, app ID, signing-key ownership/backups, console roles, and current verification requirements. Produce a signed Android App Bundle and inspect final permissions.
- Declare actual target ages, Data safety, privacy policy, and content rating. Children-targeted apps must follow Families requirements, including SDK/data restrictions. Avoid advertising/device identifiers and unnecessary permissions in v1. [Families policy](https://support.google.com/googleplay/android-developer/answer/9893335)
- As checked for this plan, new ordinary Android apps must target Android 16/API 36 or higher from August 31, 2026. Recheck before submission. [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- Start internal testing and pre-launch reports; test phone/tablet, Android back, audio interruptions, offline use, low-memory recovery, and accessibility.
- For personal developer accounts created after November 13, 2023, production access requires a closed test with at least 12 testers opted in continuously for 14 days, followed by an application for access. This is conditional on account type, not a universal requirement for every developer. [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- If app accounts are introduced later, implement the required in-app deletion path and outside-app web request resource. [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

### Monetization Later

Do not enable the existing voucher/payment scaffolding. First decide entitlement ownership, refund/restore behavior, sibling access, receipts, support, tax responsibilities, and region-specific store billing rules. Review the then-current policies for each storefront; do not assume web checkout bypasses native digital-goods rules or that this education app qualifies as a reader app. This work is outside the proposed free v1 scope.

## Definition of an Excellent First Release

These are proposed acceptance targets, not measurements already achieved.

| Area | Release Acceptance |
| --- | --- |
| Content | 100% of shipped tasks and answers reviewed; age/skill map complete; no known shortcut/ambiguity defects; no unsupported learning claims |
| Fun | In an approved formative pilot of 8-12 diverse caregiver-child pairs, record comprehension, voluntary exploration/replay, frustration, and caregiver usefulness without engagement-pressure metrics; zero repeated critical confusion; revise and retest weak activities |
| Touch | Representative users can find, start, act, recover, and leave each game; large separated targets; drag always has a non-drag equivalent; no unexplained or purely decorative interactive-looking objects |
| Accessibility | No serious/critical automated violations in shipped flows; manual keyboard, VoiceOver, TalkBack, text enlargement, contrast, reduced motion, and audio-off review completed |
| Reliability | All required release tests pass; no skipped tests hiding required coverage; storage denial/corruption, suspension, offline cold start, interrupted update, and recovery verified |
| Performance | Set a reference low/mid-range phone and network; target interactive cold web start within 3 seconds, prompt input feedback within 100 ms, and 60 fps during simple drags; measure sustained play, memory, audio size and battery before sign-off |
| Security | No unresolved critical/high applicable findings; independent review of built artifact and any backend; no secrets/debug endpoints; only approved origins/permissions; documented residual risks and owners |
| Privacy | Actual device/network behavior agrees with published notice and store declarations; vendor/retention review complete; no unapproved child data collection |
| Voice | Every shipping clip listened to on target devices, correct pronunciation and prompt binding, consistent comfortable loudness, optional playback with stop/replay and captions |
| Operations | Support/privacy contacts tested, release owner named, dependency maintenance cadence agreed, rollback drilled, and incident response exercised with synthetic scenarios |

Pilot participation must represent the target age bands and accessibility needs. Eight to twelve families support formative usability discovery, not scientific proof of learning outcomes or universal acceptance.

For a later native security assessment, use the relevant OWASP MASVS storage, network, platform, code, and privacy controls to structure independent checks; this plan does not claim conformance. [OWASP MASVS](https://mas.owasp.org/MASVS/)

## Launch and Maintenance

1. Approve the exact versioned content, audio manifest, privacy notice, support flow, and release artifact together.
2. Use a private/small web beta and native internal tracks first; admit real families only after the privacy/pilot approval gate.
3. Resolve crashes, confusion, and inaccurate feedback before adding more content. Repeat physical-device and accessibility checks on the final signed candidates.
4. Obtain product, engineering/QA, educator, and privacy/security sign-off. Retain test evidence, asset rights, dependency inventory, and store declaration snapshots.
5. Publish the website with rollback available; submit native releases through their review/testing tracks. Do not promise simultaneous availability or a fixed approval date.
6. Use controlled rollout where the distribution channel supports it. Monitor aggregate availability, delivery errors, and parent-reported issues without creating new child-tracking flows.
7. Revert or halt distribution for a serious privacy/safety incident; ship fixes and assess notification obligations with counsel. Test backups only if persistent services are actually introduced.
8. Review dependencies, policies, support requests, content defects, and accessibility regularly. Re-audit every addition of an SDK, new data field, account feature, purchase flow, or AI capability.

## Decisions Still Needed

The requested English-language commercial shortlist is recorded in
`english-market-shortlist.md` (September 20, 2026). It recommends 12 countries,
with six prioritized for preparation; it is not owner approval of launch
territories, permission to accept payments, or local legal clearance.

- Final product name, legal publisher, domain, support owner, and developer-account status.
- Exact age bands, initial countries and languages within the confirmed international-first strategy; local privacy, accessibility, support and content obligations.
- Free initial release versus paid launch; no payment implementation is authorized by this plan.
- Stateless play versus anonymous local family practice records; whether cross-device sync is deliberately deferred.
- Budget and named people for educator review, privacy counsel, independent security, physical devices/macOS build access, and caregiver usability research.

Next action recommended: implement the safe production build boundary before further game expansion or any store packaging.
