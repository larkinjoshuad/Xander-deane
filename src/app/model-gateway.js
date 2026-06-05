import { CONTRACT_VERSION } from '../core/domain.js';
import { evaluateTutorSafety } from './consent-safety.js';
import { assertTutorContext } from './tutor-context.js';

export const MODEL_GATEWAY_MODES = Object.freeze(['synthetic_only']);

export function createSyntheticModelGateway({
  id = 'synthetic_model_gateway_reference',
  now = () => new Date().toISOString(),
  responseFactory = createDefaultSyntheticTutorResponse,
} = {}) {
  assertNonEmptyString(id, 'id');
  assertFunction(now, 'now');
  assertFunction(responseFactory, 'responseFactory');

  return Object.freeze({
    id,
    mode: 'synthetic_only',
    generateTutorResponse: (tutorContext, options = {}) => generateSyntheticTutorResponse({
      gatewayId: id,
      tutorContext,
      now,
      responseFactory,
      ...options,
    }),
  });
}

export function generateSyntheticTutorResponse({
  tutorContext,
  gatewayId = 'synthetic_model_gateway_reference',
  requestId = null,
  now = () => new Date().toISOString(),
  responseFactory = createDefaultSyntheticTutorResponse,
  detectedContentCategories = [],
  detectedEscalationTriggers = [],
  contractVersion = CONTRACT_VERSION,
} = {}) {
  assertTutorContext(tutorContext);
  assertNonEmptyString(gatewayId, 'gatewayId');
  assertOptionalString(requestId, 'requestId');
  assertFunction(now, 'now');
  assertFunction(responseFactory, 'responseFactory');
  assertStringArray(detectedContentCategories, 'detectedContentCategories');
  assertStringArray(detectedEscalationTriggers, 'detectedEscalationTriggers');
  assertNonEmptyString(contractVersion, 'contractVersion');
  assertSyntheticTutorContext(tutorContext);

  const generatedAt = now();
  assertDateTime(generatedAt, 'generatedAt');
  const policy = synthesizeSafetyPolicy(tutorContext);
  const consentRecord = synthesizeConsentRecord(tutorContext, generatedAt);
  const baseResponse = responseFactory({
    tutorContext,
    gatewayId,
    requestId,
    generatedAt,
    contractVersion,
  });
  assertTutorResponseShape(baseResponse);

  const safetyEvaluation = evaluateTutorSafety({
    tutorResponse: baseResponse,
    safetyPolicy: policy,
    consentRecord,
    requestedScopes: ['ai_tutoring'],
    detectedContentCategories,
    detectedEscalationTriggers,
    checkedAt: generatedAt,
    contractVersion,
  });

  const tutorResponse = safetyEvaluation.allowed
    ? decorateSafety(baseResponse, {
      gatewayId,
      generatedAt,
      safetyEvaluation,
      syntheticOnly: true,
    })
    : createSafetyRedirectResponse({
      tutorContext,
      gatewayId,
      requestId,
      generatedAt,
      safetyEvaluation,
      contractVersion,
    });

  return freezeJson({
    contractVersion,
    id: requestId ?? `model_call_${sanitizeIdPart(tutorContext.id)}_${sanitizeIdPart(generatedAt)}`,
    gatewayId,
    mode: 'synthetic_only',
    generatedAt,
    tutorContextId: tutorContext.id,
    tutorResponse,
    safetyEvaluation,
    metadata: {
      dataMode: tutorContext.metadata?.dataMode ?? null,
      syntheticOnly: true,
      provider: 'reference-synthetic',
      retainedPrompt: false,
      retainedProviderResponse: false,
    },
  });
}

export function assertSyntheticTutorContext(tutorContext) {
  assertTutorContext(tutorContext);
  if (tutorContext.metadata?.dataMode !== 'synthetic') {
    throw new RangeError('synthetic model gateway requires tutorContext.metadata.dataMode to equal "synthetic"');
  }
  if (!tutorContext.constraints?.mayCallAi) {
    throw new RangeError('synthetic model gateway requires tutorContext.constraints.mayCallAi to be true');
  }
  if (!tutorContext.consentSafetySummary?.activeScopes?.includes('ai_tutoring')) {
    throw new RangeError('synthetic model gateway requires active ai_tutoring consent in the tutor context summary');
  }
  return tutorContext;
}

function createDefaultSyntheticTutorResponse({ tutorContext, gatewayId, requestId, generatedAt, contractVersion }) {
  const evaluation = tutorContext.evaluationResult;
  const isCorrect = evaluation?.isCorrect === true;
  const hasAttempt = evaluation !== null;
  const feedbackType = !hasAttempt ? 'hint' : isCorrect ? 'encouragement' : 'hint';
  const nextAction = !hasAttempt ? 'continue' : isCorrect ? 'advance' : 'retry';
  const messageText = createSyntheticMessage({ tutorContext, hasAttempt, isCorrect });
  const highlightTargets = inferHighlightTargets(tutorContext);

  return {
    contractVersion,
    id: `msg_${sanitizeIdPart(requestId ?? tutorContext.id)}_${sanitizeIdPart(generatedAt)}`,
    sessionId: tutorContext.sessionId,
    problemId: tutorContext.problemId,
    locale: tutorContext.problem.locale ?? tutorContext.objective.locale ?? 'en-US',
    feedbackType,
    messageText,
    speechText: messageText,
    nextAction,
    highlightTargets,
    safety: {
      answerRevealed: false,
      confidence: 'medium',
      gatewayId,
      syntheticOnly: true,
      generatedAt,
    },
  };
}

