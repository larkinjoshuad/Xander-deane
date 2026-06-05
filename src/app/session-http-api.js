import { createAccessControlledSessionService } from './session-access-service.js';
import { SessionRecordVersionConflictError } from './session-service.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

export class SessionApiAuthError extends Error {
  constructor(message = 'authenticated access context is required') {
    super(message);
    this.name = 'SessionApiAuthError';
  }
}

export class SessionApiPreconditionRequiredError extends Error {
  constructor(message = 'record version precondition is required') {
    super(message);
    this.name = 'SessionApiPreconditionRequiredError';
  }
}

export function createSessionHttpApi({
  accessService = createAccessControlledSessionService(),
  resolveAccessContext = defaultResolveAccessContext,
  baseUrl = 'http://localhost',
} = {}) {
  assertService(accessService, 'accessService');
  assertFunction(resolveAccessContext, 'resolveAccessContext');

  return Object.freeze({
    async handleRequest(request) {
      try {
        const normalizedRequest = normalizeRequest(request, baseUrl);
        const route = matchRoute(normalizedRequest.url, normalizedRequest.method);
        if (!route) {
          return jsonResponse(404, errorPayload('not_found', `no session API route matches ${normalizedRequest.method} ${normalizedRequest.url.pathname}`));
        }

        const body = await readJsonBody(normalizedRequest.request, route.requiresBody);
        const expectedRecordVersion = resolveRequestPrecondition(route, normalizedRequest.request);
        const resolvedContext = await resolveAccessContext({
          request: normalizedRequest.request,
          route,
          body,
        });
        const context = attachRequestPreconditions(resolvedContext, expectedRecordVersion);
        const data = await dispatchRoute({ accessService, route, body, context });
        return jsonResponse(route.successStatus, { data }, responseHeadersForData(data));
      } catch (error) {
        return mapErrorResponse(error);
      }
    },
  });
}


export function createNodeSessionHttpHandler({
  api = createSessionHttpApi(),
  origin = 'http://localhost',
} = {}) {
  assertApi(api, 'api');

  return async function handleNodeSessionHttpRequest(incomingMessage, serverResponse) {
    try {
      const request = await nodeRequestToFetchRequest(incomingMessage, { origin });
      const response = await api.handleRequest(request);
      await writeFetchResponseToNodeResponse(response, serverResponse);
    } catch (error) {
      await writeFetchResponseToNodeResponse(mapErrorResponse(error), serverResponse);
    }
  };
}

export async function nodeRequestToFetchRequest(incomingMessage, { origin = 'http://localhost' } = {}) {
  if (!incomingMessage || typeof incomingMessage !== 'object') {
    throw new TypeError('incomingMessage is required');
  }
  const method = String(incomingMessage.method ?? 'GET').toUpperCase();
  const url = new URL(incomingMessage.url ?? '/', resolveNodeRequestOrigin(incomingMessage, origin));
  const headers = new Headers();
  Object.entries(incomingMessage.headers ?? {}).forEach(([name, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(name, entry));
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  });

  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? await readNodeRequestBody(incomingMessage) : undefined;
  return new Request(url, {
    method,
    headers,
    body,
  });
}

