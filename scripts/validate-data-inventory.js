import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJsonSchema } from './validate-fixtures.js';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DEFAULT_INVENTORY_PATH = join(REPO_ROOT, 'examples/governance/base.data-inventory.json');
const INVENTORY_SCHEMA_PATH = join(REPO_ROOT, 'schemas/data-inventory.schema.json');
const REGISTRY_PATH = join(REPO_ROOT, 'schemas/index.json');
const RISK_ORDER = Object.freeze(['none', 'low', 'medium', 'high']);
const BLOCKED_CLASSIFICATIONS = Object.freeze(['restricted', 'prohibited_until_review']);

export function validateDataInventory({
  inventoryPath = DEFAULT_INVENTORY_PATH,
  registryPath = REGISTRY_PATH,
  inventorySchemaPath = INVENTORY_SCHEMA_PATH,
  repoRoot = REPO_ROOT,
} = {}) {
  const inventory = readJson(inventoryPath);
  const schema = readJson(inventorySchemaPath);
  const registry = readJson(registryPath);
  const errors = validateJsonSchema(inventory, schema);

  const recordsByName = new Map();
  for (const [index, record] of inventory.records.entries()) {
    const path = `records[${index}]`;
    if (recordsByName.has(record.contractName)) {
      errors.push(`${path}.contractName duplicates ${record.contractName}`);
    }
    recordsByName.set(record.contractName, record);

    if (!existsSync(join(repoRoot, record.schemaPath))) {
      errors.push(`${path}.schemaPath does not exist: ${record.schemaPath}`);
    }
    if (BLOCKED_CLASSIFICATIONS.includes(record.classification) && record.realDataAllowed) {
      errors.push(`${path}.realDataAllowed must be false for ${record.classification}`);
    }
    if (record.piiRisk === 'high' && record.productionRequirements.length === 0) {
      errors.push(`${path}.productionRequirements must not be empty for high-risk records`);
    }
    if (record.requiresConsentScopes.length > 0 && !record.productionRequirements.some((item) => item.includes('consent') || item.includes('authority'))) {
      errors.push(`${path}.productionRequirements must include consent or authority for scoped records`);
    }
  }

  for (const entry of registry.schemas) {
    const record = recordsByName.get(entry.name);
    if (!record) {
      errors.push(`inventory is missing registry schema ${entry.name}`);
      continue;
    }
    if (record.schemaPath !== entry.schemaPath) {
      errors.push(`inventory record ${entry.name} schemaPath must match registry path ${entry.schemaPath}`);
    }
  }

  for (const name of recordsByName.keys()) {
    if (!registry.schemas.some((entry) => entry.name === name)) {
      errors.push(`inventory record ${name} is not present in schemas/index.json`);
    }
  }

  const highRiskRealData = inventory.records
    .filter((record) => RISK_ORDER.indexOf(record.piiRisk) >= RISK_ORDER.indexOf('medium'))
    .filter((record) => record.realDataAllowed)
    .map((record) => record.contractName);
  if (highRiskRealData.length > 0) {
    errors.push(`medium/high-risk records cannot allow real data in prototype mode: ${highRiskRealData.join(', ')}`);
  }

  return {
    inventoryPath,
    registryPath,
    valid: errors.length === 0,
    errors,
    recordCount: inventory.records.length,
    blockedCount: inventory.records.filter((record) => !record.realDataAllowed).length,
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isCliEntryPoint() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isCliEntryPoint()) {
  const result = validateDataInventory();
  const relativeInventory = relative(REPO_ROOT, result.inventoryPath);
  const relativeRegistry = relative(REPO_ROOT, result.registryPath);
  if (result.valid) {
    console.log(`ok ${relativeInventory} covers ${result.recordCount} schemas from ${relativeRegistry}; ${result.blockedCount} records remain synthetic/review-gated`);
  } else {
    console.error(`not ok ${relativeInventory}`);
    result.errors.forEach((error) => console.error(`  - ${error}`));
    process.exitCode = 1;
  }
}
