# Session HTTP API Adapter

The session HTTP API adapter is the next boundary after the access-controlled session service. It exposes the same session operations through a dependency-free request handler so a Node server, edge worker, or test harness can route authenticated HTTP requests without bypassing consent, learner access, or audit logging.

## Goals

- Keep the core runtime portable: no web framework dependency is required.
- Require callers to provide an authenticated access context through `resolveAccessContext`.
- Route all writes, reads, lists, exports, tombstone queries, and deletes through `createAccessControlledSessionService` so permission checks, consent checks, data-rights packaging, retention/tombstone policy, and audit events remain centralized.
- Return predictable JSON responses for product clients and integration tests.
- Keep request/response examples portable through `examples/api/session-http/*.api-http-exchange.json` fixtures.

## Adapter shape

```js
import { createSessionHttpApi } from '../src/app/session-http-api.js';

const api = createSessionHttpApi({
  accessService,
  resolveAccessContext: async ({ request, route, body }) => ({
    account: authenticatedAccount,
    link: learnerLink,
    consentRecord,
    traceId: request.headers.get('x-trace-id'),
    metadata: { route: route.name },
  }),
});

const response = await api.handleRequest(request);
```

`handleRequest` accepts a Fetch-compatible `Request` object and returns a `Response` object. The module also exports `createNodeSessionHttpHandler`, `nodeRequestToFetchRequest`, and `writeFetchResponseToNodeResponse` so Node's built-in `http` module can bridge `IncomingMessage`/`ServerResponse` traffic without introducing a framework dependency.


## Node HTTP bridge

```js
import { createServer } from 'node:http';
import { createNodeSessionHttpHandler, createSessionHttpApi } from '../src/app/session-http-api.js';

const api = createSessionHttpApi({ accessService, resolveAccessContext });
const server = createServer(createNodeSessionHttpHandler({ api }));
server.listen(8080);
```

The Node bridge preserves the adapter's JSON response contract and forwards headers such as trace or audit IDs into `resolveAccessContext` through the Fetch `Request` object.


## Optimistic concurrency

Session writes emit `metadata.recordVersion` and `metadata.etag` on saved records. Successful HTTP responses forward the record ETag in the `etag` response header when a session record is returned. Mutating requests may include either `If-Match` (for example `W/"ses_001:3"`) or `X-Record-Version` (for example `3`) to require that the stored record is still at the expected version before the write is applied. Deletes must include one of these precondition headers because they are destructive. Stale versions return `409 conflict`; missing delete preconditions return `428 precondition_required`; neither case mutates the stored record.

## API contract fixtures

The session API has portable request/response examples under `examples/api/session-http/`. These fixtures cover successful session creation, successful snapshot append, successful versioned delete, stale-version conflict handling, missing delete preconditions, forbidden learner access, missing records, malformed JSON, and unauthenticated requests. Unit tests also cover active session listing, tombstone listing/query routes, the data-rights export route, denied exports when `data_export` consent is missing, retention-expired export denials, and tombstone metadata on destructive deletes. They validate through `schemas/api-http-exchange.schema.json`, are included in `npm run validate:fixtures` through the schema registry, and replay against the dependency-free Fetch adapter with `npm run replay:api-fixtures`.

## Routes

| Method | Route | Body | Operation |
| --- | --- | --- | --- |
| `POST` | `/sessions` | `{ "session": SessionLike }` | Saves a normalized session record. |
| `GET` | `/sessions` | none | Lists active session records for the authorized learner. |
| `GET` | `/sessions?include=tombstones` | none | Lists deleted session tombstones for the authorized learner. |
| `GET` | `/sessions/:sessionId` | none | Reads a session record. |
| `GET` | `/sessions/:sessionId/tombstone` | none | Reads a deleted-session tombstone for the authorized learner. |
| `GET` | `/sessions/:sessionId/export` | none | Exports the session record with data-inventory classifications and retention disposition; requires `export_data` permission, `data_export` consent, and an exportable active retention status. |
| `POST` | `/sessions/:sessionId/events` | `{ "event": InteractionEvent }` | Appends an interaction event. |
| `POST` | `/sessions/:sessionId/snapshots` | `{ "workspaceSnapshot": WorkspaceSnapshot }` | Appends the current workspace snapshot. |
| `DELETE` | `/sessions/:sessionId` | none | Deletes a session record and returns a tombstone packet; requires `If-Match` or `X-Record-Version`. |

Successful responses return `{ "data": ... }`. Errors return `{ "error": { "code", "message" } }` with these status mappings:

- `400 bad_request`: malformed JSON, malformed precondition headers, or missing body fields.
- `401 unauthorized`: no authenticated access context resolver was provided.
- `403 forbidden`: learner access, permission, or consent checks failed.
- `404 not_found`: session route or session record was not found.
- `409 conflict`: expected record version did not match the stored record version.
- `428 precondition_required`: destructive delete request did not include `If-Match` or `X-Record-Version`.
- `500 internal_error`: unexpected runtime failure.

## Next production work

1. Replace in-memory/file audit and session stores with durable database-backed stores while preserving the adapter contract.
2. Reuse the executable fixture replay harness against eventual production auth/database adapters.
