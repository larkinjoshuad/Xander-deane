import {
  CONTRACT_VERSION,
  createInteractionEvent,
  createTutorResponse,
} from '../core/domain.js';
import {
  createSubjectPack,
  createWorkspaceDescriptor,
  evaluateSubjectProblem,
} from '../core/subject-pack.js';

const WORKSPACE_COMPONENTS = Object.freeze({
  'equal-groups': 'EqualGroupsWorkspace',
  'token-selection': 'TokenSelectionWorkspace',
  'classification-sort': 'ClassificationSortWorkspace',
});

export function createTutorPolicyForProblem({ problem, gradeBand = 'elementary' }) {
  if (problem.workspace.kind === 'token-selection') {
    return createTokenSelectionTutorPolicy({ locale: problem.locale, gradeBand });
  }
  if (problem.workspace.kind === 'classification-sort') {
    return createClassificationSortTutorPolicy({ locale: problem.locale, gradeBand });
  }
  return createEqualGroupsTutorPolicy({ locale: problem.locale, gradeBand });
}

export function createEqualGroupsTutorPolicy({
  id = 'policy.math.equal-groups.elementary',
  locale = 'en-US',
  gradeBand = 'elementary',
} = {}) {
  return createTutorPolicy({
    id,
    subject: 'math',
    locale,
    gradeBand,
    answerReveal: 'after_correct_or_explicit_request',
    hintLevels: [
      { level: 1, strategy: 'check_groups', mayRevealAnswer: false },
      { level: 2, strategy: 'count_each_group', mayRevealAnswer: false },
      { level: 3, strategy: 'count_all_counters', mayRevealAnswer: false },
    ],
    allowedModalities: ['text', 'audio', 'touch', 'manipulative'],
  });
}

export function createTokenSelectionTutorPolicy({
  id = 'policy.language.token-selection.elementary',
  locale = 'en-US',
  gradeBand = 'elementary',
} = {}) {
  return createTutorPolicy({
    id,
    subject: 'language',
    locale,
    gradeBand,
    answerReveal: 'after_correct_or_explicit_request',
    hintLevels: [
      { level: 1, strategy: 'read_sentence', mayRevealAnswer: false },
      { level: 2, strategy: 'look_for_action', mayRevealAnswer: false },
      { level: 3, strategy: 'try_each_word', mayRevealAnswer: false },
    ],
    allowedModalities: ['text', 'audio', 'touch'],
  });
}

export function createClassificationSortTutorPolicy({
  id = 'policy.science.classification-sort.elementary',
  locale = 'en-US',
  gradeBand = 'elementary',
} = {}) {
  return createTutorPolicy({
    id,
    subject: 'science',
    locale,
    gradeBand,
    answerReveal: 'after_correct_or_explicit_request',
    hintLevels: [
      { level: 1, strategy: 'identify_trait', mayRevealAnswer: false },
      { level: 2, strategy: 'sort_matching_items', mayRevealAnswer: false },
      { level: 3, strategy: 'check_each_group', mayRevealAnswer: false },
    ],
    allowedModalities: ['text', 'audio', 'touch', 'manipulative'],
  });
}

export function createLearningSubjectPack({ objective, problem, tutorPolicy = createTutorPolicyForProblem({ problem }) }) {
  return createSubjectPack({
    id: `${problem.subject}.${problem.workspace.kind}.pack`,
    subject: problem.subject,
    objectives: [objective],
    problems: [problem],
    evaluators: {
      [problem.workspace.kind]: createEvaluatorForWorkspaceKind(problem.workspace.kind),
    },
    workspaceRenderers: {
      [problem.workspace.kind]: ({ problem: packProblem }) => ({
        component: WORKSPACE_COMPONENTS[packProblem.workspace.kind] ?? 'GenericWorkspace',
        props: createWorkspaceProps(packProblem),
      }),
    },
    tutorPolicies: tutorPolicy,
  });
}

