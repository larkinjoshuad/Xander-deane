import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteSessionRecordStore } from '../src/app/database-session-record-store.js';
import {
  createAppendOnlyFileSessionRecordStore,
  createFileSessionRecordStore,
  createInMemorySessionRecordStore,
} from '../src/app/session-service.js';
import { runSessionRecordStoreContractTests } from './helpers/session-record-store-contract.js';

const stores = [
  {
    name: 'in-memory',
    async create() {
      const recordStore = createInMemorySessionRecordStore();
      return {
        recordStore,
        recreate: async () => recordStore,
        cleanup: async () => {},
      };
    },
  },
  {
    name: 'overwrite-file',
    async create() {
      const directory = await mkdtemp(join(tmpdir(), 'xander-store-contract-file-'));
      return {
        recordStore: createFileSessionRecordStore({ directory }),
        recreate: async () => createFileSessionRecordStore({ directory }),
        cleanup: async () => rm(directory, { recursive: true, force: true }),
      };
    },
  },
  {
    name: 'append-only-jsonl',
    async create() {
      const directory = await mkdtemp(join(tmpdir(), 'xander-store-contract-jsonl-'));
      return {
        recordStore: createAppendOnlyFileSessionRecordStore({ directory }),
        recreate: async () => createAppendOnlyFileSessionRecordStore({ directory }),
        cleanup: async () => rm(directory, { recursive: true, force: true }),
      };
    },
  },
];

if (hasSqlite()) {
  stores.push({
    name: 'sqlite-database',
    async create() {
      const directory = await mkdtemp(join(tmpdir(), 'xander-store-contract-sqlite-'));
      const databasePath = join(directory, 'session-records.sqlite');
      return {
        recordStore: createSqliteSessionRecordStore({ databasePath }),
        recreate: async () => createSqliteSessionRecordStore({ databasePath, initialize: false }),
        cleanup: async () => rm(directory, { recursive: true, force: true }),
      };
    },
  });
}

runSessionRecordStoreContractTests({ stores });

function hasSqlite() {
  return spawnSync('sqlite3', ['-version'], { stdio: 'ignore' }).status === 0;
}
