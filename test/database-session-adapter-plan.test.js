import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync('db/session-adapter.sql', 'utf8');
const docs = readFileSync('docs/database-session-adapter.md', 'utf8');

const requiredTables = {
  session_records: [
    'session_id',
    'learner_id',
    'subject',
    'problem_id',
    'workspace_kind',
    'record_version',
    'etag',
    'updated_at',
    'record_json',
    'deleted_at',
  ],
  session_record_events: [
    'event_id',
    'session_id',
    'type',
    'record_version',
    'occurred_at',
    'record_json',
    'actor_account_id',
    'trace_id',
  ],
  workspace_snapshots: [
    'snapshot_id',
    'session_id',
    'record_version',
    'created_at',
    'snapshot_json',
  ],
  interaction_events: [
    'interaction_event_id',
    'session_id',
    'learner_id',
    'problem_id',
    'type',
    'modality',
    'occurred_at',
    'payload_json',
  ],
  audit_events: [
    'audit_event_id',
    'learner_id',
    'actor_account_id',
    'action',
    'decision',
    'occurred_at',
    'trace_id',
    'metadata_json',
  ],
};

test('database session adapter SQL defines all required tables and columns', () => {
  for (const [tableName, columns] of Object.entries(requiredTables)) {
    const tableBody = extractCreateTableBody(sql, tableName);
    assert.ok(tableBody, `expected CREATE TABLE for ${tableName}`);
    for (const column of columns) {
      assert.match(tableBody, new RegExp(`(^|\\n)\\s*${column}\\s`, 'i'), `expected ${tableName}.${column}`);
    }
  }
});

test('database session adapter SQL preserves indexes for read and audit paths', () => {
  const requiredIndexes = [
    'session_records_learner_idx',
    'session_records_problem_idx',
    'session_record_events_session_idx',
    'workspace_snapshots_session_idx',
    'interaction_events_session_idx',
    'audit_events_learner_idx',
    'audit_events_trace_idx',
  ];

  for (const indexName of requiredIndexes) {
    assert.match(sql, new RegExp(`CREATE INDEX ${indexName}`, 'i'));
  }
});

test('database adapter documentation and SQL stay aligned', () => {
  for (const tableName of Object.keys(requiredTables)) {
    assert.match(docs, new RegExp('\\| `' + tableName + '`'), `expected ${tableName} in docs table`);
  }

  assert.match(docs, /A baseline portable SQL shape is available in `db\/session-adapter\.sql`/);
  assert.match(docs, /write the materialized `session_records` row and append/);
  assert.match(docs, /Deletes must append a tombstone event/);
  assert.match(docs, /List queries must exclude tombstoned rows/);
});

function extractCreateTableBody(source, tableName) {
  const match = source.match(new RegExp(`CREATE TABLE ${tableName} \\(([\\s\\S]*?)\\n\\);`, 'i'));
  return match?.[1] ?? '';
}
