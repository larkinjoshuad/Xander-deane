import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { test } from 'node:test';
import {
  fixtureSchemaSuffixesFromRegistry,
  loadSchemaRegistry,
  validateFixtureTree,
  validateJsonSchema,
  validateSchemaRegistry,
} from '../scripts/validate-fixtures.js';

test('schema registry is valid and maps fixture suffixes to schemas', () => {
  const result = validateSchemaRegistry();
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));

  const registry = loadSchemaRegistry();
  const suffixes = fixtureSchemaSuffixesFromRegistry(registry);
  assert.equal(suffixes['.session-record.json'], 'schemas/session-record.schema.json');
  assert.equal(suffixes['.api-http-exchange.json'], 'schemas/api-http-exchange.schema.json');
  assert.ok(registry.schemas.length >= 25, 'expected registry coverage for all contract schemas');
});

test('all example fixtures satisfy their mapped JSON Schemas', () => {
  const results = validateFixtureTree();

  assert.ok(results.length >= 12, 'expected cross-subject and API fixture coverage');
  assert.deepEqual(
    results.filter((result) => !result.valid),
    [],
    JSON.stringify(results, null, 2),
  );
});

test('session HTTP API fixtures cover success and key error contracts', () => {
  const apiResults = validateFixtureTree()
    .filter((result) => dirname(result.filePath).endsWith(join(sep, 'examples', 'api', 'session-http')));
  const statuses = new Set(apiResults.map((result) => JSON.parse(readFileSync(result.filePath, 'utf8')).response.status));

  assert.equal(apiResults.length, 9);
  assert.deepEqual(
    apiResults.filter((result) => !result.valid),
    [],
    JSON.stringify(apiResults, null, 2),
  );

  const fixtureNames = apiResults.map((result) => basename(result.filePath)).sort();
  assert.deepEqual(fixtureNames, [
    'append-event-conflict.api-http-exchange.json',
    'append-snapshot-success.api-http-exchange.json',
    'create-session-success.api-http-exchange.json',
    'delete-missing-precondition.api-http-exchange.json',
    'delete-versioned-success.api-http-exchange.json',
    'forbidden-create.api-http-exchange.json',
    'malformed-json.api-http-exchange.json',
    'read-missing-session.api-http-exchange.json',
    'unauthorized-create.api-http-exchange.json',
  ]);
  assert.deepEqual([...statuses].sort((left, right) => left - right), [200, 201, 400, 401, 403, 404, 409, 428]);
});

test('fixture validator reports required fields and enum failures', () => {
  const errors = validateJsonSchema(
    { contractVersion: '0.1.0', subject: 'math' },
    {
      type: 'object',
      required: ['contractVersion', 'subject', 'id'],
      additionalProperties: false,
      properties: {
        contractVersion: { type: 'string', minLength: 1 },
        subject: { type: 'string', enum: ['language'] },
        id: { type: 'string', minLength: 1 },
      },
    },
  );

  assert.ok(errors.includes('$.id is required'));
  assert.ok(errors.some((error) => error.includes('subject') && error.includes('must be one of')));
});

test('rejects invalid referenced rubric records and negative scorecard totals', () => {
  const schema = JSON.parse(readFileSync('schemas/tutor-quality-scorecard.schema.json', 'utf8'));
  const fixture = JSON.parse(readFileSync('examples/ai/math-hint.tutor-quality-scorecard.json', 'utf8'));
  assert.deepEqual(validateJsonSchema(fixture, schema), []);
  for (const safety of [{ score: -1, maxScore: 2, notes: [] }, { score: 2 }, null]) {
    const errors = validateJsonSchema({
      ...fixture, rubricScores: { ...fixture.rubricScores, safety },
    }, schema);
    assert.ok(errors.some((error) => error.includes('safety')), JSON.stringify(errors));
  }
  assert.ok(validateJsonSchema({ ...fixture, totalScore: -1 }, schema).length > 0);
});

test('enforces bounds, formats, combinators, and boolean schemas without mutating data', () => {
  assert.ok(validateJsonSchema(11, { type: 'number', maximum: 10 }).length > 0);
  assert.ok(validateJsonSchema('2026-02-30T00:00:00Z', { type: 'string', format: 'date-time' }).length > 0);
  assert.ok(validateJsonSchema('2026-06-04', { type: 'string', format: 'date-time' }).length > 0);
  assert.ok(validateJsonSchema('unexpected', { anyOf: [{ const: 'a' }, { const: 'b' }] }).length > 0);
  assert.ok(validateJsonSchema({}, false).length > 0);
  assert.deepEqual(validateJsonSchema({}, true), []);
  const value = { count: '2', extra: true };
  const before = structuredClone(value);
  const schema = {
    type: 'object', additionalProperties: false,
    properties: { count: { type: 'integer' }, label: { type: 'string', default: 'demo' } },
  };
  assert.ok(validateJsonSchema(value, schema).length > 0);
  assert.deepEqual(value, before);
});

test('fails closed for unknown keywords and unresolved references', () => {
  assert.throws(() => validateJsonSchema(1, { type: 'number', minumum: 0 }), /unknown keyword/);
  assert.throws(() => validateJsonSchema({}, { $ref: '#/$defs/missing' }), /resolve reference/);
});
