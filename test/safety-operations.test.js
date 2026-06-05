import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import { generateSyntheticTutorResponse } from '../src/app/model-gateway.js';
import {
  createFileSafetyIncidentStore,
  createIncidentFromSafetyOutcome,
  createInMemorySafetyIncidentStore,
  createSafetyOperationsService,
} from '../src/app/safety-operations.js';
import { createInMemoryAuditEventStore } from '../src/app/session-access-service.js';
import { createTutorContext } from '../src/app/tutor-context.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const learnerProfile = readJson('examples/shared/learner.learner-profile.json');
const consentRecord = readJson('examples/safety/guardian-consent.consent-record.json');
const safetyPolicy = readJson('examples/safety/minor.safety-policy.json');
const safetyIncidentSchema = readJson('schemas/safety-incident.schema.json');
const fixedAt = '2026-06-02T00:00:00.000Z';
const fixedNow = () => fixedAt;

test('safety operations records blocked tutor output as incident and audit event', async () => {
  const tutorContext = createSyntheticContext();
  const gatewayResult = generateSyntheticTutorResponse({
    tutorContext,
    now: fixedNow,
    requestId: 'safety_ops_gateway_block_001',
    detectedContentCategories: ['unsafe_advice'],
    detectedEscalationTriggers: ['unsafe_advice_request'],
  });
  const auditEventStore = createInMemoryAuditEventStore();
  const service = createSafetyOperationsService({ auditEventStore, now: fixedNow });

  const outcome = await service.recordTutorSafetyOutcome({
    tutorContext,
    gatewayResult,
    accountId: 'operator_safety_ops_001',
    traceId: 'trace_safety_ops_001',
    relatedEventId: 'evt_safety_ops_001',
    metadata: { source: 'synthetic_gateway_test' },
  });

  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.incident.sessionId, tutorContext.sessionId);
  assert.equal(outcome.incident.actionTaken, 'blocked');
  assert.equal(outcome.incident.category, 'content_safety');
  assert.equal(outcome.incident.trigger, 'unsafe_advice_request');
  assert.equal(outcome.incident.tutorResponseId, gatewayResult.tutorResponse.id);
  assert.deepEqual(validateJsonSchema(outcome.incident, safetyIncidentSchema), []);
  assert.equal(outcome.auditEvent.action, 'safety.incident.create');
  assert.equal(outcome.auditEvent.decision, 'escalated');
  assert.equal(outcome.auditEvent.metadata.trigger, 'unsafe_advice_request');
  assert.deepEqual((await auditEventStore.listAuditEvents()).map((event) => event.id), [outcome.auditEvent.id]);
  assert.deepEqual((await service.listIncidents({ learnerId: tutorContext.learnerId })).map((incident) => incident.id), [outcome.incident.id]);
});

test('safety operations skips incidents for allowed tutor output', async () => {
  const tutorContext = createSyntheticContext();
  const gatewayResult = generateSyntheticTutorResponse({
    tutorContext,
    now: fixedNow,
    requestId: 'safety_ops_gateway_allowed_001',
  });
  const service = createSafetyOperationsService({ now: fixedNow });

  const outcome = await service.recordTutorSafetyOutcome({ tutorContext, gatewayResult });

  assert.equal(outcome.status, 'allowed');
  assert.equal(outcome.incident, null);
  assert.deepEqual(await service.listIncidents(), []);
});

test('safety operations maps learner wellbeing triggers to critical incidents', () => {
  const tutorContext = createSyntheticContext();
  const incident = createIncidentFromSafetyOutcome({
    tutorContext,
    safetyEvaluation: {
      allowed: false,
      blockedReasons: ['escalation_trigger:self_harm'],
      requiredActions: ['block_tutor_response', 'human_review'],
      checkedAt: fixedAt,
    },
    occurredAt: fixedAt,
  });

  assert.equal(incident.category, 'learner_wellbeing');
  assert.equal(incident.severity, 'critical');
  assert.equal(incident.trigger, 'self_harm');
  assert.deepEqual(validateJsonSchema(incident, safetyIncidentSchema), []);
});

test('file safety incident store persists append-only incidents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-safety-incidents-'));
  try {
    const tutorContext = createSyntheticContext();
    const store = createFileSafetyIncidentStore({ directory });
    const service = createSafetyOperationsService({
      incidentStore: store,
      now: fixedNow,
    });
    await service.recordTutorSafetyOutcome({
      tutorContext,
      safetyEvaluation: {
        allowed: false,
        blockedReasons: ['missing_active_consent:ai_tutoring'],
        requiredActions: ['block_tutor_response'],
        checkedAt: fixedAt,
      },
    });

    const reloadedStore = createFileSafetyIncidentStore({ directory });
    const incidents = await reloadedStore.listIncidents();
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].category, 'consent');
    assert.equal(incidents[0].trigger, 'ai_tutoring');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function createSyntheticContext() {
  const session = createInitialLearningSession({
    sessionId: 'ses_safety_ops_001',
    learnerId: learnerProfile.id,
    objective,
    problem,
    now: fixedNow,
  });
  return createTutorContext({
    session,
    learnerProfile,
    consentRecord,
    safetyPolicy,
    mayCallAi: true,
    generatedAt: fixedNow(),
    metadata: { dataMode: 'synthetic', purpose: 'safety-operations-test' },
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
