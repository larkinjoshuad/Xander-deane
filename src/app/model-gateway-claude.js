import { CONTRACT_VERSION } from '../core/domain.js';
import { assertTutorContext } from './tutor-context.js';
import { createSyntheticModelGateway, finalizeTutorResponse } from './model-gateway.js';

/**
 * Claude-backed tutor model gateway.
 *
 * Produces real, adaptive tutor messages from a tutor context and runs them
 * through the exact same consent/safety pipeline as the reference synthetic
 * gateway (`finalizeTutorResponse`). The model only generates the teaching
 * fields; identifiers, the model-call envelope, and safety enforcement are
 * added deterministically afterward.
 *
 * The model never receives or returns learner PII — only the synthetic problem
 * context — and prompts are not retained (`metadata.retainedPrompt: false`).
 *
 * This module is server-only: the API key must never reach the browser. Call
 * it from a backend endpoint (e.g. the session API server), not the client
 * shell.
 */

const DEFAULT_MODEL = 'claude-opus-4-7';

// Structured-output schema for the model. Excludes `safety_redirect` /
// `handoff` — those are policy-driven and only the safety pipeline may emit
// them, never the model itself.
export const TUTOR_TEACHING_FORMAT = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'feedbackType',
    'messageText',
    'speechText',
    'nextAction',
    'highlightTargets',
    'answerRevealed',
    'confidence',
  ],
  properties: {
    feedbackType: {
      type: 'string',
      enum: ['encouragement', 'hint', 'correction', 'explanation', 'question', 'summary'],
    },
    messageText: { type: 'string' },
    speechText: { type: 'string' },
    nextAction: {
      type: 'string',
      enum: ['continue', 'retry', 'show_example', 'advance', 'pause'],
    },
    highlightTargets: { type: 'array', items: { type: 'string' } },
    answerRevealed: { type: 'boolean' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
});

export function buildTutorSystemPrompt() {
  return [
    'You are a patient, warm tutor helping a homeschooling parent teach a child.',
    'You speak directly to the child in short, encouraging, age-appropriate language.',
    '',
    'Rules you must always follow:',
    '- Guide with one small next step. Never do the whole problem for the child.',
    '- If "May reveal answer" is false, you must NOT state the final answer; set answerRevealed to false.',
    '  Only set answerRevealed to true when explicitly allowed AND you intentionally show the answer.',
    '- Keep messageText to 1-2 short sentences a young learner can read.',
    '- speechText is the same message phrased for text-to-speech (no symbols or markup).',
    '- Choose feedbackType and nextAction that fit the situation:',
    '  no attempt yet -> usually a hint/question and nextAction "continue";',
    '  correct -> encouragement/summary and "advance";',
    '  incorrect -> hint/correction and "retry".',
    '- highlightTargets may list workspace element ids to draw attention to (or be empty).',
    '- Never include unsafe, scary, medical, legal, or shaming content. Be kind.',
    '',
    'Respond ONLY with the structured object the caller requested.',
  ].join('\n');
}

export function buildTutorUserContent(tutorContext) {
  const evaluation = tutorContext.evaluationResult ?? null;
  const attempt = evaluation === null
    ? 'No attempt yet — this is the first guidance for the problem.'
    : evaluation.isCorrect === true
      ? 'The child just answered correctly.'
      : 'The child just answered incorrectly.';
  const mayReveal = mayRevealAnswer(tutorContext, evaluation);
  const targets = collectHighlightTargets(tutorContext);

  const lines = [
    `Subject: ${tutorContext.problem?.subject ?? tutorContext.objective?.subject ?? 'unknown'}`,
    `Learning objective: ${tutorContext.objective?.title ?? tutorContext.objective?.id ?? 'unknown'}`,
    `Learner age band: ${tutorContext.learnerProfile?.ageBand ?? 'unknown'}`,
    `Problem: ${tutorContext.problem?.prompt ?? '(no prompt)'}`,
    `Attempt status: ${attempt}`,
    `May reveal answer: ${mayReveal ? 'true' : 'false'}`,
  ];
  if (evaluation?.diagnostics) {
    lines.push(`Evaluator diagnostics: ${JSON.stringify(evaluation.diagnostics)}`);
  }
  if (targets.length > 0) {
    lines.push(`Highlightable workspace ids: ${targets.join(', ')}`);
  }
  lines.push('', 'Write the next tutor message for this child.');
  return lines.join('\n');
}

