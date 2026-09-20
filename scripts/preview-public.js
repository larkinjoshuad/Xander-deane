import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, readRegularFile, digest } from './build-public.js';
import { PUBLIC_FILES, PUBLIC_HEADERS } from './public-build-policy.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '': 'text/plain; charset=utf-8' };

export async function createPublicPreview({ root = REPO_ROOT } = {}) {
  root = await realpath(root);
  const manifest = JSON.parse(await readFile(resolve(root, 'dist/public-manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.mode !== 'synthetic-only' || JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(PUBLIC_FILES)) throw new Error('Invalid public manifest; rebuild');
  const files = new Map();
  for (const name of PUBLIC_FILES) {
    const bytes = await readRegularFile(root, `dist/public/${name}`);
    if (digest(bytes) !== manifest.files[name]) throw new Error(`Public artifact hash mismatch: ${name}`);
    files.set(`/${name}`, bytes);
  }
  return createServer((request, response) => {
    for (const [key, value] of Object.entries(PUBLIC_HEADERS)) response.setHeader(key, value);
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    const raw = (request.url ?? '').split('?')[0];
    if (!raw.startsWith('/') || /[%\\]|\.\./.test(raw)) { response.writeHead(404); response.end(); return; }
    const path = raw === '/' ? '/index.html' : ['/app', '/app/'].includes(raw) ? '/app/index.html' : raw;
    const bytes = files.get(path);
    if (!bytes) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': TYPES[extname(path)], 'Content-Length': bytes.length });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PUBLIC_PORT ?? 4174);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PUBLIC_PORT');
  const server = await createPublicPreview();
  server.listen(port, '127.0.0.1', () => console.log(`Isolated synthetic preview: http://127.0.0.1:${port}/app/`));
}
