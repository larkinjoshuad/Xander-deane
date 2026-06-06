import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createFundingSource } from '../src/app/voucher-acceptance.js';
import {
  applyVoucherToCheckout,
  createCheckoutSession,
  createProductOffering,
  summarizeCheckoutFunding,
} from '../src/app/voucher-checkout.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const fundingSourceFixture = readJson('examples/vouchers/arizona-esa.funding-source.json');
const productOfferingFixture = readJson('examples/vouchers/math-subscription.product-offering.json');
const productOfferingSchema = readJson('schemas/product-offering.schema.json');
const checkoutSessionSchema = readJson('schemas/checkout-session.schema.json');
const voucherRedemptionSchema = readJson('schemas/voucher-redemption.schema.json');
const fixedNow = () => '2026-05-28T00:00:00.000Z';

test('creates schema-compatible product offerings for voucher-eligible catalog items', () => {
  const productOffering = createProductOffering(productOfferingFixture);

  assert.deepEqual(validateJsonSchema(productOffering, productOfferingSchema), []);
  assert.equal(productOffering.expenseCategory, 'online_learning');
  assert.deepEqual(productOffering.eligibleFundingSourceIds, ['funding.az.esa']);
});

test('creates checkout sessions from product offerings', () => {
  const productOffering = createProductOffering(productOfferingFixture);
  const checkoutSession = createCheckoutSession({
    id: 'checkout_test_001',
    guardianId: 'guardian_test_001',
    learnerId: 'learner_test_001',
    productOfferings: [productOffering],
    createdAt: fixedNow(),
    updatedAt: fixedNow(),
  });

  assert.deepEqual(validateJsonSchema(checkoutSession, checkoutSessionSchema), []);
  assert.equal(checkoutSession.subtotalCents, 2500);
  assert.equal(checkoutSession.balanceDueCents, 2500);
  assert.equal(checkoutSession.lineItems[0].productOfferingId, productOffering.id);
});

test('applies voucher funding to checkout and creates a redemption', () => {
  const productOffering = createProductOffering(productOfferingFixture);
  const fundingSource = createFundingSource({
    ...fundingSourceFixture,
    status: 'active',
    documentationRequirements: ['itemized_invoice'],
  });
  const checkoutSession = createCheckoutSession({
    id: 'checkout_voucher_001',
    guardianId: 'guardian_voucher_001',
    learnerId: 'learner_voucher_001',
    productOfferings: [productOffering],
    createdAt: fixedNow(),
    updatedAt: fixedNow(),
  });

  const result = applyVoucherToCheckout(checkoutSession, {
    fundingSource,
    redemptionId: 'redemption_voucher_001',
    documentation: [{ type: 'itemized_invoice', status: 'uploaded', uri: 'memory://invoice.pdf' }],
    attestations: {
      guardianConfirmedEducationalUse: true,
      providerConfirmedEligibleService: true,
    },
    now: fixedNow,
  });

  assert.deepEqual(validateJsonSchema(result.checkoutSession, checkoutSessionSchema), []);
  assert.deepEqual(validateJsonSchema(result.voucherRedemption, voucherRedemptionSchema), []);
  assert.equal(result.checkoutSession.status, 'voucher_pending');
  assert.equal(result.checkoutSession.balanceDueCents, 0);
  assert.equal(result.voucherRedemption.eligibleAmountCents, 2500);
  assert.deepEqual(result.readiness, { ready: true, issues: [] });
  assert.deepEqual(summarizeCheckoutFunding(result.checkoutSession), {
    subtotalCents: 2500,
    fundedAmountCents: 2500,
    balanceDueCents: 0,
    fundingSelectionCount: 1,
    hasVoucherFunding: true,
  });
});

test('keeps direct balance due for checkout line items that are not voucher eligible', () => {
  const productOffering = createProductOffering({
    ...productOfferingFixture,
    id: 'product.custom_merch',
    name: 'Custom non-eligible add-on',
    expenseCategory: 'custom',
    priceCents: 700,
    eligibleFundingSourceIds: [],
  });
  const fundingSource = createFundingSource({
    ...fundingSourceFixture,
    status: 'active',
    documentationRequirements: [],
  });
  const checkoutSession = createCheckoutSession({
    id: 'checkout_ineligible_001',
    guardianId: 'guardian_ineligible_001',
    learnerId: 'learner_ineligible_001',
    productOfferings: [productOffering],
    createdAt: fixedNow(),
    updatedAt: fixedNow(),
  });

  const result = applyVoucherToCheckout(checkoutSession, {
    fundingSource,
    redemptionId: 'redemption_ineligible_001',
    attestations: {
      guardianConfirmedEducationalUse: true,
      providerConfirmedEligibleService: true,
    },
    now: fixedNow,
  });

  assert.equal(result.voucherRedemption.eligibleAmountCents, 0);
  assert.equal(result.checkoutSession.balanceDueCents, 700);
  assert.equal(result.checkoutSession.status, 'payment_due');
  assert.equal(result.readiness.ready, false);
  assert.ok(result.readiness.issues.includes('requested amount includes ineligible line items'));
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
