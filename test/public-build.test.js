import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { once } from 'node:events';
import { buildPublic, REPO_ROOT } from '../scripts/build-public.js';
import { PUBLIC_FILES, PUBLIC_MODULES, PUBLIC_STATIC, PUBLIC_HEADERS } from '../scripts/public-build-policy.js';
import { createPublicPreview } from '../scripts/preview-public.js';

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(resolve(parent, 'xander-public-'));
  t.after(async () => {
    assert.equal(dirname(root), parent);
    assert.ok(basename(root).startsWith('xander-public-'));
    assert.equal(await realpath(root), root);
    await rm(root, { recursive: true, force: true });
  });
  for (const file of new Set([...PUBLIC_MODULES, ...PUBLIC_STATIC])) {
    await mkdir(dirname(resolve(root, file)), { recursive: true });
    await writeFile(resolve(root, file), await readFile(resolve(REPO_ROOT, file)));
  }
  return root;
}

test('public build is deterministic and removes stale output without copying unrelated files', async t => {
  const root = await fixture(t);
  await writeFile(resolve(root, '.env'), 'SYNTHETIC_SENTINEL');
  const first = await buildPublic({ root });
  assert.deepEqual(Object.keys(first.files).sort(), PUBLIC_FILES);
  await writeFile(resolve(root, 'dist/public/stale-secret.txt'), 'SYNTHETIC_SENTINEL');
  const second = await buildPublic({ root });
  assert.deepEqual(second, first);
  await assert.rejects(readFile(resolve(root, 'dist/public/stale-secret.txt')), { code: 'ENOENT' });
  await assert.rejects(readFile(resolve(root, 'dist/public/.env')), { code: 'ENOENT' });
  assert.ok(!PUBLIC_FILES.some(file => /tutor-client|prototype|provider|identity|consent|node_modules|src\//.test(file)));
});

test('public build refuses unapproved static, dynamic and provider imports', async t => {
  const root = await fixture(t);
  const target = resolve(root, 'app/learn.js');
  const original = await readFile(target, 'utf8');
  for (const addition of ["import './tutor-client.js';", "import('../src/app/model-gateway-claude.js');", "import '@anthropic-ai/sdk';"]) {
    await writeFile(target, original + '\n' + addition);
    await assert.rejects(buildPublic({ root }), /Public build rejects/);
  }
});

test('preview serves only verified files, rejects traversal and all API writes, and sets headers', async t => {
  const root = await fixture(t);
  await buildPublic({ root });
  await writeFile(resolve(root, 'dist/public/secret.txt'), 'SYNTHETIC_SENTINEL');
  const server = await createPublicPreview({ root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/app/prototype.html', '/app/tutor-client.js', '/src/app/model-gateway-claude.js', '/.env', '/.git/config', '/package.json', '/dist/public-manifest.json', '/secret.txt', '/examples/identity/guardian.account.json', '/app/%2e%2e%2fpackage.json', '/app/index.js:secret']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base + '/tutor/respond', { method: 'POST', body: '{}' })).status, 405);
  const response = await fetch(base + '/app/library.html?tutorApi=https://audit.invalid');
  assert.equal(response.status, 200);
  for (const [name, value] of Object.entries(PUBLIC_HEADERS)) assert.equal(response.headers.get(name), value);
  assert.equal((await fetch(base + '/app/assets/voice/shanon/rhyme-cat.mp3')).headers.get('content-type'), 'audio/mpeg');
  assert.equal((await fetch(base + '/app/learn.js', { method: 'HEAD' })).status, 200);
});

test('preview fails closed for modified artifacts and invalid manifests', async t => {
  const root = await fixture(t);
  const manifest = await buildPublic({ root });
  await writeFile(resolve(root, 'dist/public/app/learn.js'), 'tampered');
  await assert.rejects(createPublicPreview({ root }), /hash mismatch/);
  manifest.files['.env'] = 'bad';
  await writeFile(resolve(root, 'dist/public-manifest.json'), JSON.stringify(manifest));
  await assert.rejects(createPublicPreview({ root }), /Invalid public manifest/);
});

test('build refuses redirected output without touching the destination', async t => {
  const root = await fixture(t);
  const other = await fixture(t);
  await mkdir(resolve(root, 'dist'));
  await writeFile(resolve(other, 'sentinel.txt'), 'keep');
  await symlink(other, resolve(root, 'dist/public'), 'junction');
  await assert.rejects(buildPublic({ root }), /must not be a symlink/);
  assert.equal(await readFile(resolve(other, 'sentinel.txt'), 'utf8'), 'keep');
});
