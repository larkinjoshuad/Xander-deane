import { CONTRACT_VERSION } from '../core/domain.js';

export const FUNDING_PROGRAM_TYPES = Object.freeze([
  'esa',
  'voucher',
  'tax_credit_scholarship',
  'microgrant',
  'direct_pay',
  'reimbursement',
  'custom',
]);

export const EXPENSE_CATEGORIES = Object.freeze([
  'tuition',
  'curriculum',
  'instructional_materials',
  'online_learning',
  'tutoring',
  'assessment',
  'therapy',
  'technology',
  'fees',
  'custom',
]);

export const VOUCHER_REDEMPTION_STATUSES = Object.freeze([
  'draft',
  'eligibility_pending',
  'documentation_requested',
  'submitted',
  'approved',
  'paid',
  'reimbursed',
  'denied',
  'canceled',
  'refunded',
]);

const STATUS_TRANSITIONS = Object.freeze({
  draft: ['eligibility_pending', 'canceled'],
  eligibility_pending: ['documentation_requested', 'submitted', 'denied', 'canceled'],
  documentation_requested: ['submitted', 'denied', 'canceled'],
  submitted: ['approved', 'documentation_requested', 'denied', 'canceled'],
  approved: ['paid', 'reimbursed', 'refunded'],
  paid: ['refunded'],
  reimbursed: ['refunded'],
  denied: [],
  canceled: [],
  refunded: [],
});

