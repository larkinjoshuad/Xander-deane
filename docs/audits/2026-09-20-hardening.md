# Production Hardening Checkpoint

Date: September 20, 2026. Scope: the actual repository and isolated synthetic
public artifact. This supplements, rather than rewrites, the September 18 audit.

## Release Decision

**Still NO-GO for unrestricted public child-facing release.** The engineering
changes below reduce concrete risks; they do not constitute educator approval,
privacy/legal clearance, independent security certification or store acceptance.
No public deployment, real child data, payments or live tutor AI was enabled.

## Changes Verified by Automated Tests

- Original lessons now continue in memory when browser storage is denied, full
  or unavailable. A visible status message explains that saving is unavailable.
- Browser records validate basic shape, session identity, supported contract and
  storage versions, exact lesson definition, and workspace placement consistency
  before restoration. Unsupported legacy browser records restart with a notice;
  this is not a lossless migration and does not affect server storage.
- Browser history keeps 200 recent events, 40 snapshots, and up to 50 indexed
  sessions. Total hint count is retained separately; incomplete event history is
  not treated as evidence of unaided success. Event IDs remain distinct through
  compaction and reload. An unreadable index is not overwritten.
- Repeated unchanged checks and duplicate evaluation submissions do not add
  practice evidence. Recent evidence is bounded to 200 entries. New updates are
  marked practice-only, with low confidence and no automatic mastery promotion.
  Previously generated aggregate counts are not retroactively validated or
  repaired, and a prototype mastery estimate remains a correctness ratio.
- The public browser matrix now includes Chromium desktop/phone and actual
  WebKit tablet emulation. Keyboard tests activate controls with the keyboard;
  portable tap tests separately cover choices, ordering, matching and co-play.
  Chromium's existing native-event drag/cancel tests remain enabled.
- CI has read-only repository permissions, job time limits and cancellation of
  superseded runs. Dependency advisory scanning is point-in-time evidence only.
- The English-market recommendation is recorded in
  `../english-market-shortlist.md`. No country has been approved for release.

Reproduce with `npm test`, `npm run validate:fixtures`,
`npm run validate:data-inventory`, `npm run test:public`, and `npm run test:e2e`.
Install the locked dependencies and both browser engines first. CI is the full
Linux/SQLite/browser reference; local SQLite prerequisites may be unavailable.

## Remaining Gates

| Gate | Outstanding work | Required participant |
| --- | --- | --- |
| Publisher and scope | Legal publisher, domain, support contact, age bands, explicit initial countries | Owner |
| Content release | Item-level age/objective/review metadata; independent answer and educational review; approved content package | Engineering + educator |
| Privacy and terms | Actual deployment data-flow inventory, local legal review, approved notices and consumer terms | Owner + qualified reviewers |
| Assets and narration | Documented redistribution rights and listening review for every shipping asset/clip; speech-service assessment | Owner + rights/audio reviewers |
| Device access | Physical iPhone/iPad/Android touch, audio, suspension and recovery; actual Safari | Device QA |
| Accessibility | Manual VoiceOver/TalkBack/keyboard/text scaling, not only automated scans | Accessibility reviewer |
| Offline and updates | Deliberate cache/update strategy, cold offline start, interrupted update and rollback verification | Engineering + QA |
| Hosting and operations | Chosen production host, verified HTTPS/headers, support/incident owner, monitoring and rollback drill | Owner + engineering |
| Security | Independent assessment of the final artifact/host; secret-history and supply-chain review | Security reviewer |
| Product evidence | Approved caregiver-led pilot, comprehension, age fit and fun without manipulative engagement | Educator + research lead |
| Stores | Native packaging/signing, developer accounts, privacy declarations, closed testing and review | Owner + platform QA |

The provider and development API findings are contained by exclusion from the
public build, not certified safe for future deployment. Family reporting still
covers the original lessons, not the full activity library. Sibling separation,
complete local data management and historical-progress migration remain product
work; do not promise those features in a release listing.