function createSyntheticMessage({ tutorContext, hasAttempt, isCorrect }) {
  const prompt = tutorContext.problem.prompt;
  if (!hasAttempt) {
    return `Let's work on this step by step: ${prompt} Start by explaining what the problem is asking.`;
  }
  if (isCorrect) {
    return 'Nice work. Explain your strategy in one sentence so we can check that the idea makes sense.';
  }
  return 'Good effort. Look back at the workspace and check one small part at a time before trying again.';
}

function inferHighlightTargets(tutorContext) {
  const groups = tutorContext.workspaceSnapshot?.state?.groups;
  if (Array.isArray(groups)) {
    return groups.map((group) => group.id).filter((id) => typeof id === 'string');
  }
  const tokens = tutorContext.workspaceSnapshot?.state?.tokens;
  if (Array.isArray(tokens)) {
    return tokens.slice(0, 3).map((token) => token.id).filter((id) => typeof id === 'string');
  }
  return [];
}

function synthesizeSafetyPolicy(tutorContext) {
  const summary = tutorContext.consentSafetySummary;
  return {
    id: summary.safetyPolicyId ?? 'synthetic.safety.policy',
    learnerAgeBand: tutorContext.learnerProfile?.ageBand ?? 'unknown',
    blockedContentCategories: tutorContext.tutorPolicy?.blockedContentCategories ?? [
      'unsafe_advice',
      'shaming',
      'adult_content',
      'medical_or_legal_advice',
    ],
    escalationTriggers: ['self_harm', 'abuse_disclosure', 'medical_emergency', 'learner_distress', 'unsafe_advice_request', 'privacy_request'],
    aiAutonomyLevel: summary.aiAutonomyLevel ?? 'guided_only',
    requiresHumanEscalation: summary.requiresHumanEscalation ?? true,
  };
}

function synthesizeConsentRecord(tutorContext, generatedAt) {
  const activeScopes = tutorContext.consentSafetySummary?.activeScopes ?? [];
  return {
    id: `synthetic_consent_${sanitizeIdPart(tutorContext.id)}`,
    learnerId: tutorContext.learnerId ?? 'synthetic_learner',
    status: tutorContext.consentSafetySummary?.consentStatus === 'granted' ? 'granted' : 'pending',
    grantedScopes: activeScopes,
    deniedScopes: [],
    collectedAt: generatedAt,
    expiresAt: null,
    revokedAt: null,
  };
}

function decorateSafety(tutorResponse, safetyFields) {
  return {
    ...tutorResponse,
    safety: {
      ...tutorResponse.safety,
      ...safetyFields,
    },
  };
}

function createSafetyRedirectResponse({ tutorContext, gatewayId, requestId, generatedAt, safetyEvaluation, contractVersion }) {
  const messageText = 'I need to pause this response and ask a trusted adult or educator to review it before we continue.';
  return {
    contractVersion,
    id: `msg_safety_${sanitizeIdPart(requestId ?? tutorContext.id)}_${sanitizeIdPart(generatedAt)}`,
    sessionId: tutorContext.sessionId,
    problemId: tutorContext.problemId,
    locale: tutorContext.problem.locale ?? tutorContext.objective.locale ?? 'en-US',
    feedbackType: 'safety_redirect',
    messageText,
    speechText: messageText,
    nextAction: 'handoff',
    highlightTargets: [],
    safety: {
      answerRevealed: false,
      confidence: 'high',
      gatewayId,
      syntheticOnly: true,
      generatedAt,
      blockedReasons: safetyEvaluation.blockedReasons,
      requiredActions: safetyEvaluation.requiredActions,
    },
  };
}

function assertTutorResponseShape(tutorResponse) {
  assertPlainObject(tutorResponse, 'tutorResponse');
  ['contractVersion', 'id', 'sessionId', 'problemId', 'locale', 'feedbackType', 'messageText', 'speechText', 'nextAction'].forEach((field) => {
    assertNonEmptyString(tutorResponse[field], `tutorResponse.${field}`);
  });
  if (!Array.isArray(tutorResponse.highlightTargets)) {
    throw new TypeError('tutorResponse.highlightTargets must be an array');
  }
  assertPlainObject(tutorResponse.safety, 'tutorResponse.safety');
  if (typeof tutorResponse.safety.answerRevealed !== 'boolean') {
    throw new TypeError('tutorResponse.safety.answerRevealed must be a boolean');
  }
  assertNonEmptyString(tutorResponse.safety.confidence, 'tutorResponse.safety.confidence');
  return tutorResponse;
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time`);
  }
}

function assertFunction(value, fieldName) {
  if (typeof value !== 'function') {
    throw new TypeError(`${fieldName} must be a function`);
  }
}

function assertOptionalString(value, fieldName) {
  if (value === null || value === undefined) return;
  assertNonEmptyString(value, fieldName);
}

function assertStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${fieldName} must be an array of strings`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function sanitizeIdPart(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9._-]/g, '_');
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