export function createFundingSource({
  id,
  programName,
  programType,
  jurisdiction,
  administrator,
  eligibleExpenseCategories,
  paymentRails,
  documentationRequirements = [],
  status = 'researching',
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(programName, 'programName');
  assertEnum(programType, FUNDING_PROGRAM_TYPES, 'programType');
  assertJurisdiction(jurisdiction);
  assertAdministrator(administrator);
  assertExpenseCategories(eligibleExpenseCategories, 'eligibleExpenseCategories');
  assertPaymentRails(paymentRails);
  assertStringArray(documentationRequirements, 'documentationRequirements');
  assertEnum(status, ['researching', 'provider_application_required', 'provider_pending', 'active', 'paused', 'retired'], 'status');
  assertPlainObject(metadata, 'metadata');

  return freezeJson({
    contractVersion,
    id,
    programName,
    programType,
    jurisdiction,
    administrator,
    eligibleExpenseCategories,
    paymentRails,
    documentationRequirements,
    status,
    metadata,
  });
}

export function createVoucherRedemption({
  id,
  fundingSource,
  learnerId,
  guardianId,
  lineItems,
  currency = 'USD',
  status = 'draft',
  documentation = [],
  attestations = {
    guardianConfirmedEducationalUse: false,
    providerConfirmedEligibleService: false,
  },
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertPlainObject(fundingSource, 'fundingSource');
  assertNonEmptyString(fundingSource.id, 'fundingSource.id');
  assertNonEmptyString(learnerId, 'learnerId');
  assertNonEmptyString(guardianId, 'guardianId');
  assertEnum(status, VOUCHER_REDEMPTION_STATUSES, 'status');
  assertCurrency(currency);
  assertLineItems(lineItems);
  assertDocumentation(documentation);
  assertAttestations(attestations);
  assertDateTime(createdAt, 'createdAt');
  assertDateTime(updatedAt, 'updatedAt');
  assertPlainObject(metadata, 'metadata');

  const eligibleAmountCents = calculateEligibleTotal({ fundingSource, lineItems });
  const requestedAmountCents = calculateRequestedTotal(lineItems);

  return freezeJson({
    contractVersion,
    id,
    fundingSourceId: fundingSource.id,
    learnerId,
    guardianId,
    status,
    currency,
    lineItems,
    eligibleAmountCents,
    requestedAmountCents,
    documentation,
    attestations,
    createdAt,
    updatedAt,
    metadata,
  });
}

export function calculateEligibleTotal({ fundingSource, lineItems }) {
  assertPlainObject(fundingSource, 'fundingSource');
  assertExpenseCategories(fundingSource.eligibleExpenseCategories, 'fundingSource.eligibleExpenseCategories');
  assertLineItems(lineItems);

  return lineItems
    .filter((lineItem) => fundingSource.eligibleExpenseCategories.includes(lineItem.expenseCategory))
    .reduce((total, lineItem) => total + lineItem.amountCents, 0);
}

export function calculateRequestedTotal(lineItems) {
  assertLineItems(lineItems);
  return lineItems.reduce((total, lineItem) => total + lineItem.amountCents, 0);
}

export function addVoucherDocumentation(redemption, document, { now = () => new Date().toISOString() } = {}) {
  assertPlainObject(redemption, 'redemption');
  assertDocumentation([document]);

  return freezeJson({
    ...redemption,
    documentation: [...redemption.documentation, document],
    updatedAt: now(),
  });
}

export function transitionVoucherRedemption(redemption, nextStatus, {
  denialReason,
  now = () => new Date().toISOString(),
} = {}) {
  assertPlainObject(redemption, 'redemption');
  assertEnum(redemption.status, VOUCHER_REDEMPTION_STATUSES, 'redemption.status');
  assertEnum(nextStatus, VOUCHER_REDEMPTION_STATUSES, 'nextStatus');
  const allowedStatuses = STATUS_TRANSITIONS[redemption.status] ?? [];
  if (!allowedStatuses.includes(nextStatus)) {
    throw new RangeError(`cannot transition voucher redemption from ${redemption.status} to ${nextStatus}`);
  }
  if (nextStatus === 'denied') {
    assertNonEmptyString(denialReason, 'denialReason');
  }

  return freezeJson({
    ...redemption,
    status: nextStatus,
    denialReason: nextStatus === 'denied' ? denialReason : redemption.denialReason,
    updatedAt: now(),
  });
}

export function validateVoucherReadiness({ fundingSource, redemption }) {
  assertPlainObject(fundingSource, 'fundingSource');
  assertPlainObject(redemption, 'redemption');
  const issues = [];

  if (fundingSource.status !== 'active') {
    issues.push(`funding source ${fundingSource.id} is ${fundingSource.status}`);
  }
  if (redemption.eligibleAmountCents !== redemption.requestedAmountCents) {
    issues.push('requested amount includes ineligible line items');
  }
  if (!redemption.attestations.guardianConfirmedEducationalUse) {
    issues.push('guardian educational-use attestation is missing');
  }
  if (!redemption.attestations.providerConfirmedEligibleService) {
    issues.push('provider eligible-service attestation is missing');
  }
  fundingSource.documentationRequirements.forEach((requirement) => {
    const normalizedRequirement = normalizeRequirement(requirement);
    const hasDocument = redemption.documentation.some((document) =>
      documentationSatisfiesRequirement(document.type, normalizedRequirement) &&
      ['uploaded', 'accepted'].includes(document.status),
    );
    if (!hasDocument) {
      issues.push(`documentation missing: ${requirement}`);
    }
  });

  return freezeJson({
    ready: issues.length === 0,
    issues,
  });
}

function assertLineItems(lineItems) {
  assertArray(lineItems, 'lineItems');
  if (lineItems.length === 0) throw new RangeError('lineItems must contain at least one item');
  lineItems.forEach((lineItem, index) => {
    assertPlainObject(lineItem, `lineItems[${index}]`);
    assertNonEmptyString(lineItem.id, `lineItems[${index}].id`);
    assertNonEmptyString(lineItem.description, `lineItems[${index}].description`);
    assertEnum(lineItem.expenseCategory, EXPENSE_CATEGORIES, `lineItems[${index}].expenseCategory`);
    if (!Number.isInteger(lineItem.amountCents) || lineItem.amountCents < 0) {
      throw new TypeError(`lineItems[${index}].amountCents must be a non-negative integer`);
    }
  });
}

function assertDocumentation(documents) {
  assertArray(documents, 'documentation');
  documents.forEach((document, index) => {
    assertPlainObject(document, `documentation[${index}]`);
    assertNonEmptyString(document.type, `documentation[${index}].type`);
    assertEnum(document.status, ['missing', 'uploaded', 'accepted', 'rejected'], `documentation[${index}].status`);
  });
}

function assertAttestations(attestations) {
  assertPlainObject(attestations, 'attestations');
  if (typeof attestations.guardianConfirmedEducationalUse !== 'boolean') {
    throw new TypeError('attestations.guardianConfirmedEducationalUse must be boolean');
  }
  if (typeof attestations.providerConfirmedEligibleService !== 'boolean') {
    throw new TypeError('attestations.providerConfirmedEligibleService must be boolean');
  }
}

function assertJurisdiction(jurisdiction) {
  assertPlainObject(jurisdiction, 'jurisdiction');
  assertNonEmptyString(jurisdiction.country, 'jurisdiction.country');
  assertNonEmptyString(jurisdiction.region, 'jurisdiction.region');
}

function assertAdministrator(administrator) {
  assertPlainObject(administrator, 'administrator');
  assertNonEmptyString(administrator.name, 'administrator.name');
}

function assertPaymentRails(paymentRails) {
  assertPlainObject(paymentRails, 'paymentRails');
  ['directPay', 'marketplace', 'reimbursement', 'purchaseOrder'].forEach((rail) => {
    if (typeof paymentRails[rail] !== 'boolean') {
      throw new TypeError(`paymentRails.${rail} must be boolean`);
    }
  });
}

function assertExpenseCategories(categories, fieldName) {
  assertArray(categories, fieldName);
  if (categories.length === 0) throw new RangeError(`${fieldName} must contain at least one item`);
  categories.forEach((category) => assertEnum(category, EXPENSE_CATEGORIES, fieldName));
}

function assertCurrency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new TypeError('currency must be an ISO 4217 code');
  }
}

function assertStringArray(values, fieldName) {
  assertArray(values, fieldName);
  values.forEach((value, index) => assertNonEmptyString(value, `${fieldName}[${index}]`));
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

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
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

function documentationSatisfiesRequirement(documentType, normalizedRequirement) {
  const normalizedDocumentType = normalizeRequirement(documentType);
  if (normalizedDocumentType.includes(normalizedRequirement) || normalizedRequirement.includes(normalizedDocumentType)) {
    return true;
  }
  return normalizedRequirement.split('_or_').some((part) => part.length > 0 && normalizedDocumentType.includes(part));
}

function normalizeRequirement(value) {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '');
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
