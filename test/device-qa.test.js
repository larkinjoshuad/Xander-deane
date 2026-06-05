import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEVICE_QA_PRESETS,
  runDeviceQa,
} from '../scripts/device-qa.js';

test('device QA covers computer, tablet, phone, and smart-glasses presets', () => {
  const result = runDeviceQa();
  const presetChecks = result.checks.filter((check) => check.id.startsWith('device-preset:'));

  assert.equal(result.valid, true);
  assert.deepEqual(
    presetChecks.map((check) => check.profile.category),
    ['computer', 'tablet', 'phone', 'glasses'],
  );
  assert.deepEqual(
    presetChecks.map((check) => check.layout.minimumTargetSize),
    [44, 48, 52, 56],
  );
});

test('device QA enforces source hooks required by the adaptive shell', () => {
  const result = runDeviceQa();
  const sourceCheckIds = result.checks
    .filter((check) => check.id.startsWith('source:'))
    .map((check) => check.id);

  assert.ok(sourceCheckIds.includes('source:viewport-meta'));
  assert.ok(sourceCheckIds.includes('source:device-status-chip'));
  assert.ok(sourceCheckIds.includes('source:glance-data-hook'));
  assert.ok(sourceCheckIds.includes('source:forced-colors'));
});

test('device QA preset definitions are documented enough for QA handoff', () => {
  DEVICE_QA_PRESETS.forEach((preset) => {
    assert.match(preset.id, /^[a-z-]+$/);
    assert.ok(preset.description.length >= 20);
    assert.ok(Number.isInteger(preset.input.width));
    assert.ok(Number.isInteger(preset.input.height));
    assert.ok(preset.expected.category);
  });
});
