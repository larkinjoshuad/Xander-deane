#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, addUsedSchema: false });
addFormats(ajv);

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));


export function loadSchemaRegistry(repoRoot = REPO_ROOT) {
  const registryPath = join(repoRoot, 'schemas/index.json');
  return readJson(registryPath);
}

export function fixtureSchemaSuffixesFromRegistry(registry) {
  return Object.freeze(Object.fromEntries(
    registry.schemas.map((entry) => [entry.fixtureSuffix, entry.schemaPath]),
  ));
}

export function validateSchemaRegistry(repoRoot = REPO_ROOT) {
  const registryPath = join(repoRoot, 'schemas/index.json');
  const registrySchemaPath = join(repoRoot, 'schemas/schema-registry.schema.json');
  const registry = readJson(registryPath);
  const registrySchema = readJson(registrySchemaPath);
  const errors = validateJsonSchema(registry, registrySchema);
  const seenNames = new Set();
  const seenSuffixes = new Set();

  registry.schemas.forEach((entry, index) => {
    const entryPath = `$.schemas[${index}]`;
    if (seenNames.has(entry.name)) {
      errors.push(`${entryPath}.name duplicates ${entry.name}`);
    }
    seenNames.add(entry.name);

    if (seenSuffixes.has(entry.fixtureSuffix)) {
      errors.push(`${entryPath}.fixtureSuffix duplicates ${entry.fixtureSuffix}`);
    }
    seenSuffixes.add(entry.fixtureSuffix);

    const schemaPath = join(repoRoot, entry.schemaPath);
    if (!existsSync(schemaPath)) {
      errors.push(`${entryPath}.schemaPath does not exist: ${entry.schemaPath}`);
      return;
    }

    const schema = readJson(schemaPath);
    if (schema.$id !== entry.schemaId) {
      errors.push(`${entryPath}.schemaId must match ${schema.$id}`);
    }
  });

  return {
    filePath: registryPath,
    schemaPath: registrySchemaPath,
    valid: errors.length === 0,
    errors,
  };
}


export function validateFixtureFile(filePath, repoRoot = REPO_ROOT) {
  const schemaPath = schemaPathForFixture(filePath, repoRoot);
  const schema = readJson(schemaPath);
  const data = readJson(filePath);
  const errors = validateJsonSchema(data, schema);

  return {
    filePath,
    schemaPath,
    valid: errors.length === 0,
    errors,
  };
}

export function validateFixtureTree(rootDir = join(REPO_ROOT, 'examples')) {
  const registry = loadSchemaRegistry(REPO_ROOT);
  const fixtureSchemaSuffixes = fixtureSchemaSuffixesFromRegistry(registry);
  return collectJsonFiles(rootDir)
    .filter((filePath) => Boolean(schemaPathForFixture(filePath, REPO_ROOT, false, fixtureSchemaSuffixes)))
    .map((filePath) => validateFixtureFile(filePath));
}

export function validateJsonSchema(value, schema, path = '$') {
  const validate = ajv.compile(schema);
  if (validate(value)) return [];
  return validate.errors.map((error) => {
    const location = path + error.instancePath.split('/').slice(1)
      .map((part) => `[${JSON.stringify(part.replaceAll('~1', '/').replaceAll('~0', '~'))}]`).join('');
    if (error.keyword === 'required') {
      return `${location}.${error.params.missingProperty} is required`;
    }
    if (error.keyword === 'enum') {
      return `${location} must be one of ${JSON.stringify(error.params.allowedValues)}`;
    }
    return `${location} ${error.message}`;
  });
}

function schemaPathForFixture(filePath, repoRoot = REPO_ROOT, shouldThrow = true, fixtureSchemaSuffixes = fixtureSchemaSuffixesFromRegistry(loadSchemaRegistry(repoRoot))) {
  const fileName = basename(filePath);
  const match = Object.entries(fixtureSchemaSuffixes).find(([suffix]) => fileName.endsWith(suffix));

  if (!match) {
    if (shouldThrow) {
      throw new Error(`No schema mapping found for fixture ${filePath}`);
    }
    return null;
  }

  return join(repoRoot, match[1]);
}

function collectJsonFiles(dir) {
  return readdirSync(dir)
    .flatMap((entry) => {
      const entryPath = join(dir, entry);
      const stats = statSync(entryPath);
      if (stats.isDirectory()) return collectJsonFiles(entryPath);
      if (stats.isFile() && entryPath.endsWith('.json')) return [entryPath];
      return [];
    })
    .sort();
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isCliEntryPoint() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isCliEntryPoint()) {
  const registryResult = validateSchemaRegistry();
  const results = [registryResult, ...validateFixtureTree()];
  const failures = results.filter((result) => !result.valid);

  results.forEach((result) => {
    const relativeFixture = result.filePath.replace(REPO_ROOT, '');
    const relativeSchema = result.schemaPath.replace(REPO_ROOT, '');
    if (result.valid) {
      console.log(`ok ${relativeFixture} -> ${relativeSchema}`);
    } else {
      console.error(`not ok ${relativeFixture} -> ${relativeSchema}`);
      result.errors.forEach((error) => console.error(`  - ${error}`));
    }
  });

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}