export function createEqualGroupsSubjectPack({ objective, problem, tutorPolicy = createEqualGroupsTutorPolicy() }) {
  return createLearningSubjectPack({ objective, problem, tutorPolicy });
}

export function createInitialLearningSession({
  sessionId,
  learnerId = null,
  objective,
  problem,
  now = () => new Date().toISOString(),
}) {
  const resolvedSessionId = sessionId ?? `ses_demo_${problem.subject}_${problem.workspace.kind}_001`;
  const tutorPolicy = createTutorPolicyForProblem({ problem });
  const subjectPack = createLearningSubjectPack({ objective, problem, tutorPolicy });
  const workspaceDescriptor = createWorkspaceDescriptor(subjectPack, problem.id);
  const workspaceSnapshot = createInitialWorkspaceSnapshot({ sessionId: resolvedSessionId, problem, now });
  const tutorResponse = createTutorResponse({
    id: 'msg_initial_guidance',
    sessionId: resolvedSessionId,
    problemId: problem.id,
    feedbackType: 'question',
    messageText: createInitialTutorMessage(problem),
    nextAction: 'continue',
    highlightTargets: getInitialHighlightTargets(problem),
  });
  const initialEvent = createInteractionEvent({
    id: createEventId('evt_problem_presented', 1),
    sessionId: resolvedSessionId,
    learnerId,
    problemId: problem.id,
    type: 'problem_presented',
    occurredAt: now(),
    modality: 'text',
    payload: { prompt: problem.prompt, workspaceKind: problem.workspace.kind },
  });

  return freezeSession({
    contractVersion: CONTRACT_VERSION,
    sessionId: resolvedSessionId,
    learnerId,
    subjectPack,
    problem,
    workspaceDescriptor,
    workspaceSnapshot,
    tutorPolicy,
    tutorResponse,
    events: [initialEvent],
    selectedCounterId: null,
    evaluation: null,
  });
}

export function selectCounter(session, counterId) {
  assertWorkspaceKind(session, 'equal-groups');
  assertCounterExists(session.workspaceSnapshot, counterId);
  return freezeSession({
    ...session,
    selectedCounterId: counterId,
  });
}

export function placeSelectedCounter(session, groupId, now = () => new Date().toISOString()) {
  assertWorkspaceKind(session, 'equal-groups');
  if (!session.selectedCounterId) {
    return session;
  }
  assertGroupExists(session.workspaceSnapshot, groupId);

  const movedCounterId = session.selectedCounterId;
  const workspaceSnapshot = moveCounterToGroup(session.workspaceSnapshot, movedCounterId, groupId, now);
  const interactionEvent = createInteractionEvent({
    id: createEventId('evt_user_dragged', session.events.length + 1),
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    problemId: session.problem.id,
    type: 'user_dragged',
    occurredAt: now(),
    modality: 'touch',
    payload: { counterId: movedCounterId, to: groupId, workspaceSnapshotId: workspaceSnapshot.id },
  });

  return freezeSession({
    ...session,
    selectedCounterId: null,
    workspaceSnapshot,
    events: [...session.events, interactionEvent],
  });
}

export function selectToken(session, tokenIndex, now = () => new Date().toISOString()) {
  assertWorkspaceKind(session, 'token-selection');
  assertTokenIndexExists(session.workspaceSnapshot, tokenIndex);

  const workspaceSnapshot = selectTokenInSnapshot(session.workspaceSnapshot, tokenIndex, now);
  const selectedToken = workspaceSnapshot.state.tokens[tokenIndex];
  const interactionEvent = createInteractionEvent({
    id: createEventId('evt_user_selected', session.events.length + 1),
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    problemId: session.problem.id,
    type: 'user_selected',
    occurredAt: now(),
    modality: 'touch',
    payload: { tokenIndex, selectedToken, workspaceSnapshotId: workspaceSnapshot.id },
  });

  return freezeSession({
    ...session,
    workspaceSnapshot,
    events: [...session.events, interactionEvent],
  });
}

