# Regulatory Assumptions and Real-Data Boundary

This project is currently a **synthetic-data architecture and portfolio prototype**. It may become a venture later, but the venture rules do not begin at incorporation or deployment; they begin the moment the system handles real learner data, real guardian data, real school records, real voucher/ESA transactions, or live child-facing AI output.

## Current Mode

| Mode | Status | Allowed data | Primary goal |
| --- | --- | --- | --- |
| Architecture/portfolio prototype | Active | Synthetic fixtures, demo accounts, fake voucher records, local test data | Learn the system shape and prove contracts, state, safety, persistence, and UI flows. |
| Venture discovery | Allowed only with synthetic or adult-volunteer data unless reviewed | Synthetic demos, adult feedback, de-identified interview notes | Validate learner value, guardian willingness to pay, school/channel demand, and tutor quality. |
| Real-learner pilot | Blocked | Counsel-approved learner/guardian/school data only | Serve learners under reviewed consent, authority, safety, retention, and data-processing controls. |

## Bright-Line Rule

Do not collect, import, store, or process real minor PII, real learner records, real guardian records, school-provided education records, real voucher/ESA documents, real payment credentials, or live child-facing AI conversations until the assumptions below have been resolved and reviewed by qualified counsel/compliance operators.

## Initial Regulatory Assumption Set

These assumptions are deliberately conservative. They preserve optionality while making it clear what must be revisited before real deployment.

| Area | Working assumption | Why it matters |
| --- | --- | --- |
| Geography | United States first; no EU/UK learner launch until GDPR-K/UK GDPR review exists. | Avoids accidentally designing global consent/export/deletion rules before the first market is chosen. |
| Learner age | Under-13 learners are possible, so COPPA-style parental consent must be assumed for direct-to-family flows. | The safest default is that guardian consent gates AI tutoring, personalization, notifications, analytics, and persistence. |
| School channel | School-mediated pilots may invoke FERPA-style school official, education record, and data-processing expectations. | A school pilot can change who has authority to consent and how records must be accessed/exported/deleted. |
| State privacy | California-style student privacy/SOPIPA constraints are plausible if the product is sold into schools or available nationally. | Data use, advertising, profiling, and third-party disclosures must be constrained early. |
| Voucher/ESA | ESA, voucher, marketplace, reimbursement, and purchase-order flows vary by program and remain sandbox-only. | Government-funded education payments require provider eligibility, documentation, refund, appeal, and audit controls. |
| AI tutoring | Live child-facing AI is blocked; only synthetic model-gateway evaluation is allowed before safety and consent enforcement. | Tutor quality needs early validation, but child-facing AI needs stronger policy, review, logging, and fallback gates. |
| Analytics/model improvement | No learner data may be used for analytics, personalization, or model improvement without explicit scope, minimization, retention, and opt-out rules. | Analytics can silently become a second data product if not bounded. |
| Documents | Sensitive verification, voucher, school, or identity documents should not be stored in the app layer. | A secure document service with access logging and retention controls should own document storage if the venture proceeds. |

## Questions That Must Be Answered Before Real Learner Data

1. Is the first channel direct-to-parent, school-mediated, tutor/center-mediated, or ESA marketplace-mediated?
2. Are under-13 learners in scope for the first pilot?
3. Who is authorized to grant consent: guardian, school official, program administrator, or some combination?
4. Which scopes are required for session persistence, AI tutoring, progress tracking, guardian notifications, analytics, voucher billing, and data export?
5. What data must be minimized, redacted, encrypted, retained, exported, or deleted for each record type?
6. Which state/program voucher rules apply to the first paid deployment?
7. What data-processing agreements, privacy notices, incident-response playbooks, and subprocessors are required?
8. Which vendor primitives will be bought for production auth, payments, document storage, observability, and notifications?

## Engineering Implication

The learner-data inventory in `examples/governance/base.data-inventory.json` is the executable follow-through for these assumptions: it classifies every registered contract before real data is allowed. The existing contracts and reference services remain valuable because they define the product's desired behavior. They should not be interpreted as production compliance infrastructure. Production adapters must be selected or implemented only after this assumption set is converted into counsel-reviewed requirements and executable acceptance tests.

This document is not legal advice.
