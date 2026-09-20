// Keep browser verification separate from Node's automatic test discovery.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { buildPublic, REPO_ROOT } from './build-public.js';
import { createPublicPreview } from './preview-public.js';

await buildPublic();
const server = await createPublicPreview();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const child = spawn(process.execPath, [resolve(REPO_ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.public.config.js', ...process.argv.slice(2)], {
    cwd: REPO_ROOT, stdio: 'inherit',
    env: { ...process.env, PUBLIC_TEST_URL: `http://127.0.0.1:${server.address().port}` },
  });
  const [code] = await once(child, 'exit');
  process.exitCode = code ?? 1;
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