export function selectSortItem(session, itemId) {
  assertWorkspaceKind(session, 'classification-sort');
  assertSortItemExists(session.workspaceSnapshot, itemId);

  return freezeSession({
    ...session,
    workspaceSnapshot: selectSortItemInSnapshot(session.workspaceSnapshot, itemId),
  });
}

export function placeSelectedSortItem(session, groupId, now = () => new Date().toISOString()) {
  assertWorkspaceKind(session, 'classification-sort');
  const selectedItemId = session.workspaceSnapshot.state.selectedItemId;
  if (!selectedItemId) {
    return session;
  }
  assertGroupExists(session.workspaceSnapshot, groupId);

  const workspaceSnapshot = moveSortItemToGroup(session.workspaceSnapshot, selectedItemId, groupId, now);
  const interactionEvent = createInteractionEvent({
    id: createEventId('evt_user_dragged', session.events.length + 1),
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    problemId: session.problem.id,
    type: 'user_dragged',
    occurredAt: now(),
    modality: 'touch',
    payload: { itemId: selectedItemId, to: groupId, workspaceSnapshotId: workspaceSnapshot.id },
  });

  return freezeSession({
    ...session,
    workspaceSnapshot,
    events: [...session.events, interactionEvent],
  });
}

export function resetWorkspace(session, now = () => new Date().toISOString()) {
  const workspaceSnapshot = createInitialWorkspaceSnapshot({
    sessionId: session.sessionId,
    problem: session.problem,
    now,
  });
  const resetEvent = createInteractionEvent({
    id: createEventId('evt_workspace_reset', session.events.length + 1),
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    problemId: session.problem.id,
    type: 'workspace_reset',
    occurredAt: now(),
    modality: 'touch',
    payload: { workspaceSnapshotId: workspaceSnapshot.id },
  });

  return freezeSession({
    ...session,
    selectedCounterId: null,
    workspaceSnapshot,
    evaluation: null,
    tutorResponse: createTutorResponse({
      id: createEventId('msg_reset', session.events.length + 1),
      sessionId: session.sessionId,
      problemId: session.problem.id,
      feedbackType: 'encouragement',
      messageText: 'Workspace reset. Try the problem again.',
      nextAction: 'continue',
      highlightTargets: getInitialHighlightTargets(session.problem),
    }),
    events: [...session.events, resetEvent],
  });
}

export function checkWorkspaceAnswer(session, now = () => new Date().toISOString()) {
  const evaluatedAt = now();
  const answer = workspaceSnapshotToAnswer(session.workspaceSnapshot);
  const rawEvaluation = evaluateSubjectProblem(session.subjectPack, session.problem.id, answer, {
    workspaceSnapshot: session.workspaceSnapshot,
  });
  const evaluation = createEvaluationResult({
    id: createEventId('eval_answer_checked', session.events.length + 1),
    session,
    rawEvaluation,
    answer,
    evaluatedAt,
  });
  const answerEvent = createInteractionEvent({
    id: createEventId('evt_answer_checked', session.events.length + 1),
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    problemId: session.problem.id,
    type: 'answer_checked',
    occurredAt: evaluatedAt,
    modality: 'touch',
    payload: createAnswerCheckedPayload(evaluation),
  });
  const tutorResponse = createTutorResponse({
    id: createEventId('msg_feedback', session.events.length + 1),
    sessionId: session.sessionId,
    problemId: session.problem.id,
    feedbackType: evaluation.isCorrect ? 'summary' : 'hint',
    messageText: createFeedbackMessage({ problem: session.problem, evaluation }),
    nextAction: evaluation.isCorrect ? 'advance' : 'retry',
    highlightTargets: getFeedbackHighlightTargets(session.problem, evaluation),
    safety: {
      answerRevealed: shouldRevealAnswer({ evaluation, tutorPolicy: session.tutorPolicy }),
      confidence: 'high',
    },
  });

  return freezeSession({
    ...session,
    evaluation,
    tutorResponse,
    events: [...session.events, answerEvent],
  });
}

