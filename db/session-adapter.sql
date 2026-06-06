-- Database Session Adapter baseline schema
-- This SQL is intentionally portable: production adapters may translate types
-- to their target database while preserving table names, required columns,
-- append-only semantics, and indexes.

CREATE TABLE session_records (
  session_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  workspace_kind TEXT NOT NULL,
  record_version INTEGER NOT NULL,
  etag TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record_json TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX session_records_learner_idx
  ON session_records (learner_id, updated_at);

CREATE INDEX session_records_problem_idx
  ON session_records (problem_id, workspace_kind);

CREATE TABLE session_record_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  record_version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  record_json TEXT,
  actor_account_id TEXT,
  trace_id TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session_records (session_id)
);

CREATE INDEX session_record_events_session_idx
  ON session_record_events (session_id, record_version);

CREATE TABLE workspace_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  record_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session_records (session_id)
);

CREATE INDEX workspace_snapshots_session_idx
  ON workspace_snapshots (session_id, record_version);

CREATE TABLE interaction_events (
  interaction_event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  learner_id TEXT,
  problem_id TEXT NOT NULL,
  type TEXT NOT NULL,
  modality TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session_records (session_id)
);

CREATE INDEX interaction_events_session_idx
  ON interaction_events (session_id, occurred_at);

CREATE TABLE audit_events (
  audit_event_id TEXT PRIMARY KEY,
  learner_id TEXT,
  actor_account_id TEXT,
  action TEXT NOT NULL,
  decision TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE INDEX audit_events_learner_idx
  ON audit_events (learner_id, occurred_at);

CREATE INDEX audit_events_trace_idx
  ON audit_events (trace_id);