export async function writeFetchResponseToNodeResponse(response, serverResponse) {
  if (!response || typeof response !== 'object') {
    throw new TypeError('response is required');
  }
  if (!serverResponse || typeof serverResponse !== 'object') {
    throw new TypeError('serverResponse is required');
  }
  serverResponse.statusCode = response.status;
  response.headers.forEach((value, name) => {
    serverResponse.setHeader(name, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  serverResponse.end(body);
}

function matchRoute(url, method) {
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'sessions') return null;

  if (parts.length === 1 && method === 'POST') {
    return Object.freeze({ name: 'createSession', successStatus: 201, requiresBody: true });
  }

  if (parts.length === 1 && method === 'GET') {
    return Object.freeze({
      name: url.searchParams.get('include') === 'tombstones' ? 'listTombstones' : 'listSessions',
      successStatus: 200,
      requiresBody: false,
      filter: readSessionListFilter(url),
    });
  }

  if (parts.length === 2 && method === 'GET') {
    return Object.freeze({ name: 'loadSession', sessionId: parts[1], successStatus: 200, requiresBody: false });
  }

  if (parts.length === 2 && method === 'DELETE') {
    return Object.freeze({ name: 'deleteSession', sessionId: parts[1], successStatus: 200, requiresBody: false, requiresPrecondition: true });
  }

  if (parts.length === 3 && parts[2] === 'export' && method === 'GET') {
    return Object.freeze({ name: 'exportSession', sessionId: parts[1], successStatus: 200, requiresBody: false });
  }

  if (parts.length === 3 && parts[2] === 'tombstone' && method === 'GET') {
    return Object.freeze({ name: 'loadTombstone', sessionId: parts[1], successStatus: 200, requiresBody: false });
  }

  if (parts.length === 3 && parts[2] === 'events' && method === 'POST') {
    return Object.freeze({ name: 'appendEvent', sessionId: parts[1], successStatus: 200, requiresBody: true });
  }

  if (parts.length === 3 && parts[2] === 'snapshots' && method === 'POST') {
    return Object.freeze({ name: 'appendSnapshot', sessionId: parts[1], successStatus: 200, requiresBody: true });
  }

  return null;
}

async function dispatchRoute({ accessService, route, body, context }) {
  switch (route.name) {
    case 'createSession':
      return accessService.saveSession(requireBodyField(body, 'session'), context);
    case 'loadSession': {
      const record = await accessService.loadSessionRecord(route.sessionId, context);
      if (record === null) {
        throw new SessionApiNotFoundError(`session record ${route.sessionId} was not found`);
      }
      return record;
    }
    case 'listSessions':
      return accessService.listSessionRecords(context, route.filter);
    case 'loadTombstone': {
      const tombstone = await accessService.loadDeletedSessionTombstone(route.sessionId, context);
      if (tombstone === null) {
        throw new SessionApiNotFoundError(`session tombstone ${route.sessionId} was not found`);
      }
      return tombstone;
    }
    case 'listTombstones':
      return accessService.listDeletedSessionTombstones(context, route.filter);
    case 'deleteSession':
      return accessService.deleteSessionRecord(route.sessionId, context);
    case 'exportSession':
      return accessService.exportSessionRecord(route.sessionId, context);
    case 'appendEvent':
      return accessService.appendInteractionEvent(route.sessionId, requireBodyField(body, 'event'), context);
    case 'appendSnapshot':
      return accessService.appendWorkspaceSnapshot(route.sessionId, requireBodyField(body, 'workspaceSnapshot'), context);
    default:
      throw new SessionApiNotFoundError(`unsupported session API route ${route.name}`);
  }
}

function readSessionListFilter(url) {
  const filter = {};
  ['learnerId', 'subject', 'workspaceKind', 'problemId'].forEach((name) => {
    const value = url.searchParams.get(name);
    if (value !== null && value.trim().length > 0) {
      filter[name] = value;
    }
  });
  return Object.freeze(filter);
}

async function readJsonBody(request, required) {
  if (!required) return null;
  const text = await request.text();
  if (text.trim().length === 0) {
    throw new TypeError('JSON request body is required');
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new TypeError(`request body must be valid JSON: ${error.message}`);
  }
}

function requireBodyField(body, fieldName) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('request body must be a JSON object');
  }
  if (body[fieldName] === undefined || body[fieldName] === null) {
    throw new TypeError(`request body must include ${fieldName}`);
  }
  return body[fieldName];
}


function resolveRequestPrecondition(route, request) {
  const expectedRecordVersion = readExpectedRecordVersion(request);
  if (route.requiresPrecondition && expectedRecordVersion === undefined) {
    throw new SessionApiPreconditionRequiredError(`${route.name} requires If-Match or X-Record-Version`);
  }
  return expectedRecordVersion;
}

