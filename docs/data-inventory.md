# Learner Data Inventory

This inventory is the first executable governance gate after the regulatory assumptions document. It maps every registered contract to a data classification before real learner records, school records, voucher/ESA documents, payment credentials, or live child-facing AI transcripts can enter the system.

## Machine-Readable Inventory

The canonical inventory fixture is `examples/governance/base.data-inventory.json`. It validates against `schemas/data-inventory.schema.json` and is checked by `scripts/validate-data-inventory.js`.

Run it with:

```bash
npm run validate:data-inventory
```

The validator enforces that:

1. every schema in `schemas/index.json` has an inventory record;
2. every inventory record points at an existing schema path;
3. restricted or prohibited records cannot allow real data in prototype mode;
4. high-risk records have production requirements;
5. scoped records include consent or authority requirements.

## Classification Levels

| Classification | Meaning | Real-data posture |
| --- | --- | --- |
| `public_contract` | Public schema/catalog/policy metadata that can be reviewed without learner records. | May be real only when it does not identify learners or expose regulated records. |
| `synthetic_safe` | Low-risk prototype data suitable for fixtures and demos. | Synthetic by default; review before importing real operational data. |
| `restricted` | Data that may reveal learner work, device state, API state, or other context requiring controls. | Real data blocked until access, consent/authority, retention, export/delete, and audit are implemented. |
| `prohibited_until_review` | Child PII, education records, AI context/output, safety, identity, voucher, billing, or audit data. | Real data blocked until counsel/compliance review and executable acceptance tests pass. |

## Current Prototype Result

The current inventory covers all registered schemas. Only public contract metadata records can allow real data in prototype mode; learner profiles, session records, tutor context/output, safety incidents, voucher records, billing ledgers, and audit events remain synthetic or review-gated.

## Next Governance Step

The inventory now feeds session export packets through `src/app/data-rights.js` and `GET /sessions/:sessionId/export`, so exported session data includes the relevant classifications. Retention evaluation and deletion tombstones are enforced through `src/app/data-retention.js` and the access-controlled session service: active exports include retention disposition metadata, expired records are denied ordinary guardian export with a denied audit event, deletes return a tombstone packet with source version, actor, trace, reason, and retention status, and list/tombstone HTTP paths keep active records separate from deleted tombstones. The next governance step is adding explicit recovery policy and production database recovery drills. Each session API data path should be able to answer:

1. Which inventory record classifies this payload?
2. Which consent scopes or authority checks are required?
3. Which audit event is emitted?
4. Which retention, export, and deletion behavior applies?
5. Is this path still synthetic-only?
