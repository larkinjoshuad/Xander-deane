import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateDataInventory } from '../scripts/validate-data-inventory.js';

const inventory = readJson('examples/governance/base.data-inventory.json');
const registry = readJson('schemas/index.json');

test('data inventory validates and covers every registered schema', () => {
  const result = validateDataInventory();

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.recordCount, registry.schemas.length);
  assert.ok(result.blockedCount > 20);
});

test('data inventory keeps high-risk learner and voucher records synthetic/review-gated', () => {
  const recordsByName = new Map(inventory.records.map((record) => [record.contractName, record]));

  for (const contractName of ['learner-profile', 'session-record', 'tutor-context', 'tutor-response', 'tutor-quality-scorecard', 'voucher-redemption', 'account-ledger-entry']) {
    const record = recordsByName.get(contractName);
    assert.equal(record.realDataAllowed, false, `${contractName} must not allow real data in prototype mode`);
    assert.equal(record.piiRisk, 'high');
    assert.ok(record.productionRequirements.length > 0, `${contractName} must have production requirements`);
  }
});

test('data inventory maps scoped records to consent or authority requirements', () => {
  const scopedRecords = inventory.records.filter((record) => record.requiresConsentScopes.length > 0);

  assert.ok(scopedRecords.length > 0);
  scopedRecords.forEach((record) => {
    assert.ok(
      record.productionRequirements.some((item) => item.includes('consent') || item.includes('authority')),
      `${record.contractName} must include consent/authority requirements`,
    );
  });
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