function attachRequestPreconditions(context, expectedRecordVersion) {
  if (expectedRecordVersion === undefined) return context;
  return {
    ...context,
    expectedRecordVersion,
  };
}

function readExpectedRecordVersion(request) {
  const headerValue = request.headers.get('if-match') ?? request.headers.get('x-record-version');
  if (headerValue === null || headerValue.trim().length === 0 || headerValue.trim() === '*') return undefined;
  const match = headerValue.match(/(\d+)(?:"?\s*)$/);
  if (!match) {
    throw new TypeError('if-match or x-record-version must include a non-negative integer record version');
  }
  return Number.parseInt(match[1], 10);
}

function responseHeadersForData(data) {
  const etag = data?.metadata?.etag;
  return typeof etag === 'string' && etag.length > 0 ? { etag } : {};
}

function normalizeRequest(request, baseUrl) {
  if (!request || typeof request !== 'object') {
    throw new TypeError('request is required');
  }
  if (typeof request.method !== 'string') {
    throw new TypeError('request.method is required');
  }
  if (typeof request.url !== 'string') {
    throw new TypeError('request.url is required');
  }

  return Object.freeze({
    request,
    method: request.method.toUpperCase(),
    url: new URL(request.url, baseUrl),
  });
}

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'content-type': JSON_CONTENT_TYPE,
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function mapErrorResponse(error) {
  const { status, code } = classifyError(error);
  return jsonResponse(status, errorPayload(code, error.message));
}

function classifyError(error) {
  if (error instanceof SessionApiAuthError) {
    return { status: 401, code: 'unauthorized' };
  }
  if (error instanceof SessionApiPreconditionRequiredError) {
    return { status: 428, code: 'precondition_required' };
  }
  if (error instanceof SessionRecordVersionConflictError || /version conflict/i.test(error.message)) {
    return { status: 409, code: 'conflict' };
  }
  if (error instanceof SessionApiNotFoundError || /was not found|not found/i.test(error.message)) {
    return { status: 404, code: 'not_found' };
  }
  if (error instanceof RangeError) {
    return { status: 403, code: 'forbidden' };
  }
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return { status: 400, code: 'bad_request' };
  }
  return { status: 500, code: 'internal_error' };
}

function errorPayload(code, message) {
  return { error: { code, message } };
}

class SessionApiNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionApiNotFoundError';
  }
}


function resolveNodeRequestOrigin(incomingMessage, fallbackOrigin) {
  const host = incomingMessage.headers?.host;
  if (!host) return fallbackOrigin;
  const encrypted = incomingMessage.socket?.encrypted === true;
  return `${encrypted ? 'https' : 'http'}://${host}`;
}

async function readNodeRequestBody(incomingMessage) {
  const chunks = [];
  for await (const chunk of incomingMessage) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function defaultResolveAccessContext() {
  throw new SessionApiAuthError('resolveAccessContext must return an authenticated access context');
}


function assertApi(value, fieldName) {
  if (!value || typeof value.handleRequest !== 'function') {
    throw new TypeError(`${fieldName}.handleRequest must be a function`);
  }
}

function assertService(value, fieldName) {
  const requiredMethods = ['saveSession', 'loadSessionRecord', 'listSessionRecords', 'loadDeletedSessionTombstone', 'listDeletedSessionTombstones', 'exportSessionRecord', 'appendInteractionEvent', 'appendWorkspaceSnapshot', 'deleteSessionRecord'];
  requiredMethods.forEach((methodName) => {
    if (!value || typeof value[methodName] !== 'function') {
      throw new TypeError(`${fieldName}.${methodName} must be a function`);
    }
  });
}

function assertFunction(value, fieldName) {
  if (typeof value !== 'function') {
    throw new TypeError(`${fieldName} must be a function`);
  }
}
