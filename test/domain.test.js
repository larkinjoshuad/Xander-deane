import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTRACT_VERSION,
  createInteractionEvent,
  createLearningObjective,
  createProblem,
  createTutorResponse,
  evaluateAnswer,
} from '../src/core/domain.js';

test('creates subject-agnostic learning objectives without mutating caller data', () => {
  const tags = ['visual'];
  const objective = createLearningObjective({
    id: 'math.multiplication.groups',
    subject: 'math',
    title: 'Understand multiplication as equal groups',
    tags,
  });

  assert.equal(objective.contractVersion, CONTRACT_VERSION);
  assert.equal(objective.subject, 'math');
  assert.equal(objective.locale, 'en-US');
  assert.deepEqual(objective.tags, ['visual']);
  assert.throws(() => {
    objective.title = 'mutated';
  }, TypeError);

  tags.push('caller-owned');
  assert.deepEqual(objective.tags, ['visual']);
});

test('creates problems across subjects and evaluates normalized answers', () => {
  const problem = createProblem({
    id: 'math.3x4.visual-groups',
    objectiveId: 'math.multiplication.groups',
    subject: 'math',
    prompt: 'Build 3 groups of 4. How many counters are there?',
    expectedAnswer: 12,
    acceptableAnswers: ['twelve'],
    interactionModes: ['text', 'touch', 'manipulative', 'audio'],
  });

  assert.equal(evaluateAnswer(problem, '  Twelve ').isCorrect, true);
  assert.equal(evaluateAnswer(problem, '11').isCorrect, false);
});

test('normalizes unicode compatibility characters for language-portable answer checks', () => {
  const problem = createProblem({
    id: 'language.fullwidth.answer',
    objectiveId: 'language.character.normalization',
    subject: 'language',
    prompt: 'Type ABC using standard letters.',
    expectedAnswer: 'ABC',
    acceptableAnswers: [],
  });

  assert.equal(evaluateAnswer(problem, 'ＡＢＣ').isCorrect, true);
});

test('captures multimodal interaction events with trace metadata', () => {
  const event = createInteractionEvent({
    id: 'evt_001',
    sessionId: 'ses_001',
    learnerId: 'learner_001',
    problemId: 'math.3x4.visual-groups',
    type: 'user_dragged',
    modality: 'touch',
    payload: { counterId: 'counter_7', groupId: 'group_2' },
    trace: { region: 'iad', requestId: 'req_001' },
  });

  assert.equal(event.type, 'user_dragged');
  assert.equal(event.learnerId, 'learner_001');
  assert.equal(event.trace.region, 'iad');
});

test('defaults learnerId to null for schema-compatible anonymous events', () => {
  const event = createInteractionEvent({
    id: 'evt_anon',
    sessionId: 'ses_001',
    problemId: 'science.sort.animals',
    type: 'user_selected',
  });

  assert.equal(event.learnerId, null);
});

test('creates structured tutor responses for UI, voice, and safety controls', () => {
  const response = createTutorResponse({
    id: 'msg_001',
    sessionId: 'ses_001',
    problemId: 'math.3x4.visual-groups',
    feedbackType: 'hint',
    messageText: 'Try checking whether every group has exactly four counters.',
    highlightTargets: ['group_1', 'group_2', 'group_3'],
  });

  assert.equal(response.speechText, response.messageText);
  assert.deepEqual(response.highlightTargets, ['group_1', 'group_2', 'group_3']);
  assert.equal(response.safety.answerRevealed, false);
});

test('rejects invalid enums and non-json payloads before they cross service boundaries', () => {
  assert.throws(() => {
    createTutorResponse({
      id: 'msg_bad',
      sessionId: 'ses_001',
      problemId: 'math.3x4.visual-groups',
      feedbackType: 'answer_dump',
      messageText: 'The answer is 12.',
    });
  }, RangeError);

  assert.throws(() => {
    createInteractionEvent({
      id: 'evt_bad',
      sessionId: 'ses_001',
      problemId: 'math.3x4.visual-groups',
      type: 'user_typed',
      payload: { callback: () => undefined },
    });
  }, TypeError);

  const circular = [];
  circular.push(circular);
  assert.throws(() => {
    createInteractionEvent({
      id: 'evt_circular',
      sessionId: 'ses_001',
      problemId: 'math.3x4.visual-groups',
      type: 'user_typed',
      payload: { circular },
    });
  }, TypeError);
});
