import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';
import {
  applyDeviceProfileToDocument,
  createDeviceProfile,
  inferDeviceProfile,
  resolveResponsiveLayout,
} from '../src/app/device-profile.js';

const deviceProfileSchema = readJson('schemas/device-profile.schema.json');

test('creates schema-compatible device profiles for portable clients', () => {
  const profile = createDeviceProfile({
    category: 'tablet',
    viewport: { width: 820, height: 1180 },
    pixelRatio: 2,
    inputModes: ['touch', 'keyboard', 'voice'],
    presentationMode: 'compact',
    capabilities: {
      hover: false,
      speech: true,
      coarsePointer: true,
      reducedMotion: false,
    },
  });

  assert.deepEqual(validateJsonSchema(profile, deviceProfileSchema), []);
  assert.equal(profile.category, 'tablet');
  assert.ok(Object.isFrozen(profile));
});

test('infers computer, tablet, phone, and glasses layout categories', () => {
  const computer = inferDeviceProfile({ width: 1440, height: 900, hover: true, pointer: 'fine' });
  const tablet = inferDeviceProfile({ width: 820, height: 1180, pointer: 'coarse', maxTouchPoints: 5 });
  const phone = inferDeviceProfile({ width: 390, height: 844, pointer: 'coarse', maxTouchPoints: 5 });
  const glasses = inferDeviceProfile({ width: 360, height: 360, isWearable: true, speech: true });

  assert.equal(computer.category, 'computer');
  assert.equal(tablet.category, 'tablet');
  assert.equal(phone.category, 'phone');
  assert.equal(glasses.category, 'glasses');
  assert.equal(glasses.presentationMode, 'glance');
  assert.ok(glasses.inputModes.includes('gaze'));
  assert.ok(glasses.inputModes.includes('voice'));
});

test('resolves responsive layout policy by device profile', () => {
  const phone = inferDeviceProfile({ width: 390, height: 844, pointer: 'coarse', maxTouchPoints: 5 });
  const glasses = inferDeviceProfile({ width: 360, height: 360, isWearable: true });

  assert.deepEqual(resolveResponsiveLayout(phone), {
    category: 'phone',
    presentationMode: 'compact',
    columns: 1,
    density: 'compact',
    showDeveloperTrace: true,
    minimumTargetSize: 52,
  });
  assert.deepEqual(resolveResponsiveLayout(glasses), {
    category: 'glasses',
    presentationMode: 'glance',
    columns: 1,
    density: 'glance',
    showDeveloperTrace: false,
    minimumTargetSize: 56,
  });
});

test('applies profile data attributes for CSS layout hooks', () => {
  const profile = inferDeviceProfile({ width: 360, height: 360, isWearable: true });
  const documentRef = {
    documentElement: { dataset: {} },
    body: { dataset: {} },
  };

  applyDeviceProfileToDocument(documentRef, profile);

  assert.equal(documentRef.documentElement.dataset.deviceProfile, 'glasses');
  assert.equal(documentRef.documentElement.dataset.presentationMode, 'glance');
  assert.equal(documentRef.body.dataset.deviceProfile, 'glasses');
  assert.equal(documentRef.body.dataset.presentationMode, 'glance');
});

test('rejects invalid viewport dimensions before layout selection', () => {
  assert.throws(
    () => inferDeviceProfile({ width: 0, height: 844 }),
    /viewport.width must be a positive integer/,
  );
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
