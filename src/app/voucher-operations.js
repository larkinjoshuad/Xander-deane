import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { validateVoucherReadiness } from './voucher-acceptance.js';

export function createVoucherCompliancePacket({
  fundingSource,
  redemption,
  checkoutSession = null,
  invoice = null,
  ledgerEntries = [],
  reviewerAccountId = null,
  reviewedAt = new Date().toISOString(),
  notes = [],
  metadata = {},
} = {}) {
  assertPlainObject(fundingSource, 'fundingSource');
  assertPlainObject(redemption, 'redemption');
  assertOptionalObject(checkoutSession, 'checkoutSession');
  assertOptionalObject(invoice, 'invoice');
  assertArray(ledgerEntries, 'ledgerEntries');
  assertOptionalString(reviewerAccountId, 'reviewerAccountId');
  assertDateTime(reviewedAt, 'reviewedAt');
  assertStringArray(notes, 'notes');
  assertPlainObject(metadata, 'metadata');

  const readiness = validateVoucherReadiness({ fundingSource, redemption });
  const documentationChecklist = createDocumentationChecklist({ fundingSource, redemption });
  const realFundsBlockedReason = 'real voucher/ESA funds remain blocked until provider eligibility, program rules, refund policy, and audit-export requirements are approved';
  const blockedReasons = [
    ...readiness.issues,
    realFundsBlockedReason,
  ];

  return freezeJson({
    packetId: `voucher_packet_${sanitizeIdPart(redemption.id)}_${sanitizeIdPart(reviewedAt)}`,
    mode: 'voucher_compliance_packet',
    sandboxOnly: true,
    status: readiness.ready ? 'ready_for_sandbox_submission' : 'blocked_pending_review',
    reviewedAt,
    reviewerAccountId,
    fundingSource: summarizeFundingSource(fundingSource),
    redemption: summarizeRedemption(redemption),
    checkoutSession: checkoutSession ? summarizeCheckoutSession(checkoutSession) : null,
    invoice: invoice ? summarizeInvoice(invoice) : null,
    ledgerEntries: ledgerEntries.map(summarizeLedgerEntry),
    readiness,
    documentationChecklist,
    submission: {
      canSubmitSandbox: readiness.ready,
      canSubmitRealFunds: false,
      blockedReasons,
    },
    notes,
    metadata,
  });
}

export function createInMemoryVoucherReviewPacketStore(initialPackets = []) {
  const packets = initialPackets.map(freezeJson);

  return Object.freeze({
    async savePacket(packet) {
      const frozenPacket = freezeJson(packet);
      packets.push(frozenPacket);
      return frozenPacket;
    },
    async listPackets(filter = {}) {
      assertPlainObject(filter, 'filter');
      return Object.freeze(packets.filter((packet) => matchesPacketFilter(packet, filter)).map(freezeJson));
    },
    async clearPackets() {
      packets.length = 0;
    },
  });
}

export function createFileVoucherReviewPacketStore({ directory, fileName = 'voucher-review-packets.jsonl' }) {
  if (!directory) {
    throw new TypeError('directory is required for createFileVoucherReviewPacketStore');
  }
  assertNonEmptyString(fileName, 'fileName');
  const packetPath = join(directory, safeFileName(fileName));

  return Object.freeze({
    async savePacket(packet) {
      const frozenPacket = freezeJson(packet);
      await mkdir(dirname(packetPath), { recursive: true });
      await appendFile(packetPath, `${JSON.stringify(frozenPacket)}\n`, 'utf8');
      return frozenPacket;
    },
    async listPackets(filter = {}) {
      assertPlainObject(filter, 'filter');
      const rawLog = await readFile(packetPath, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      return Object.freeze(rawLog
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => freezeJson(JSON.parse(line)))
        .filter((packet) => matchesPacketFilter(packet, filter)));
    },
  });
}

function createDocumentationChecklist({ fundingSource, redemption }) {
  return Object.freeze(fundingSource.documentationRequirements.map((requirement) => {
    const normalizedRequirement = normalizeRequirement(requirement);
    const matchingDocuments = redemption.documentation.filter((document) =>
      documentationSatisfiesRequirement(document.type, normalizedRequirement),
    );
    const accepted = matchingDocuments.some((document) => document.status === 'accepted');
    const uploaded = matchingDocuments.some((document) => document.status === 'uploaded');
    const rejected = matchingDocuments.some((document) => document.status === 'rejected');
    return freezeJson({
      requirement,
      status: accepted ? 'accepted' : uploaded ? 'uploaded' : rejected ? 'rejected' : 'missing',
      documentCount: matchingDocuments.length,
      documentUris: matchingDocuments.map((document) => document.uri ?? null).filter((uri) => uri !== null),
    });
  }));
}

