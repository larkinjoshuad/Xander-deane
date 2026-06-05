#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createSessionApiServer } from '../src/app/session-api-server.js';

const port = Number.parseInt(process.env.SESSION_API_PORT ?? '4180', 10);
const databasePath = resolve(process.env.SESSION_API_DB ?? '.data/session-api.sqlite');
const bearerToken = process.env.SESSION_API_TOKEN ?? 'prototype-dev-token';

const [account, link, consentRecord, dataInventory, retentionPolicy] = await Promise.all([
  readJson('examples/identity/guardian.account.json'),
  readJson('examples/identity/guardian-link.learner-account-link.json'),
  readJson('examples/safety/guardian-consent.consent-record.json'),
  readJson('examples/governance/base.data-inventory.json'),
  readJson('examples/safety/session.data-retention-policy.json'),
]);

await mkdir(dirname(databasePath), { recursive: true });
const { server } = await createSessionApiServer({
  databasePath,
  bearerToken,
  account,
  link,
  consentRecord,
  dataInventory,
  retentionPolicy,
  origin: `http://127.0.0.1:${port}`,
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Session API listening on http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${databasePath}`);
  console.log('Use Authorization: Bearer <SESSION_API_TOKEN> for /sessions requests.');
});

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}
