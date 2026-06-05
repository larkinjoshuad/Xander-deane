# Build vs Buy Strategy

The contract-first architecture is the durable asset. Individual implementations are replaceable. That distinction lets the project remain valuable as a portfolio system while preserving the option to become a venture without shipping bespoke compliance infrastructure too early.

## Principle

Build reference implementations to learn and prove the contracts. Buy or integrate production commodity systems when real learners, real guardians, real payments, or real school records enter the product.

## Workstream Classification

| Workstream | Portfolio / architecture mode | Venture / production mode |
| --- | --- | --- |
| Contracts and schemas | Build deeply; this is the source of truth and portfolio artifact. | Keep; use contracts to verify vendors and adapters. |
| Learning-session state machine | Build; it is core product behavior. | Keep and harden with migration/versioning. |
| Subject packs and deterministic evaluators | Build; they prove the platform can be subject-agnostic. | Keep; add authoring/review workflows. |
| Tutor context and model gateway | Build a synthetic gateway now; this may become core IP. | Keep behind provider adapters, safety review, and response validation. |
| Consent and safety contracts | Build reference contracts and tests. | Review with counsel; connect to production auth, notices, incident operations, and data-rights workflows. |
| Identity/auth | Keep fixture/reference auth for tests. | Prefer managed provider adapters unless a specific validated need requires bespoke auth. |
| Session persistence | Build reference in-memory/file/JSONL/SQLite adapters. | Use governed database/storage with access controls, encryption, audit, retention, export, delete, backup, and recovery drills. |
| Audit logging | Build append-only reference behavior. | Persist to durable append-only storage or managed audit/observability systems with access review. |
| Voucher/ESA billing | Build sandbox contracts and fake ledgers. | Use payment/accounting/provider rails and counsel-reviewed program workflows before real funds. |
| Observability | Keep local logs and test assertions. | Prefer managed telemetry/error reporting with privacy filters and data-processing terms. |
| Document storage | Avoid in prototype except synthetic references. | Use secure document storage with retention, access logging, and least-privilege controls. |

## Production Adapter Targets

The reference runtime should make these adapters easy to swap in later:

1. `AuthProviderAdapter` for guardian, educator, learner, and service-account identity.
2. `PaymentProviderAdapter` for checkout, refunds, receipts, disputes, and provider payouts.
3. `VoucherProgramAdapter` for ESA/voucher eligibility, documentation, submission, status, refund, and appeal workflows.
4. `AuditSinkAdapter` for append-only security/privacy/safety events.
5. `DocumentStorageAdapter` for voucher, school, identity, and consent documents.
6. `ObservabilityAdapter` for logs, metrics, traces, alerts, and privacy-safe error reporting.
7. `ModelProviderAdapter` for synthetic model evaluation, production model calls, moderation, retries, and deterministic fallbacks.

## Decision Rules

- If the task teaches core learning-platform architecture, build the reference version.
- If the task handles real identity, payment credentials, government funds, or regulated records, buy or integrate unless there is a validated reason not to.
- If the task is a potential moat, build a sandbox spike early, then harden only after quality and demand are validated.
- If a hand-rolled module exists, label it as a reference implementation until production requirements and vendor choices are reviewed.

## Near-Term Application

The next production-oriented work should not replace the reference architecture. It should add documentation and adapter seams so the current code can remain a portfolio-quality system while future production deployments can choose safer managed providers.
