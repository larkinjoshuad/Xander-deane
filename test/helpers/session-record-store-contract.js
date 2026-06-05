import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../../src/app/learning-session.js';
import { createSessionPersistenceService } from '../../src/app/session-service.js';
import { validateJsonSchema } from '../../scripts/validate-fixtures.js';

const defaultObjective = readJson('examples/math/objective.learning-objective.json');
const defaultProblem = readJson('examples/math/problem.problem.json');
const defaultSessionRecordSchema = readJson('schemas/session-record.schema.json');
const defaultNow = () => '2026-05-30T00:00:00.000Z';

export function runSessionRecordStoreContractTests({
  stores,
  objective = defaultObjective,
  problem = defaultProblem,
  sessionRecordSchema = defaultSessionRecordSchema,
  now = defaultNow,
  learnerId = 'learner_contract_001',
} = {}) {
  assertStoreFactories(stores);

  for (const factory of stores) {
    test(`${factory.name} session record store satisfies the shared adapter contract`, async () => {
      const context = await factory.create();
      assertRecordStoreContext(context, factory.name);
      try {
        const service = createSessionPersistenceService({ recordStore: context.recordStore, now });
        let session = createContractMathSession({
          sessionId: `ses_contract_${factory.name.replace(/[^a-z0-9]/g, '_')}_001`,
          learnerId,
          objective,
          problem,
          now,
        });

        let savedRecord = await service.saveSession(session);
        assert.equal(savedRecord.metadata.recordVersion, 1);
        assert.deepEqual(validateJsonSchema(savedRecord, sessionRecordSchema), []);

        session = selectCounter(session, 'counter_2');
        session = placeSelectedCounter(session, 'group_1', now);
        savedRecord = await service.saveSession(session, { expectedRecordVersion: 1 });

        assert.equal(savedRecord.metadata.recordVersion, 2);
        assert.equal(savedRecord.metadata.etag, `W/"${session.sessionId}:2"`);
        assert.deepEqual(savedRecord.currentWorkspaceSnapshot.state.groups[0].items, ['counter_2']);

        await assert.rejects(
          () => service.saveSession(session, { expectedRecordVersion: 1 }),
          /version conflict: expected 1, current 2/,
        );

        savedRecord = await service.appendInteractionEvent(session.sessionId, session.events.at(-1), {
          expectedRecordVersion: 2,
        });
        assert.equal(savedRecord.metadata.recordVersion, 3);
        assert.equal(savedRecord.events.length, 2);

        savedRecord = await service.appendWorkspaceSnapshot(session.sessionId, session.workspaceSnapshot, {
          expectedRecordVersion: 3,
        });
        assert.equal(savedRecord.metadata.recordVersion, 4);
        assert.equal(savedRecord.snapshotHistory.length, 2);
        assert.deepEqual(savedRecord.currentWorkspaceSnapshot.state.groups[0].items, ['counter_2']);

        const reloadedService = createSessionPersistenceService({
          recordStore: await context.recreate(),
          now,
        });
        const loadedRecord = await reloadedService.loadSessionRecord(session.sessionId);

        assert.deepEqual(loadedRecord, savedRecord);
        assert.deepEqual(await reloadedService.listSessionRecords({ learnerId }), [savedRecord]);
        assert.deepEqual(await reloadedService.listSessionRecords({ learnerId: 'learner_other_001' }), []);

        await reloadedService.deleteSessionRecord(session.sessionId, { expectedRecordVersion: 4 });
        assert.equal(await reloadedService.loadSessionRecord(session.sessionId), null);
        assert.deepEqual(await reloadedService.listSessionRecords({ learnerId }), []);
      } finally {
        await context.cleanup();
      }
    });
  }
}

function createContractMathSession({ sessionId, learnerId, objective, problem, now }) {
  return createInitialLearningSession({
    sessionId,
    learnerId,
    objective,
    problem,
    now,
  });
}

function assertStoreFactories(stores) {
  if (!Array.isArray(stores) || stores.length === 0) {
    throw new TypeError('runSessionRecordStoreContractTests requires at least one store factory');
  }
  stores.forEach((factory, index) => {
    if (!factory || typeof factory !== 'object') {
      throw new TypeError(`store factory at index ${index} must be an object`);
    }
    if (typeof factory.name !== 'string' || factory.name.trim().length === 0) {
      throw new TypeError(`store factory at index ${index} must include a non-empty name`);
    }
    if (typeof factory.create !== 'function') {
      throw new TypeError(`store factory ${factory.name} must include a create function`);
    }
  });
}

function assertRecordStoreContext(context, factoryName) {
  if (!context || typeof context !== 'object') {
    throw new TypeError(`store factory ${factoryName} must return a context object`);
  }
  if (!context.recordStore) {
    throw new TypeError(`store factory ${factoryName} must return a recordStore`);
  }
  if (typeof context.recreate !== 'function') {
    throw new TypeError(`store factory ${factoryName} must return a recreate function`);
  }
  if (typeof context.cleanup !== 'function') {
    throw new TypeError(`store factory ${factoryName} must return a cleanup function`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
