import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';
import {
  createInvoiceFromCheckout,
  createLedgerEntriesForInvoice,
  createLedgerEntry,
  summarizeLedgerBalance,
} from '../src/app/voucher-billing.js';

const checkoutSessionFixture = readJson('examples/vouchers/math-subscription.checkout-session.json');
const invoiceSchema = readJson('schemas/invoice.schema.json');
const accountLedgerEntrySchema = readJson('schemas/account-ledger-entry.schema.json');
const fixedNow = '2026-05-28T00:00:00.000Z';

test('creates schema-compatible invoices from voucher-funded checkout sessions', () => {
  const invoice = createInvoiceFromCheckout(checkoutSessionFixture, {
    issuedAt: fixedNow,
    updatedAt: fixedNow,
    metadata: { checkoutStatus: checkoutSessionFixture.status },
  });

  assert.deepEqual(validateJsonSchema(invoice, invoiceSchema), []);
  assert.equal(invoice.id, 'invoice_checkout_demo_001');
  assert.equal(invoice.subtotalCents, 2500);
  assert.equal(invoice.fundingCredits[0].voucherRedemptionId, 'redemption_demo_math_subscription_001');
  assert.equal(invoice.balanceDueCents, 0);
  assert.equal(invoice.status, 'funding_pending');
});

test('creates debit and voucher-credit ledger entries for funded invoices', () => {
  const invoice = createInvoiceFromCheckout(checkoutSessionFixture, {
    issuedAt: fixedNow,
    updatedAt: fixedNow,
  });
  const ledgerEntries = createLedgerEntriesForInvoice(invoice, { occurredAt: fixedNow });

  assert.equal(ledgerEntries.length, 2);
  ledgerEntries.forEach((entry) => {
    assert.deepEqual(validateJsonSchema(entry, accountLedgerEntrySchema), []);
  });
  assert.deepEqual(
    ledgerEntries.map((entry) => [entry.entryType, entry.direction, entry.amountCents]),
    [
      ['charge', 'debit', 2500],
      ['voucher_credit', 'credit', 2500],
    ],
  );
  assert.deepEqual(summarizeLedgerBalance(ledgerEntries), {
    debitCents: 2500,
    creditCents: 2500,
    balanceCents: 0,
  });
});

test('keeps direct-pay balance visible when voucher funding is absent', () => {
  const checkoutSession = {
    ...checkoutSessionFixture,
    id: 'checkout_direct_pay_001',
    fundingSelections: [],
    balanceDueCents: 2500,
    status: 'payment_due',
  };
  const invoice = createInvoiceFromCheckout(checkoutSession, {
    issuedAt: fixedNow,
    updatedAt: fixedNow,
  });
  const ledgerEntries = createLedgerEntriesForInvoice(invoice, { occurredAt: fixedNow });

  assert.equal(invoice.status, 'issued');
  assert.equal(invoice.balanceDueCents, 2500);
  assert.equal(ledgerEntries.length, 1);
  assert.deepEqual(summarizeLedgerBalance(ledgerEntries), {
    debitCents: 2500,
    creditCents: 0,
    balanceCents: 2500,
  });
});

test('creates manual reimbursement and refund entries for audit workflows', () => {
  const reimbursement = createLedgerEntry({
    id: 'ledger_invoice_checkout_demo_001_reimbursement_001',
    accountId: 'guardian_demo_001',
    invoiceId: 'invoice_checkout_demo_001',
    voucherRedemptionId: 'redemption_demo_math_subscription_001',
    entryType: 'reimbursement',
    direction: 'credit',
    amountCents: 2500,
    currency: 'USD',
    occurredAt: fixedNow,
    source: 'voucher',
    metadata: { administratorReference: 'AZ-ESA-REIMBURSEMENT-001' },
  });
  const refund = createLedgerEntry({
    id: 'ledger_invoice_checkout_demo_001_refund_001',
    accountId: 'guardian_demo_001',
    invoiceId: 'invoice_checkout_demo_001',
    entryType: 'refund',
    direction: 'debit',
    amountCents: 500,
    currency: 'USD',
    occurredAt: fixedNow,
    source: 'manual',
    metadata: { reason: 'partial service refund' },
  });

  assert.deepEqual(validateJsonSchema(reimbursement, accountLedgerEntrySchema), []);
  assert.deepEqual(validateJsonSchema(refund, accountLedgerEntrySchema), []);
  assert.deepEqual(summarizeLedgerBalance([reimbursement, refund]), {
    debitCents: 500,
    creditCents: 2500,
    balanceCents: -2000,
  });
});

test('rejects invalid ledger fields before they reach billing storage', () => {
  assert.throws(
    () => createLedgerEntry({
      id: 'ledger_invalid',
      accountId: 'guardian_demo_001',
      invoiceId: 'invoice_checkout_demo_001',
      entryType: 'unsupported',
      direction: 'credit',
      amountCents: 1,
      currency: 'USD',
      occurredAt: fixedNow,
    }),
    /entryType must be one of/,
  );
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