export function createEvaluationResult({ id, session, rawEvaluation, answer, evaluatedAt }) {
  return freezeJson({
    contractVersion: CONTRACT_VERSION,
    id,
    sessionId: session.sessionId,
    problemId: session.problem.id,
    workspaceSnapshotId: session.workspaceSnapshot.id,
    evaluatorId: rawEvaluation.evaluatorId,
    isCorrect: rawEvaluation.isCorrect,
    feedbackCode: rawEvaluation.feedbackCode,
    submittedAnswer: rawEvaluation.submittedAnswer ?? answer,
    expectedAnswer: rawEvaluation.expectedAnswer,
    confidence: 'high',
    diagnostics: createEvaluationDiagnostics(rawEvaluation),
    evaluatedAt,
  });
}

export function workspaceSnapshotToAnswer(workspaceSnapshot) {
  if (workspaceSnapshot.kind === 'token-selection') {
    const selectedTokenIndex = workspaceSnapshot.state.selectedTokenIndex;
    return freezeJson({
      selectedTokenIndex,
      selectedToken: selectedTokenIndex === null ? null : workspaceSnapshot.state.tokens[selectedTokenIndex],
    });
  }

  return freezeJson({
    groups: workspaceSnapshot.state.groups.map((group) => ({
      id: group.id,
      items: [...group.items],
    })),
  });
}

function createTutorPolicy({
  id,
  subject,
  locale,
  gradeBand,
  answerReveal,
  hintLevels,
  allowedModalities,
}) {
  return freezeJson({
    contractVersion: CONTRACT_VERSION,
    id,
    subject,
    locale,
    gradeBand,
    answerReveal,
    maxHintLevel: hintLevels.length,
    hintLevels,
    allowedFeedbackTypes: [
      'encouragement',
      'hint',
      'correction',
      'explanation',
      'question',
      'summary',
      'safety_redirect',
    ],
    allowedModalities,
    safety: {
      allowEscalation: true,
      handoffTriggers: ['learner_distress', 'repeated_frustration'],
      blockedBehaviors: ['shaming', 'unsafe_advice', 'unbounded_answer_reveal'],
    },
  });
}

function createEvaluatorForWorkspaceKind(workspaceKind) {
  if (workspaceKind === 'token-selection') {
    return ({ problem, answer }) => {
      const selectedToken = answer.selectedToken ?? null;
      const isCorrect = normalizeAnswer(selectedToken) === normalizeAnswer(problem.expectedAnswer);
      return {
        isCorrect,
        submittedAnswer: answer,
        selectedToken,
        selectedTokenIndex: answer.selectedTokenIndex,
      };
    };
  }

  if (workspaceKind === 'classification-sort') {
    return ({ problem, answer }) => {
      const targetGroupId = problem.workspace.state.targetGroupId ?? problem.workspace.state.groups[0];
      const expectedItems = sortStrings(problem.expectedAnswer);
      const groups = answer.groups ?? [];
      const targetGroup = groups.find((group) => group.id === targetGroupId) ?? { id: targetGroupId, items: [] };
      const sortedItems = sortStrings(targetGroup.items);
      const misplacedItems = sortedItems.filter((itemId) => !expectedItems.includes(itemId));
      const missingItems = expectedItems.filter((itemId) => !sortedItems.includes(itemId));
      const isCorrect = misplacedItems.length === 0 && missingItems.length === 0;

      return {
        isCorrect,
        submittedAnswer: answer,
        expectedAnswer: expectedItems,
        targetGroup: targetGroupId,
        sortedItems,
        misplacedItems,
        missingItems,
      };
    };
  }

  return ({ problem, answer }) => {
    const requiredGroups = problem.workspace.state.groupsRequired;
    const itemsPerGroup = problem.workspace.state.itemsPerGroup;
    const groups = answer.groups ?? [];
    const groupSizes = groups.map((group) => group.items.length);
    const totalCounters = groupSizes.reduce((total, groupSize) => total + groupSize, 0);
    const isCorrect =
      groupSizes.length === requiredGroups &&
      groupSizes.every((groupSize) => groupSize === itemsPerGroup);

    return {
      isCorrect,
      submittedAnswer: answer,
      groupSizes,
      totalCounters,
      missingGroups: Math.max(requiredGroups - groupSizes.filter((size) => size > 0).length, 0),
    };
  };
}

