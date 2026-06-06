# Voucher and ESA Acceptance Plan

Homeschool funding programs are not one uniform payment rail. State education savings accounts (ESAs), vouchers, tax-credit scholarships, direct-pay marketplaces, purchase orders, and reimbursement workflows all have different provider rules and documentation requirements. The product should treat these as configurable funding sources rather than hard-coded payment types.

## What Was Added

| Layer | Artifact | Purpose |
| --- | --- | --- |
| Contract | `schemas/funding-source.schema.json` | Describes a homeschool voucher, ESA, scholarship, or other education funding program. |
| Contract | `schemas/voucher-redemption.schema.json` | Describes a checkout, reimbursement, or direct-pay request against a funding source. |
| Contract | `schemas/invoice.schema.json` | Describes an auditable invoice generated from a voucher-aware checkout. |
| Contract | `schemas/account-ledger-entry.schema.json` | Describes debit/credit ledger entries for voucher credits, direct payments, reimbursements, refunds, and adjustments. |
| Runtime | `src/app/voucher-acceptance.js` | Creates funding sources, calculates eligible totals, tracks documentation, validates readiness, and transitions redemption state. |
| Runtime | `src/app/voucher-checkout.js` | Maps catalog offerings into checkout line items and applies voucher funding to checkout sessions. |
| Runtime | `src/app/voucher-billing.js` | Converts funded checkouts into invoices and ledger entries for reconciliation and audit exports. |
| Runtime | `src/app/voucher-operations.js` | Creates sandbox-only compliance packets, documentation checklists, and review packet stores before real program submissions. |
| Fixtures | `examples/vouchers/` | Shows an ESA-style funding source, product offering, checkout session, and math subscription redemption. |
| Tests | `test/voucher-acceptance.test.js`, `test/voucher-checkout.test.js`, `test/voucher-billing.test.js` | Verifies schema compatibility, eligible amount calculation, documentation, checkout funding, invoice creation, ledger entries, readiness, and state transitions. |

## Supported Payment Patterns

The contracts support four common patterns:

1. **Marketplace/direct pay**: family buys through a program marketplace or administrator portal and the provider is paid directly.
2. **Provider invoice/direct pay**: provider submits an invoice or payment request to the program administrator.
3. **Family reimbursement**: family pays out of pocket and submits proof of payment and eligible-service documentation.
4. **Purchase order or school-funded order**: school, program, or administrator issues an approval before service begins.

## Operational Checklist

Before accepting real funds from a homeschool program, the product team should complete this checklist for each state/program:

1. Confirm provider eligibility and registration requirements.
2. Map allowed expense categories to platform products, services, and subscriptions.
3. Configure supported payment rails: marketplace, direct pay, reimbursement, or purchase order.
4. Capture required documentation such as itemized invoice, course description, curriculum description, attendance/service dates, and proof of payment.
5. Add guardian and provider attestations for educational use and eligible-service delivery.
6. Preserve audit records for every submission, approval, denial, payment, reimbursement, refund, and appeal.
7. Re-review program rules on a fixed cadence because state rules and administrator processes change.

## Product Flow

```text
FundingSource configured
  -> ProductOffering maps catalog item to eligible expense category
  -> CheckoutSession is created for guardian + learner
  -> Guardian selects voucher/ESA at checkout
  -> Checkout line items are mapped to eligible expense categories
  -> Documentation and attestations are collected
  -> VoucherRedemption is created in eligibility_pending
  -> CheckoutSession records voucher funding selection and balance due
  -> Invoice and account ledger entries are generated for audit/reconciliation
  -> Internal/admin review validates readiness
  -> Request is submitted to marketplace/admin/family reimbursement flow
  -> Status moves to approved, paid/reimbursed, denied, canceled, or refunded
```

## Compliance Notes

- This implementation is a product and data-contract foundation, not legal advice.
- Program rules vary by state, administrator, student eligibility, provider type, and expense category.
- Do not accept real voucher/ESA funds until the provider application, terms, documentation, refund, and audit requirements are approved by counsel or compliance operations. Compliance packets may be used for sandbox review, but `canSubmitRealFunds` must remain false until that approval is complete.
- Never store unnecessary sensitive learner documents in the app layer; use a secure document service with retention controls.

## Next Build Step

The checkout-to-billing foundation now includes sandbox compliance packets through `src/app/voucher-operations.js`. The next implementation step is turning those packets into an operator workflow:

1. add guardian-facing voucher/ESA checkout selection UI,
2. add product catalog admin review for eligible expense categories,
3. build admin review screens for documentation readiness using compliance packet status and checklists,
4. add export packages for program administrators from reviewed sandbox packets,
5. add refund and denial workflows,
6. connect ledger events to a durable accounting system and provider payout process.
