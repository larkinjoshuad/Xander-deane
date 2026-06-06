import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    .filter((result) => result.filePath.includes('/examples/api/session-http/'));
  const statuses = new Set(apiResults.map((result) => JSON.parse(readFileSync(result.filePath, 'utf8')).response.status));

  assert.equal(apiResults.length, 9);
  assert.deepEqual(
    apiResults.filter((result) => !result.valid),
    [],
    JSON.stringify(apiResults, null, 2),
  );

  const fixtureNames = apiResults.map((result) => result.filePath.split('/').at(-1)).sort();
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
  assert.ok(errors.some((error) => error.includes('$.subject must be one of')));
});
