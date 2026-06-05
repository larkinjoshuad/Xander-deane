#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = new URL('..', import.meta.url).pathname;


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
  const errors = [];

  if (!schema || Object.keys(schema).length === 0) {
    return errors;
  }

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push(`${path} must be ${formatType(schema.type)}`);
    return errors;
  }

  if (schema.enum && !schema.enum.some((allowed) => deepEqual(value, allowed))) {
    errors.push(`${path} must be one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} must be at least ${schema.minLength} characters`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} must match pattern ${schema.pattern}`);
    }
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      errors.push(`${path} must be a valid date-time`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateJsonSchema(item, schema.items, `${path}[${index}]`));
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];

    required.forEach((key) => {
      if (!Object.hasOwn(value, key)) {
        errors.push(`${path}.${key} is required`);
      }
    });

    if (schema.additionalProperties === false) {
      Object.keys(value).forEach((key) => {
        if (!Object.hasOwn(properties, key)) {
          errors.push(`${path}.${key} is not allowed`);
        }
      });
    }

    Object.entries(properties).forEach(([key, propertySchema]) => {
      if (Object.hasOwn(value, key)) {
        errors.push(...validateJsonSchema(value[key], propertySchema, `${path}.${key}`));
      }
    });
  }

  return errors;
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

function matchesType(value, type) {
  const allowedTypes = Array.isArray(type) ? type : [type];
  return allowedTypes.some((allowedType) => {
    if (allowedType === 'array') return Array.isArray(value);
    if (allowedType === 'object') return isPlainObject(value);
    if (allowedType === 'null') return value === null;
    if (allowedType === 'integer') return Number.isInteger(value);
    return typeof value === allowedType;
  });
}

function formatType(type) {
  return Array.isArray(type) ? type.join(' or ') : type;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
