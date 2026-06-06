import { CONTRACT_VERSION } from '../core/domain.js';

export const INVOICE_STATUSES = Object.freeze(['draft', 'issued', 'funding_pending', 'partially_funded', 'paid', 'void', 'refunded']);
export const LEDGER_ENTRY_TYPES = Object.freeze([
  'charge',
  'voucher_credit',
  'direct_payment',
  'reimbursement',
  'refund',
  'adjustment',
]);

export function createInvoiceFromCheckout(checkoutSession, {
  id = `invoice_${checkoutSession.id}`,
  issuedAt = new Date().toISOString(),
  updatedAt = issuedAt,
  status,
  metadata = {},
  contractVersion = CONTRACT_VERSION,
} = {}) {
  assertCheckoutSession(checkoutSession);
  assertNonEmptyString(id, 'id');
  assertDateTime(issuedAt, 'issuedAt');
  assertDateTime(updatedAt, 'updatedAt');
  assertPlainObject(metadata, 'metadata');

  const fundingCredits = checkoutSession.fundingSelections.map((selection) => ({ ...selection }));
  const balanceDueCents = calculateInvoiceBalance(checkoutSession.subtotalCents, fundingCredits);
  const resolvedStatus = status ?? resolveInvoiceStatus({ balanceDueCents, fundingCredits });
  assertEnum(resolvedStatus, INVOICE_STATUSES, 'status');

  return freezeJson({
    contractVersion,
    id,
    checkoutSessionId: checkoutSession.id,
    guardianId: checkoutSession.guardianId,
    learnerId: checkoutSession.learnerId,
    currency: checkoutSession.currency,
    lineItems: checkoutSession.lineItems,
    subtotalCents: checkoutSession.subtotalCents,
    fundingCredits,
    balanceDueCents,
    status: resolvedStatus,
    issuedAt,
    updatedAt,
    metadata,
  });
}

export function createLedgerEntriesForInvoice(invoice, {
  accountId = invoice.guardianId,
  occurredAt = invoice.issuedAt,
  contractVersion = CONTRACT_VERSION,
} = {}) {
  assertInvoice(invoice);
  assertNonEmptyString(accountId, 'accountId');
  assertDateTime(occurredAt, 'occurredAt');

  const entries = [
    createLedgerEntry({
      id: `ledger_${invoice.id}_charge`,
      accountId,
      invoiceId: invoice.id,
      entryType: 'charge',
      direction: 'debit',
      amountCents: invoice.subtotalCents,
      currency: invoice.currency,
      occurredAt,
      source: 'checkout',
      metadata: { checkoutSessionId: invoice.checkoutSessionId },
      contractVersion,
    }),
  ];

  invoice.fundingCredits
    .filter((credit) => !['denied', 'canceled'].includes(credit.status))
    .forEach((credit) => {
      entries.push(createLedgerEntry({
        id: `ledger_${invoice.id}_${credit.voucherRedemptionId}_voucher_credit`,
        accountId,
        invoiceId: invoice.id,
        voucherRedemptionId: credit.voucherRedemptionId,
        entryType: 'voucher_credit',
        direction: 'credit',
        amountCents: credit.amountCents,
        currency: invoice.currency,
        occurredAt,
        source: 'voucher',
        metadata: { fundingSourceId: credit.fundingSourceId, status: credit.status },
        contractVersion,
      }));
    });

  return Object.freeze(entries);
}

export function createLedgerEntry({
  id,
  accountId,
  invoiceId,
  voucherRedemptionId,
  entryType,
  direction,
  amountCents,
  currency = 'USD',
  occurredAt = new Date().toISOString(),
  source = 'system',
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(accountId, 'accountId');
  assertNonEmptyString(invoiceId, 'invoiceId');
  if (voucherRedemptionId !== undefined) assertNonEmptyString(voucherRedemptionId, 'voucherRedemptionId');
  assertEnum(entryType, LEDGER_ENTRY_TYPES, 'entryType');
  assertEnum(direction, ['debit', 'credit'], 'direction');
  assertNonNegativeInteger(amountCents, 'amountCents');
  assertCurrency(currency);
  assertDateTime(occurredAt, 'occurredAt');
  assertEnum(source, ['checkout', 'voucher', 'manual', 'system'], 'source');
  assertPlainObject(metadata, 'metadata');

  return freezeJson({
    contractVersion,
    id,
    accountId,
    invoiceId,
    voucherRedemptionId,
    entryType,
    direction,
    amountCents,
    currency,
    occurredAt,
    source,
    metadata,
  });
}

export function summarizeLedgerBalance(ledgerEntries) {
  assertArray(ledgerEntries, 'ledgerEntries');
  const totals = ledgerEntries.reduce((summary, entry) => {
    assertPlainObject(entry, 'ledgerEntry');
    const signedAmount = entry.direction === 'debit' ? entry.amountCents : -entry.amountCents;
    return {
      debitCents: summary.debitCents + (entry.direction === 'debit' ? entry.amountCents : 0),
      creditCents: summary.creditCents + (entry.direction === 'credit' ? entry.amountCents : 0),
      balanceCents: summary.balanceCents + signedAmount,
    };
  }, { debitCents: 0, creditCents: 0, balanceCents: 0 });

  return freezeJson(totals);
}

function calculateInvoiceBalance(subtotalCents, fundingCredits) {
  const fundedAmountCents = fundingCredits
    .filter((credit) => !['denied', 'canceled'].includes(credit.status))
    .reduce((total, credit) => total + credit.amountCents, 0);
  return Math.max(subtotalCents - fundedAmountCents, 0);
}

function resolveInvoiceStatus({ balanceDueCents, fundingCredits }) {
  if (fundingCredits.some((credit) => ['pending', 'approved'].includes(credit.status))) {
    return 'funding_pending';
  }
  if (balanceDueCents === 0) return 'paid';
  if (fundingCredits.length > 0) return 'partially_funded';
  return 'issued';
}

function assertCheckoutSession(checkoutSession) {
  assertPlainObject(checkoutSession, 'checkoutSession');
  assertNonEmptyString(checkoutSession.id, 'checkoutSession.id');
  assertNonEmptyString(checkoutSession.guardianId, 'checkoutSession.guardianId');
  assertNonEmptyString(checkoutSession.learnerId, 'checkoutSession.learnerId');
  assertCurrency(checkoutSession.currency);
  assertArray(checkoutSession.lineItems, 'checkoutSession.lineItems');
  assertNonNegativeInteger(checkoutSession.subtotalCents, 'checkoutSession.subtotalCents');
  assertArray(checkoutSession.fundingSelections, 'checkoutSession.fundingSelections');
}

function assertInvoice(invoice) {
  assertPlainObject(invoice, 'invoice');
  assertNonEmptyString(invoice.id, 'invoice.id');
  assertNonEmptyString(invoice.guardianId, 'invoice.guardianId');
  assertCurrency(invoice.currency);
  assertArray(invoice.lineItems, 'invoice.lineItems');
  assertNonNegativeInteger(invoice.subtotalCents, 'invoice.subtotalCents');
  assertArray(invoice.fundingCredits, 'invoice.fundingCredits');
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
