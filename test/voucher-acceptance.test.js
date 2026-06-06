import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  addVoucherDocumentation,
  calculateEligibleTotal,
  createFundingSource,
  createVoucherRedemption,
  transitionVoucherRedemption,
  validateVoucherReadiness,
} from '../src/app/voucher-acceptance.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const fundingSourceFixture = readJson('examples/vouchers/arizona-esa.funding-source.json');
const redemptionFixture = readJson('examples/vouchers/math-subscription.voucher-redemption.json');
const fundingSourceSchema = readJson('schemas/funding-source.schema.json');
const voucherRedemptionSchema = readJson('schemas/voucher-redemption.schema.json');
const fixedNow = () => '2026-05-28T00:00:00.000Z';

test('creates schema-compatible funding sources for homeschool voucher programs', () => {
  const fundingSource = createFundingSource(fundingSourceFixture);

  assert.deepEqual(validateJsonSchema(fundingSource, fundingSourceSchema), []);
  assert.equal(fundingSource.programType, 'esa');
  assert.equal(fundingSource.paymentRails.reimbursement, true);
  assert.ok(Object.isFrozen(fundingSource));
});

test('creates voucher redemptions and calculates eligible educational expenses', () => {
  const fundingSource = createFundingSource({
    ...fundingSourceFixture,
    status: 'active',
  });
  const redemption = createVoucherRedemption({
    id: redemptionFixture.id,
    fundingSource,
    learnerId: redemptionFixture.learnerId,
    guardianId: redemptionFixture.guardianId,
    status: redemptionFixture.status,
    lineItems: [
      ...redemptionFixture.lineItems,
      {
        id: 'line_unapproved_merch_001',
        description: 'Unapproved merchandise',
        expenseCategory: 'custom',
        amountCents: 500,
      },
    ],
    documentation: redemptionFixture.documentation,
    attestations: redemptionFixture.attestations,
    createdAt: redemptionFixture.createdAt,
    updatedAt: redemptionFixture.updatedAt,
    metadata: redemptionFixture.metadata,
  });

  assert.deepEqual(validateJsonSchema(redemption, voucherRedemptionSchema), []);
  assert.equal(redemption.requestedAmountCents, 3000);
  assert.equal(redemption.eligibleAmountCents, 2500);
  assert.equal(calculateEligibleTotal({ fundingSource, lineItems: redemption.lineItems }), 2500);
});

test('tracks voucher documentation and state transitions', () => {
  const fundingSource = createFundingSource({
    ...fundingSourceFixture,
    status: 'active',
    documentationRequirements: ['itemized_invoice'],
  });
  let redemption = createVoucherRedemption({
    id: 'redemption_transition_001',
    fundingSource,
    learnerId: 'learner_transition_001',
    guardianId: 'guardian_transition_001',
    lineItems: redemptionFixture.lineItems,
    documentation: [],
    attestations: redemptionFixture.attestations,
    createdAt: fixedNow(),
    updatedAt: fixedNow(),
  });

  redemption = addVoucherDocumentation(redemption, {
    type: 'itemized_invoice',
    status: 'uploaded',
    uri: 'memory://documents/invoice_transition_001.pdf',
  }, { now: fixedNow });
  redemption = transitionVoucherRedemption(redemption, 'eligibility_pending', { now: fixedNow });
  redemption = transitionVoucherRedemption(redemption, 'submitted', { now: fixedNow });
  redemption = transitionVoucherRedemption(redemption, 'approved', { now: fixedNow });

  assert.equal(redemption.status, 'approved');
  assert.deepEqual(validateVoucherReadiness({ fundingSource, redemption }), {
    ready: true,
    issues: [],
  });
  assert.throws(
    () => transitionVoucherRedemption(redemption, 'draft', { now: fixedNow }),
    /cannot transition voucher redemption/,
  );
});

test('reports voucher readiness issues before payment submission', () => {
  const fundingSource = createFundingSource(fundingSourceFixture);
  const redemption = createVoucherRedemption({
    id: 'redemption_not_ready_001',
    fundingSource,
    learnerId: 'learner_not_ready_001',
    guardianId: 'guardian_not_ready_001',
    lineItems: redemptionFixture.lineItems,
    documentation: [],
    attestations: {
      guardianConfirmedEducationalUse: false,
      providerConfirmedEligibleService: true,
    },
    createdAt: fixedNow(),
    updatedAt: fixedNow(),
  });

  const readiness = validateVoucherReadiness({ fundingSource, redemption });

  assert.equal(readiness.ready, false);
  assert.ok(readiness.issues.some((issue) => issue.includes('provider_application_required')));
  assert.ok(readiness.issues.some((issue) => issue.includes('guardian educational-use')));
  assert.ok(readiness.issues.some((issue) => issue.includes('documentation missing')));
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