function createWorkspaceProps(problem) {
  if (problem.workspace.kind === 'token-selection') {
    return {
      prompt: problem.prompt,
      tokens: problem.workspace.state.tokens,
      selectableTokenIndexes: problem.workspace.state.selectableTokenIndexes,
    };
  }

  if (problem.workspace.kind === 'classification-sort') {
    return {
      prompt: problem.prompt,
      items: problem.workspace.state.items,
      groups: problem.workspace.state.groups,
      targetGroupId: problem.workspace.state.targetGroupId ?? problem.workspace.state.groups[0],
    };
  }

  return {
    prompt: problem.prompt,
    groupsRequired: problem.workspace.state.groupsRequired,
    itemsPerGroup: problem.workspace.state.itemsPerGroup,
    availableCounters: problem.workspace.state.availableCounters,
    groupIds: problem.workspace.state.groupIds,
  };
}

function createInitialTutorMessage(problem) {
  if (problem.workspace.kind === 'token-selection') {
    return 'Read the sentence and tap the word that shows the action.';
  }
  if (problem.workspace.kind === 'classification-sort') {
    const targetGroupId = problem.workspace.state.targetGroupId ?? problem.workspace.state.groups[0];
    return `Sort each item by its trait. Put matching items in the ${formatWorkspaceLabel(targetGroupId)} group.`;
  }
  return `Let's build ${problem.workspace.state.groupsRequired} groups with ${problem.workspace.state.itemsPerGroup} counters in each group. Tap a counter, then tap a group.`;
}

function getInitialHighlightTargets(problem) {
  if (problem.workspace.kind === 'token-selection') {
    return problem.workspace.state.selectableTokenIndexes.map((index) => `token_${index}`);
  }
  if (problem.workspace.kind === 'classification-sort') {
    return problem.workspace.state.groups;
  }
  return problem.workspace.state.groupIds;
}

function createAnswerCheckedPayload(evaluation) {
  return {
    evaluationResultId: evaluation.id,
    workspaceSnapshotId: evaluation.workspaceSnapshotId,
    isCorrect: evaluation.isCorrect,
    ...evaluation.diagnostics,
  };
}

function createFeedbackMessage({ problem, evaluation }) {
  if (problem.workspace.kind === 'token-selection') {
    if (evaluation.isCorrect) {
      return `Correct. "${evaluation.diagnostics.selectedToken}" is the action verb.`;
    }
    if (!evaluation.diagnostics.selectedToken) {
      return 'Try tapping one word in the sentence before checking your answer.';
    }
    return `"${evaluation.diagnostics.selectedToken}" is not the action verb. Look for the word that shows what someone or something does.`;
  }

  if (problem.workspace.kind === 'classification-sort') {
    if (evaluation.isCorrect) {
      return `Correct. ${formatList(evaluation.diagnostics.sortedItems)} belong in ${formatWorkspaceLabel(evaluation.diagnostics.targetGroup)}.`;
    }
    const missing = formatList(evaluation.diagnostics.missingItems);
    const misplaced = formatList(evaluation.diagnostics.misplacedItems);
    return `Check the trait again. Missing from ${formatWorkspaceLabel(evaluation.diagnostics.targetGroup)}: ${missing || 'none'}. Misplaced there: ${misplaced || 'none'}.`;
  }

  return evaluation.isCorrect
    ? `Great work. You made ${evaluation.diagnostics.groupSizes.length} groups of ${problem.workspace.state.itemsPerGroup}, so there are ${evaluation.diagnostics.totalCounters} counters in all.`
    : `You're close. Your group sizes are ${evaluation.diagnostics.groupSizes.join(', ') || 'empty'}. Each group needs exactly ${problem.workspace.state.itemsPerGroup} counters.`;
}

