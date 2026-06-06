import { createServer } from 'node:http';
import { createAccessControlledSessionService } from './session-access-service.js';
import {
  createSqliteAuditEventStore,
  createSqliteSessionRecordStore,
  initializeSqliteSessionDatabase,
} from './database-session-record-store.js';
import {
  createNodeSessionHttpHandler,
  createSessionHttpApi,
  SessionApiAuthError,
} from './session-http-api.js';
import { createSessionPersistenceService } from './session-service.js';

export async function createSessionApiServer({
  databasePath,
  sqliteCommand = 'sqlite3',
  account,
  link,
  consentRecord,
  dataInventory = null,
  retentionPolicy = null,
  bearerToken,
  origin = 'http://localhost',
  now = () => new Date().toISOString(),
  recordStore,
  auditEventStore,
  sessionService,
  accessService,
} = {}) {
  if (databasePath && !accessService && !sessionService && !recordStore && !auditEventStore) {
    await initializeSqliteSessionDatabase({ databasePath, sqliteCommand });
  }

  const resolvedAccessService = accessService ?? createAccessService({
    databasePath,
    sqliteCommand,
    now,
    recordStore,
    auditEventStore,
    sessionService,
  });
  const api = createSessionHttpApi({
    accessService: resolvedAccessService,
    resolveAccessContext: createFixtureAccessContextResolver({
      account,
      link,
      consentRecord,
      dataInventory,
      retentionPolicy,
      bearerToken,
    }),
    baseUrl: origin,
  });
  const sessionHandler = createNodeSessionHttpHandler({ api, origin });

  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(JSON.stringify({ status: 'ok', storage: databasePath ? 'sqlite' : 'custom' }));
      return;
    }
    await sessionHandler(request, response);
  });

  return Object.freeze({
    api,
    accessService: resolvedAccessService,
    server,
  });
}

export function createFixtureAccessContextResolver({
  account,
  link,
  consentRecord,
  dataInventory = null,
  retentionPolicy = null,
  bearerToken,
} = {}) {
  assertPlainObject(account, 'account');
  assertPlainObject(link, 'link');
  assertPlainObject(consentRecord, 'consentRecord');

  return async function resolveFixtureAccessContext({ request }) {
    if (bearerToken) {
      const authorization = request.headers.get('authorization') ?? '';
      if (authorization !== `Bearer ${bearerToken}`) {
        throw new SessionApiAuthError('valid bearer token is required for the session API');
      }
    }

    const requestedAccountId = request.headers.get('x-account-id');
    if (requestedAccountId && requestedAccountId !== account.id) {
      throw new SessionApiAuthError(`account ${requestedAccountId} is not available in this server context`);
    }

    const requestedLearnerId = request.headers.get('x-learner-id');
    if (requestedLearnerId && requestedLearnerId !== link.learnerId) {
      throw new SessionApiAuthError(`learner ${requestedLearnerId} is not available in this server context`);
    }

    return {
      account,
      link,
      consentRecord,
      dataInventory,
      retentionPolicy,
      traceId: request.headers.get('x-trace-id') ?? `trace_session_api_${Date.now()}`,
      auditEventId: request.headers.get('x-audit-event-id') ?? undefined,
    };
  };
}

function createAccessService({
  databasePath,
  sqliteCommand,
  now,
  recordStore,
  auditEventStore,
  sessionService,
}) {
  if (!sessionService && !recordStore && !databasePath) {
    throw new TypeError('databasePath or sessionService is required for createSessionApiServer');
  }

  const resolvedRecordStore = recordStore ?? createSqliteSessionRecordStore({
    databasePath,
    sqliteCommand,
    initialize: false,
    now,
  });
  const resolvedAuditEventStore = auditEventStore ?? createSqliteAuditEventStore({
    databasePath,
    sqliteCommand,
    initialize: false,
  });
  const resolvedSessionService = sessionService ?? createSessionPersistenceService({
    recordStore: resolvedRecordStore,
    now,
  });

  return createAccessControlledSessionService({
    sessionService: resolvedSessionService,
    auditEventStore: resolvedAuditEventStore,
    now,
  });
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}
