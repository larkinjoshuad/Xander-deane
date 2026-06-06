import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  addVoucherDocumentation,
  createFundingSource,
  createVoucherRedemption,
} from '../src/app/voucher-acceptance.js';
import {
  createFileVoucherReviewPacketStore,
  createInMemoryVoucherReviewPacketStore,
  createVoucherCompliancePacket,
} from '../src/app/voucher-operations.js';

const fundingSourceFixture = readJson('examples/vouchers/arizona-esa.funding-source.json');
const redemptionFixture = readJson('examples/vouchers/math-subscription.voucher-redemption.json');
const checkoutFixture = readJson('examples/vouchers/math-subscription.checkout-session.json');
const invoiceFixture = readJson('examples/vouchers/math-subscription.invoice.json');
const ledgerEntryFixture = readJson('examples/vouchers/math-subscription.account-ledger-entry.json');
const fixedNow = '2026-06-02T00:00:00.000Z';

test('creates voucher compliance packets that allow sandbox but block real funds', () => {
  const fundingSource = createFundingSource({
    ...fundingSourceFixture,
    status: 'active',
  });
  const redemption = createVoucherRedemption({
    ...redemptionFixture,
    fundingSource,
    status: 'eligibility_pending',
    documentation: [
      ...redemptionFixture.documentation,
      {
        type: 'proof_of_payment',
        status: 'uploaded',
        uri: 'memory://documents/proof_of_payment_demo_001.pdf',
      },
    ],
  });

  const packet = createVoucherCompliancePacket({
    fundingSource,
    redemption,
    checkoutSession: checkoutFixture,
    invoice: invoiceFixture,
    ledgerEntries: [ledgerEntryFixture],
    reviewerAccountId: 'ops_voucher_reviewer_001',
    reviewedAt: fixedNow,
    notes: ['Synthetic review only.'],
  });

  assert.equal(packet.status, 'ready_for_sandbox_submission');
  assert.equal(packet.sandboxOnly, true);
  assert.equal(packet.submission.canSubmitSandbox, true);
  assert.equal(packet.submission.canSubmitRealFunds, false);
  assert.ok(packet.submission.blockedReasons.some((reason) => reason.includes('real voucher/ESA funds remain blocked')));
  assert.equal(packet.documentationChecklist.every((item) => ['uploaded', 'accepted'].includes(item.status)), true);
  assert.equal(packet.ledgerEntries[0].status, 'pending');
  assert.equal(Object.isFrozen(packet), true);
});

test('voucher compliance packets surface readiness issues and missing documents', () => {
  const fundingSource = createFundingSource(fundingSourceFixture);
  const redemption = createVoucherRedemption({
    id: 'redemption_ops_blocked_001',
    fundingSource,
    learnerId: 'learner_ops_001',
    guardianId: 'guardian_ops_001',
    lineItems: redemptionFixture.lineItems,
    documentation: [],
    attestations: {
      guardianConfirmedEducationalUse: false,
      providerConfirmedEligibleService: true,
    },
    createdAt: fixedNow,
    updatedAt: fixedNow,
  });

  const packet = createVoucherCompliancePacket({ fundingSource, redemption, reviewedAt: fixedNow });

  assert.equal(packet.status, 'blocked_pending_review');
  assert.equal(packet.submission.canSubmitSandbox, false);
  assert.ok(packet.readiness.issues.some((issue) => issue.includes('provider_application_required')));
  assert.ok(packet.documentationChecklist.some((item) => item.status === 'missing'));
  assert.ok(packet.submission.blockedReasons.length > packet.readiness.issues.length);
});

test('voucher review packet stores filter by learner and status', async () => {
  const fundingSource = createFundingSource({ ...fundingSourceFixture, status: 'active' });
  const redemption = createVoucherRedemption({
    ...redemptionFixture,
    fundingSource,
    documentation: [
      ...redemptionFixture.documentation,
      {
        type: 'proof_of_payment',
        status: 'uploaded',
        uri: 'memory://documents/proof_of_payment_demo_001.pdf',
      },
    ],
  });
  const packet = createVoucherCompliancePacket({ fundingSource, redemption, reviewedAt: fixedNow });
  const store = createInMemoryVoucherReviewPacketStore();

  await store.savePacket(packet);

  assert.deepEqual((await store.listPackets({ learnerId: redemption.learnerId })).map((entry) => entry.packetId), [packet.packetId]);
  assert.deepEqual(await store.listPackets({ status: 'blocked_pending_review' }), []);
});

test('file voucher review packet store persists append-only review packets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-voucher-review-'));
  try {
    const fundingSource = createFundingSource({
      ...fundingSourceFixture,
      status: 'active',
      documentationRequirements: ['itemized_invoice'],
    });
    let redemption = createVoucherRedemption({
      id: 'redemption_ops_file_001',
      fundingSource,
      learnerId: 'learner_ops_file_001',
      guardianId: 'guardian_ops_file_001',
      lineItems: redemptionFixture.lineItems,
      documentation: [],
      attestations: redemptionFixture.attestations,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });
    redemption = addVoucherDocumentation(redemption, {
      type: 'itemized_invoice',
      status: 'accepted',
      uri: 'memory://documents/voucher-ops-file-invoice.pdf',
    }, { now: () => fixedNow });
    const packet = createVoucherCompliancePacket({ fundingSource, redemption, reviewedAt: fixedNow });
    const store = createFileVoucherReviewPacketStore({ directory });
    await store.savePacket(packet);

    const reloaded = createFileVoucherReviewPacketStore({ directory });
    const packets = await reloaded.listPackets({ redemptionId: redemption.id });
    assert.equal(packets.length, 1);
    assert.equal(packets[0].packetId, packet.packetId);
    assert.equal(packets[0].documentationChecklist[0].status, 'accepted');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