function getFeedbackHighlightTargets(problem, evaluation) {
  if (problem.workspace.kind === 'token-selection') {
    if (evaluation.isCorrect) return [`token_${evaluation.diagnostics.selectedTokenIndex}`];
    return problem.workspace.state.selectableTokenIndexes.map((index) => `token_${index}`);
  }
  if (problem.workspace.kind === 'classification-sort') {
    return [evaluation.diagnostics.targetGroup ?? problem.workspace.state.groups[0]];
  }
  return problem.workspace.state.groupIds;
}

function createEvaluationDiagnostics(rawEvaluation) {
  if (Object.hasOwn(rawEvaluation, 'selectedToken')) {
    return {
      selectedToken: rawEvaluation.selectedToken,
      selectedTokenIndex: rawEvaluation.selectedTokenIndex,
    };
  }

  if (Object.hasOwn(rawEvaluation, 'targetGroup')) {
    return {
      targetGroup: rawEvaluation.targetGroup,
      sortedItems: rawEvaluation.sortedItems ?? [],
      missingItems: rawEvaluation.missingItems ?? [],
      misplacedItems: rawEvaluation.misplacedItems ?? [],
    };
  }

  return {
    groupSizes: rawEvaluation.groupSizes ?? [],
    totalCounters: rawEvaluation.totalCounters ?? 0,
    missingGroups: rawEvaluation.missingGroups ?? 0,
  };
}

function createInitialWorkspaceSnapshot({ sessionId, problem, now }) {
  if (problem.workspace.kind === 'token-selection') {
    return freezeJson({
      contractVersion: CONTRACT_VERSION,
      id: `snapshot_${sessionId}_001`,
      sessionId,
      problemId: problem.id,
      kind: problem.workspace.kind,
      version: 1,
      updatedAt: now(),
      state: {
        tokens: problem.workspace.state.tokens,
        selectableTokenIndexes: problem.workspace.state.selectableTokenIndexes,
        selectedTokenIndex: null,
      },
      metadata: { source: 'learning-session' },
    });
  }

  if (problem.workspace.kind === 'classification-sort') {
    return freezeJson({
      contractVersion: CONTRACT_VERSION,
      id: `snapshot_${sessionId}_001`,
      sessionId,
      problemId: problem.id,
      kind: problem.workspace.kind,
      version: 1,
      updatedAt: now(),
      state: {
        items: problem.workspace.state.items.map((itemId) => ({ id: itemId, groupId: null })),
        groups: problem.workspace.state.groups.map((groupId) => ({ id: groupId, items: [] })),
        selectedItemId: null,
      },
      metadata: { source: 'learning-session' },
    });
  }

  const counterCount = problem.workspace.state.availableCounters;
  const counters = Array.from({ length: counterCount }, (_, index) => ({
    id: `counter_${index + 1}`,
    groupId: null,
  }));
  const groups = problem.workspace.state.groupIds.map((groupId) => ({ id: groupId, items: [] }));

  return freezeJson({
    contractVersion: CONTRACT_VERSION,
    id: `snapshot_${sessionId}_001`,
    sessionId,
    problemId: problem.id,
    kind: problem.workspace.kind,
    version: 1,
    updatedAt: now(),
    state: { counters, groups },
    metadata: { source: 'learning-session' },
  });
}

