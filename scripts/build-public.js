import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PUBLIC_ENTRIES, PUBLIC_MODULES, PUBLIC_STATIC, PUBLIC_FILES, PUBLIC_HEADERS } from './public-build-policy.js';

export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = path => path.split(sep).join('/');

export async function readRegularFile(root, name) {
  const path = resolve(root, name);
  if (relative(root, path).startsWith('..') || !(await lstat(path)).isFile() || await realpath(path) !== path) {
    throw new Error(`Not a regular in-root file: ${name}`);
  }
  return readFile(path);
}

async function ownedDirectory(root, path) {
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || resolve(root, rel) !== path) throw new Error('Unsafe build directory');
  await mkdir(path, { recursive: true });
  if (await realpath(path) !== path) throw new Error('Build directory must not be a symlink');
}

export async function buildPublic({ root = REPO_ROOT } = {}) {
  root = await realpath(root);
  const allowed = new Set(PUBLIC_MODULES);
  const result = await build({
    absWorkingDir: root, entryPoints: PUBLIC_ENTRIES, outbase: '.', outdir: 'dist/public',
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    write: false, metafile: true, sourcemap: false, legalComments: 'none', logLevel: 'silent', tsconfigRaw: {},
    plugins: [{ name: 'approved-browser-modules', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.kind !== 'entry-point' && !args.path.startsWith('.')) throw new Error(`Public build rejects import: ${args.path}`);
        const path = resolve(args.importer ? dirname(args.importer) : root, args.path);
        if (!allowed.has(slash(relative(root, path)))) throw new Error(`Public build rejects module: ${args.path}`);
        return { path };
      });
      builder.onLoad({ filter: /.*/ }, async args => {
        const name = slash(relative(root, args.path));
        if (!allowed.has(name)) throw new Error(`Public build rejects module: ${name}`);
        return { contents: await readRegularFile(root, name), loader: 'js' };
      });
    } }],
  });
  if (result.warnings.length) throw new Error('Public build warnings require review');
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!allowed.has(input)) throw new Error(`Unexpected module: ${input}`);
  }
  const files = new Map();
  for (const file of result.outputFiles) files.set(slash(relative(resolve(root, 'dist/public'), file.path)), file.contents);
  for (const name of PUBLIC_STATIC) files.set(name, await readRegularFile(root, name));
  files.set('index.html', Buffer.from('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=./app/learn.html"><title>Practice</title></head><body><a href="./app/learn.html">Open practice</a></body></html>'));
  if (JSON.stringify([...files.keys()].sort()) !== JSON.stringify(PUBLIC_FILES)) throw new Error('Unexpected public output');

  // Only the fixed generated directory is replaced, after all inputs compile.
  const dist = resolve(root, 'dist');
  const output = resolve(dist, 'public');
  await ownedDirectory(root, dist);
  await ownedDirectory(dist, output);
  await rm(output, { recursive: true, force: true });
  await mkdir(output);
  const hashes = {};
  for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const target = resolve(output, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    hashes[name] = digest(bytes);
  }
  const manifest = { format: 1, mode: 'synthetic-only', files: hashes, headers: PUBLIC_HEADERS };
  await writeFile(resolve(dist, 'public-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = await buildPublic();
  console.log(`Built ${Object.keys(manifest.files).length} allowlisted files in dist/public (synthetic-only).`);
}