function summarizeFundingSource(fundingSource) {
  return {
    id: fundingSource.id,
    programName: fundingSource.programName,
    programType: fundingSource.programType,
    jurisdiction: fundingSource.jurisdiction,
    status: fundingSource.status,
    eligibleExpenseCategories: fundingSource.eligibleExpenseCategories,
    paymentRails: fundingSource.paymentRails,
  };
}

function summarizeRedemption(redemption) {
  return {
    id: redemption.id,
    fundingSourceId: redemption.fundingSourceId,
    learnerId: redemption.learnerId,
    guardianId: redemption.guardianId,
    status: redemption.status,
    currency: redemption.currency,
    requestedAmountCents: redemption.requestedAmountCents,
    eligibleAmountCents: redemption.eligibleAmountCents,
    lineItemCount: redemption.lineItems.length,
    documentationCount: redemption.documentation.length,
    attestations: redemption.attestations,
  };
}

function summarizeCheckoutSession(checkoutSession) {
  return {
    id: checkoutSession.id,
    status: checkoutSession.status,
    guardianId: checkoutSession.guardianId,
    learnerId: checkoutSession.learnerId,
    subtotalCents: checkoutSession.subtotalCents ?? checkoutSession.totalAmountCents ?? null,
    voucherAmountCents: checkoutSession.voucherAmountCents ?? checkoutSession.fundingSelections?.reduce((total, selection) => total + selection.amountCents, 0) ?? 0,
    balanceDueCents: checkoutSession.balanceDueCents ?? checkoutSession.directPayAmountCents ?? null,
  };
}

function summarizeInvoice(invoice) {
  return {
    id: invoice.id,
    status: invoice.status,
    checkoutSessionId: invoice.checkoutSessionId,
    subtotalCents: invoice.subtotalCents ?? invoice.totalAmountCents ?? null,
    voucherAmountCents: invoice.voucherAmountCents ?? invoice.fundingCredits?.reduce((total, credit) => total + credit.amountCents, 0) ?? 0,
    balanceDueCents: invoice.balanceDueCents ?? invoice.directPayAmountCents ?? null,
  };
}

function summarizeLedgerEntry(entry) {
  return {
    id: entry.id,
    accountId: entry.accountId,
    learnerId: entry.learnerId ?? null,
    invoiceId: entry.invoiceId ?? null,
    entryType: entry.entryType,
    amountCents: entry.amountCents,
    currency: entry.currency,
    status: entry.status ?? entry.metadata?.status ?? null,
  };
}

function matchesPacketFilter(packet, filter) {
  if (filter.status !== undefined && packet.status !== filter.status) return false;
  if (filter.fundingSourceId !== undefined && packet.fundingSource.id !== filter.fundingSourceId) return false;
  if (filter.redemptionId !== undefined && packet.redemption.id !== filter.redemptionId) return false;
  if (filter.learnerId !== undefined && packet.redemption.learnerId !== filter.learnerId) return false;
  if (filter.guardianId !== undefined && packet.redemption.guardianId !== filter.guardianId) return false;
  return true;
}

function documentationSatisfiesRequirement(documentType, normalizedRequirement) {
  const normalizedDocumentType = normalizeRequirement(documentType);
  if (normalizedDocumentType.includes(normalizedRequirement) || normalizedRequirement.includes(normalizedDocumentType)) {
    return true;
  }
  return normalizedRequirement.split('_or_').some((part) => part.length > 0 && normalizedDocumentType.includes(part));
}

function normalizeRequirement(value) {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
}

function assertStringArray(value, fieldName) {
  assertArray(value, fieldName);
  value.forEach((entry, index) => assertNonEmptyString(entry, `${fieldName}[${index}]`));
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function assertOptionalString(value, fieldName) {
  if (value === null || value === undefined) return;
  assertNonEmptyString(value, fieldName);
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function assertOptionalObject(value, fieldName) {
  if (value === null || value === undefined) return;
  assertPlainObject(value, fieldName);
}

function sanitizeIdPart(value) {
  return String(value ?? 'unknown').replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function safeFileName(value) {
  return sanitizeIdPart(value);
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