function moveCounterToGroup(workspaceSnapshot, counterId, groupId, now) {
  const counters = workspaceSnapshot.state.counters.map((counter) =>
    counter.id === counterId ? { ...counter, groupId } : counter,
  );
  const groups = workspaceSnapshot.state.groups.map((group) => ({
    ...group,
    items: group.items.filter((itemId) => itemId !== counterId),
  }));
  const destinationGroup = groups.find((group) => group.id === groupId);
  destinationGroup.items.push(counterId);

  return freezeJson({
    ...workspaceSnapshot,
    version: workspaceSnapshot.version + 1,
    updatedAt: now(),
    state: { counters, groups },
  });
}

function selectTokenInSnapshot(workspaceSnapshot, tokenIndex, now) {
  return freezeJson({
    ...workspaceSnapshot,
    version: workspaceSnapshot.version + 1,
    updatedAt: now(),
    state: {
      ...workspaceSnapshot.state,
      selectedTokenIndex: tokenIndex,
    },
  });
}

function selectSortItemInSnapshot(workspaceSnapshot, itemId) {
  return freezeJson({
    ...workspaceSnapshot,
    state: {
      ...workspaceSnapshot.state,
      selectedItemId: itemId,
    },
  });
}

function moveSortItemToGroup(workspaceSnapshot, itemId, groupId, now) {
  const items = workspaceSnapshot.state.items.map((item) =>
    item.id === itemId ? { ...item, groupId } : item,
  );
  const groups = workspaceSnapshot.state.groups.map((group) => ({
    ...group,
    items: group.items.filter((groupItemId) => groupItemId !== itemId),
  }));
  const destinationGroup = groups.find((group) => group.id === groupId);
  destinationGroup.items.push(itemId);

  return freezeJson({
    ...workspaceSnapshot,
    version: workspaceSnapshot.version + 1,
    updatedAt: now(),
    state: { items, groups, selectedItemId: null },
  });
}

function shouldRevealAnswer({ evaluation, tutorPolicy }) {
  if (tutorPolicy.answerReveal === 'never') return false;
  if (tutorPolicy.answerReveal === 'after_correct') return evaluation.isCorrect;
  if (tutorPolicy.answerReveal === 'after_correct_or_explicit_request') return evaluation.isCorrect;
  return false;
}

function assertWorkspaceKind(session, workspaceKind) {
  if (session.workspaceSnapshot.kind !== workspaceKind) {
    throw new RangeError(`workspace kind must be ${workspaceKind}`);
  }
}

function assertCounterExists(workspaceSnapshot, counterId) {
  if (!workspaceSnapshot.state.counters.some((counter) => counter.id === counterId)) {
    throw new RangeError(`counterId ${counterId} does not exist in workspace snapshot`);
  }
}

function assertGroupExists(workspaceSnapshot, groupId) {
  if (!workspaceSnapshot.state.groups.some((group) => group.id === groupId)) {
    throw new RangeError(`groupId ${groupId} does not exist in workspace snapshot`);
  }
}

function assertTokenIndexExists(workspaceSnapshot, tokenIndex) {
  if (!workspaceSnapshot.state.selectableTokenIndexes.includes(tokenIndex)) {
    throw new RangeError(`tokenIndex ${tokenIndex} is not selectable`);
  }
}

function assertSortItemExists(workspaceSnapshot, itemId) {
  if (!workspaceSnapshot.state.items.some((item) => item.id === itemId)) {
    throw new RangeError(`itemId ${itemId} does not exist in workspace snapshot`);
  }
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function formatList(values) {
  return values.map(formatWorkspaceLabel).join(', ');
}

function formatWorkspaceLabel(value) {
  return String(value).replaceAll('_', ' ');
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');
}

function createEventId(prefix, index) {
  return `${prefix}_${String(index).padStart(3, '0')}`;
}

function freezeSession(session) {
  return Object.freeze({
    ...session,
    events: Object.freeze([...session.events]),
  });
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