export function createClaudeModelGateway({
  client,
  clientFactory,
  model = DEFAULT_MODEL,
  gatewayId = `claude_model_gateway_${sanitizeIdPart(model)}`,
  now = () => new Date().toISOString(),
  effort = 'medium',
  maxTokens = 1024,
  fallbackGateway = null,
} = {}) {
  if (!client && typeof clientFactory !== 'function') {
    throw new TypeError('createClaudeModelGateway requires a `client` or a `clientFactory`');
  }
  let resolvedClient = client ?? null;

  async function getClient() {
    if (!resolvedClient) {
      resolvedClient = await clientFactory();
    }
    return resolvedClient;
  }

  async function generateTutorResponse(tutorContext, options = {}) {
    assertTutorContext(tutorContext);
    const {
      requestId = null,
      detectedContentCategories = [],
      detectedEscalationTriggers = [],
      contractVersion = CONTRACT_VERSION,
    } = options;
    const generatedAt = now();

    try {
      const activeClient = await getClient();
      const response = await activeClient.messages.parse({
        model,
        max_tokens: maxTokens,
        system: [
          { type: 'text', text: buildTutorSystemPrompt(), cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: buildTutorUserContent(tutorContext) }],
        output_config: {
          format: { type: 'json_schema', schema: TUTOR_TEACHING_FORMAT },
          effort,
        },
      });

      const teaching = response?.parsed_output;
      if (!teaching) {
        throw new Error('tutor model returned no structured output');
      }

      const baseResponse = mapTeachingToBaseResponse({
        teaching,
        tutorContext,
        requestId,
        generatedAt,
        contractVersion,
      });

      return finalizeTutorResponse({
        tutorContext,
        baseResponse,
        gatewayId,
        requestId,
        generatedAt,
        mode: 'live_model',
        provider: `anthropic:${model}`,
        syntheticOnly: false,
        detectedContentCategories,
        detectedEscalationTriggers,
        contractVersion,
      });
    } catch (error) {
      if (fallbackGateway) {
        return fallbackGateway.generateTutorResponse(tutorContext, options);
      }
      throw error;
    }
  }

  return Object.freeze({ id: gatewayId, mode: 'live_model', model, generateTutorResponse });
}

/**
 * Selects the right gateway for the current environment: a Claude-backed
 * gateway when a client or API key is available, otherwise the deterministic
 * synthetic gateway. The synthetic gateway is always wired up as the fallback
 * so a transient API failure still yields a (safe, generic) tutor response.
 */
export function createTutorGateway({
  apiKey = readEnv('ANTHROPIC_API_KEY'),
  client = null,
  model = readEnv('XANDER_TUTOR_MODEL') ?? DEFAULT_MODEL,
  now = () => new Date().toISOString(),
  effort = 'medium',
  fallback = null,
} = {}) {
  const syntheticFallback = fallback ?? createSyntheticModelGateway({ now });

  if (client) {
    return createClaudeModelGateway({ client, model, now, effort, fallbackGateway: syntheticFallback });
  }
  if (apiKey) {
    return createClaudeModelGateway({
      clientFactory: async () => {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        return new Anthropic({ apiKey });
      },
      model,
      now,
      effort,
      fallbackGateway: syntheticFallback,
    });
  }
  return syntheticFallback;
}

function mapTeachingToBaseResponse({ teaching, tutorContext, requestId, generatedAt, contractVersion }) {
  const messageText = nonEmpty(teaching.messageText, 'tutor message');
  return {
    contractVersion,
    id: `msg_${sanitizeIdPart(requestId ?? tutorContext.id)}_${sanitizeIdPart(generatedAt)}`,
    sessionId: tutorContext.sessionId,
    problemId: tutorContext.problemId,
    locale: tutorContext.problem?.locale ?? tutorContext.objective?.locale ?? 'en-US',
    feedbackType: teaching.feedbackType,
    messageText,
    speechText: nonEmpty(teaching.speechText, 'tutor speech', messageText),
    nextAction: teaching.nextAction,
    highlightTargets: Array.isArray(teaching.highlightTargets)
      ? teaching.highlightTargets.filter((id) => typeof id === 'string')
      : [],
    safety: {
      answerRevealed: teaching.answerRevealed === true,
      confidence: teaching.confidence ?? 'medium',
    },
  };
}

// Conservative reveal-permission derivation from the tutor policy's
// `answerReveal` strategy. Defaults to "do not reveal" for any unknown value.
function mayRevealAnswer(tutorContext, evaluation) {
  const strategy = tutorContext.tutorPolicy?.answerReveal ?? 'never';
  if (strategy === 'always') return true;
  if (strategy === 'never') return false;
  if (strategy.includes('after_correct')) {
    return evaluation?.isCorrect === true;
  }
  return false;
}

function collectHighlightTargets(tutorContext) {
  const groups = tutorContext.workspaceSnapshot?.state?.groups;
  if (Array.isArray(groups)) {
    return groups.map((group) => group.id).filter((id) => typeof id === 'string');
  }
  const tokens = tutorContext.workspaceSnapshot?.state?.tokens;
  if (Array.isArray(tokens)) {
    return tokens.map((token) => token?.id).filter((id) => typeof id === 'string');
  }
  return [];
}

function nonEmpty(value, label, fallback) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback;
  }
  throw new TypeError(`tutor model returned an empty ${label}`);
}

function readEnv(name) {
  const value = globalThis.process?.env?.[name];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function sanitizeIdPart(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}
