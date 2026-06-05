# Identity and Learner Access Base Layer

Consent records are only meaningful when the product knows who is allowed to grant or revoke them. This layer adds a small, provider-neutral identity/access model before production authentication is introduced.

## Contracts

| Contract | Purpose |
| --- | --- |
| `Account` | Represents a guardian, educator, operator, or learner identity independent of auth provider. |
| `LearnerAccountLink` | Connects an account to a learner with relationship, status, expiration, and learner-scoped permissions. |

## Runtime behavior

`src/app/identity-access.js` provides dependency-free helpers to:

1. create immutable accounts and learner-account links;
2. check whether an account can view progress, manage sessions, manage vouchers, export/delete data, or review safety for a learner;
3. enforce that consent can only be granted by an authorized account linked to the learner;
4. summarize learner access for future guardian/educator dashboards and service guards.

## Production guidance

Before storing real learner data, the production API should require:

1. authenticated account identity from a trusted provider;
2. an active `LearnerAccountLink` for the target learner;
3. permission checks at every session, progress, voucher, export/delete, and safety endpoint;
4. consent ownership checks before accepting `ConsentRecord` changes;
5. audit logging for link creation, permission changes, consent grants, and revocations.

This scaffold is intentionally provider-neutral. A later auth adapter can map OAuth, school SSO, passwordless guardian login, or marketplace accounts into these contracts.
