import { CONTRACT_VERSION } from '../core/domain.js';
import {
  EXPENSE_CATEGORIES,
  createVoucherRedemption,
  validateVoucherReadiness,
} from './voucher-acceptance.js';

export const BILLING_PERIODS = Object.freeze(['one_time', 'monthly', 'semester', 'annual', 'custom']);
export const PRODUCT_STATUSES = Object.freeze(['draft', 'active', 'retired']);
export const CHECKOUT_STATUSES = Object.freeze(['draft', 'voucher_pending', 'payment_due', 'paid', 'canceled']);

export function createProductOffering({
  id,
  name,
  description = name,
  expenseCategory,
  priceCents,
  currency = 'USD',
  billingPeriod = 'monthly',
  eligibleFundingSourceIds = [],
  status = 'draft',
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(name, 'name');
  assertString(description, 'description');
  assertEnum(expenseCategory, EXPENSE_CATEGORIES, 'expenseCategory');
  assertNonNegativeInteger(priceCents, 'priceCents');
  assertCurrency(currency);
  assertEnum(billingPeriod, BILLING_PERIODS, 'billingPeriod');
  assertStringArray(eligibleFundingSourceIds, 'eligibleFundingSourceIds');
  assertEnum(status, PRODUCT_STATUSES, 'status');
  assertPlainObject(metadata, 'metadata');

  return freezeJson({
    contractVersion,
    id,
    name,
    description,
    expenseCategory,
    priceCents,
    currency,
    billingPeriod,
    eligibleFundingSourceIds,
    status,
    metadata,
  });
}

export function createCheckoutSession({
  id,
  guardianId,
  learnerId,
  productOfferings,
  currency = 'USD',
  fundingSelections = [],
  status = 'draft',
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(guardianId, 'guardianId');
  assertNonEmptyString(learnerId, 'learnerId');
  assertCurrency(currency);
  assertProductOfferings(productOfferings);
  assertFundingSelections(fundingSelections);
  assertEnum(status, CHECKOUT_STATUSES, 'status');
  assertDateTime(createdAt, 'createdAt');
  assertDateTime(updatedAt, 'updatedAt');
  assertPlainObject(metadata, 'metadata');

  const lineItems = productOfferings.map((offering, index) => productOfferingToLineItem(offering, index));
  const subtotalCents = calculateSubtotal(lineItems);
  const fundedAmountCents = calculateFundedAmount(fundingSelections);

  return freezeJson({
    contractVersion,
    id,
    guardianId,
    learnerId,
    currency,
    lineItems,
    subtotalCents,
    fundingSelections,
    balanceDueCents: Math.max(subtotalCents - fundedAmountCents, 0),
    status,
    createdAt,
    updatedAt,
    metadata,
  });
}

export function applyVoucherToCheckout(checkoutSession, {
  fundingSource,
  redemptionId,
  documentation = [],
  attestations = {
    guardianConfirmedEducationalUse: false,
    providerConfirmedEligibleService: false,
  },
  now = () => new Date().toISOString(),
} = {}) {
  assertCheckoutSession(checkoutSession);
  assertPlainObject(fundingSource, 'fundingSource');
  assertNonEmptyString(redemptionId, 'redemptionId');

  const redemption = createVoucherRedemption({
    id: redemptionId,
    fundingSource,
    learnerId: checkoutSession.learnerId,
    guardianId: checkoutSession.guardianId,
    status: 'eligibility_pending',
    currency: checkoutSession.currency,
    lineItems: checkoutSession.lineItems.map((lineItem) => ({
      id: lineItem.id,
      description: lineItem.description,
      expenseCategory: lineItem.expenseCategory,
      amountCents: lineItem.amountCents,
      metadata: {
        ...(lineItem.metadata ?? {}),
        productOfferingId: lineItem.productOfferingId,
      },
    })),
    documentation,
    attestations,
    createdAt: now(),
    updatedAt: now(),
    metadata: {
      checkoutSessionId: checkoutSession.id,
    },
  });
  const fundingSelection = {
    fundingSourceId: fundingSource.id,
    voucherRedemptionId: redemption.id,
    amountCents: redemption.eligibleAmountCents,
    status: 'pending',
  };
  const fundingSelections = upsertFundingSelection(checkoutSession.fundingSelections, fundingSelection);
  const fundedAmountCents = calculateFundedAmount(fundingSelections);

  return freezeJson({
    checkoutSession: {
      ...checkoutSession,
      fundingSelections,
      balanceDueCents: Math.max(checkoutSession.subtotalCents - fundedAmountCents, 0),
      status: redemption.eligibleAmountCents > 0 ? 'voucher_pending' : 'payment_due',
      updatedAt: now(),
    },
    voucherRedemption: redemption,
    readiness: validateVoucherReadiness({ fundingSource, redemption }),
  });
}

export function summarizeCheckoutFunding(checkoutSession) {
  assertCheckoutSession(checkoutSession);
  const fundedAmountCents = calculateFundedAmount(checkoutSession.fundingSelections);

  return freezeJson({
    subtotalCents: checkoutSession.subtotalCents,
    fundedAmountCents,
    balanceDueCents: Math.max(checkoutSession.subtotalCents - fundedAmountCents, 0),
    fundingSelectionCount: checkoutSession.fundingSelections.length,
    hasVoucherFunding: checkoutSession.fundingSelections.length > 0,
  });
}

function productOfferingToLineItem(offering, index) {
  return {
    id: `line_${index + 1}_${offering.id}`,
    productOfferingId: offering.id,
    description: offering.name,
    expenseCategory: offering.expenseCategory,
    amountCents: offering.priceCents,
    metadata: {
      billingPeriod: offering.billingPeriod,
      eligibleFundingSourceIds: offering.eligibleFundingSourceIds,
    },
  };
}

function calculateSubtotal(lineItems) {
  return lineItems.reduce((total, lineItem) => total + lineItem.amountCents, 0);
}

function calculateFundedAmount(fundingSelections) {
  return fundingSelections
    .filter((selection) => !['denied', 'canceled'].includes(selection.status))
    .reduce((total, selection) => total + selection.amountCents, 0);
}

function upsertFundingSelection(fundingSelections, fundingSelection) {
  const withoutExisting = fundingSelections.filter(
    (selection) => selection.voucherRedemptionId !== fundingSelection.voucherRedemptionId,
  );
  return [...withoutExisting, fundingSelection];
}

function assertProductOfferings(productOfferings) {
  assertArray(productOfferings, 'productOfferings');
  if (productOfferings.length === 0) throw new RangeError('productOfferings must contain at least one item');
  productOfferings.forEach((offering, index) => {
    assertPlainObject(offering, `productOfferings[${index}]`);
    assertNonEmptyString(offering.id, `productOfferings[${index}].id`);
    assertNonEmptyString(offering.name, `productOfferings[${index}].name`);
    assertEnum(offering.expenseCategory, EXPENSE_CATEGORIES, `productOfferings[${index}].expenseCategory`);
    assertNonNegativeInteger(offering.priceCents, `productOfferings[${index}].priceCents`);
    assertCurrency(offering.currency);
    assertEnum(offering.status, PRODUCT_STATUSES, `productOfferings[${index}].status`);
  });
}

function assertCheckoutSession(checkoutSession) {
  assertPlainObject(checkoutSession, 'checkoutSession');
  assertNonEmptyString(checkoutSession.id, 'checkoutSession.id');
  assertNonEmptyString(checkoutSession.guardianId, 'checkoutSession.guardianId');
  assertNonEmptyString(checkoutSession.learnerId, 'checkoutSession.learnerId');
  assertCurrency(checkoutSession.currency);
  assertArray(checkoutSession.lineItems, 'checkoutSession.lineItems');
  assertFundingSelections(checkoutSession.fundingSelections);
}

function assertFundingSelections(fundingSelections) {
  assertArray(fundingSelections, 'fundingSelections');
  fundingSelections.forEach((selection, index) => {
    assertPlainObject(selection, `fundingSelections[${index}]`);
    assertNonEmptyString(selection.fundingSourceId, `fundingSelections[${index}].fundingSourceId`);
    assertNonEmptyString(selection.voucherRedemptionId, `fundingSelections[${index}].voucherRedemptionId`);
    assertNonNegativeInteger(selection.amountCents, `fundingSelections[${index}].amountCents`);
    assertEnum(selection.status, ['pending', 'approved', 'paid', 'reimbursed', 'denied', 'canceled'], `fundingSelections[${index}].status`);
  });
}

function assertStringArray(values, fieldName) {
  assertArray(values, fieldName);
  values.forEach((value, index) => assertNonEmptyString(value, `${fieldName}[${index}]`));
}

function assertCurrency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new TypeError('currency must be an ISO 4217 code');
  }
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time`);
  }
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} must be one of ${allowedValues.join(', ')}`);
  }
}

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function assertString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string`);
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function freezeJson(value) {
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
