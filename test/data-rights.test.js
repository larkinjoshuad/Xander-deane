import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import { createSessionRecord } from '../src/app/session-persistence.js';
import { createSessionDataExport } from '../src/app/data-rights.js';
import { evaluateRetentionDisposition } from '../src/app/data-retention.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const dataInventory = readJson('examples/governance/base.data-inventory.json');
const retentionPolicy = readJson('examples/safety/session.data-retention-policy.json');
const fixedNow = () => '2026-05-31T00:00:00.000Z';

test('creates session data export packets with inventory classifications', () => {
  const session = createInitialLearningSession({
    sessionId: 'ses_data_rights_001',
    learnerId: 'learner_data_rights_001',
    objective,
    problem,
    now: fixedNow,
  });
  const sessionRecord = createSessionRecord(session, { now: fixedNow });

  const retentionDisposition = evaluateRetentionDisposition({
    record: sessionRecord,
    retentionPolicy,
    evaluatedAt: fixedNow(),
  });

  const exportPacket = createSessionDataExport({
    sessionRecord,
    inventoryRecords: dataInventory.records,
    exportedAt: fixedNow(),
    exportedByAccountId: 'guardian_data_rights_001',
    traceId: 'trace_data_rights_001',
    retentionDisposition,
  });

  assert.equal(exportPacket.mode, 'session_data_export');
  assert.equal(exportPacket.sessionId, 'ses_data_rights_001');
  assert.equal(exportPacket.learnerId, 'learner_data_rights_001');
  assert.equal(exportPacket.records.sessionRecord.sessionId, 'ses_data_rights_001');
  assert.ok(exportPacket.dataInventory.some((record) => record.contractName === 'session-record'));
  assert.ok(exportPacket.dataInventory.every((record) => record.realDataAllowed === false));
  assert.equal(exportPacket.metadata.includes[0], 'sessionRecord');
  assert.equal(exportPacket.metadata.retentionDisposition.status, 'active');
  assert.equal(exportPacket.metadata.retentionDisposition.policyId, retentionPolicy.id);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
