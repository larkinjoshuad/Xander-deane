import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { replaySessionApiFixtures } from '../scripts/replay-api-fixtures.js';
import { createSqliteSessionRecordStore } from '../src/app/database-session-record-store.js';
import { createSessionPersistenceService } from '../src/app/session-service.js';

const execFileAsync = promisify(execFile);
const hasSqlite = await execFileAsync('sqlite3', ['-version']).then(() => true, () => false);
const fixedNow = () => '2026-05-29T00:00:00.000Z';

test('session HTTP API contract fixtures replay against the Fetch adapter', async () => {
  const results = await replaySessionApiFixtures();
  assertFixtureStatuses(results);
});

test('session HTTP API contract fixtures replay against the SQLite-backed adapter', { skip: !hasSqlite }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-api-fixture-sqlite-'));
  let scenarioNumber = 0;
  try {
    const results = await replaySessionApiFixtures(undefined, {
      createSessionService() {
        scenarioNumber += 1;
        return createSessionPersistenceService({
          recordStore: createSqliteSessionRecordStore({
            databasePath: join(directory, `scenario-${scenarioNumber}.sqlite`),
            now: fixedNow,
          }),
          now: fixedNow,
        });
      },
    });
    assertFixtureStatuses(results);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function assertFixtureStatuses(results) {
  const statuses = results.map((result) => result.status).sort((left, right) => left - right);
  assert.equal(results.length, 9);
  assert.deepEqual(statuses, [200, 200, 201, 400, 401, 403, 404, 409, 428]);
}
