import { createServer } from 'node:http';
import { createTutorContext } from './tutor-context.js';
import { createTutorGateway } from './model-gateway-claude.js';

/**
 * Minimal server-side endpoint for the live tutor.
 *
 * The browser shell posts its current learning session; the server assembles a
 * tutor context (using server-held synthetic learner/consent/safety fixtures),
 * calls the tutor gateway, and returns the tutor response. The API key lives
 * only here — it never reaches the browser. The gateway falls back to the
 * deterministic synthetic tutor when no key is configured, so the endpoint is
 * always safe to run.
 *
 * Routes:
 *   GET  /healthz        -> { status, mode }
 *   POST /tutor/respond  -> { mode, tutorResponse }   body: { session }
 */
export function createTutorApiServer({
  gateway = createTutorGateway(),
  learnerProfile,
  consentRecord,
  safetyPolicy,
  now = () => new Date().toISOString(),
  allowedOrigin = '*',
  maxBodyBytes = 256 * 1024,
} = {}) {
  assertPlainObject(learnerProfile, 'learnerProfile');
  assertPlainObject(consentRecord, 'consentRecord');
  assertPlainObject(safetyPolicy, 'safetyPolicy');

  async function handleTutorRespond(body) {
    const session = body?.session;
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      throw httpError(400, 'request body must include a "session" object');
    }
    let tutorContext;
    try {
      tutorContext = createTutorContext({
        session,
        learnerProfile,
        consentRecord,
        safetyPolicy,
        mayCallAi: true,
        generatedAt: now(),
        metadata: { dataMode: 'synthetic', purpose: 'live-tutor' },
      });
    } catch (error) {
      throw httpError(400, `invalid session payload: ${error.message}`);
    }
    const result = await gateway.generateTutorResponse(tutorContext, {});
    return { mode: result.mode, tutorResponse: result.tutorResponse };
  }

  const server = createServer(async (request, response) => {
    applyCors(response, allowedOrigin);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/healthz') {
      sendJson(response, 200, { status: 'ok', mode: gateway.mode ?? 'unknown' });
      return;
    }

    if (request.method === 'POST' && request.url === '/tutor/respond') {
      try {
        const body = await readJsonBody(request, maxBodyBytes);
        const payload = await handleTutorRespond(body);
        sendJson(response, 200, payload);
      } catch (error) {
        sendJson(response, error.statusCode ?? 500, { error: error.message });
      }
      return;
    }

    sendJson(response, 404, { error: 'not found' });
  });

  return Object.freeze({ server, gateway, handleTutorRespond });
}

function applyCors(response, allowedOrigin) {
  response.setHeader('access-control-allow-origin', allowedOrigin);
  response.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(body);
}

function readJsonBody(request, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(httpError(413, 'request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(httpError(400, 'request body must be valid JSON'));
      }
    });
    request.on('error', (error) => reject(httpError(400, error.message)));
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}
