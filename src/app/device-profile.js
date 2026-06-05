import { CONTRACT_VERSION } from '../core/domain.js';

export const DEVICE_CATEGORIES = Object.freeze(['computer', 'tablet', 'phone', 'glasses', 'unknown']);
export const INPUT_MODES = Object.freeze(['keyboard', 'pointer', 'touch', 'voice', 'gaze', 'controller']);
export const PRESENTATION_MODES = Object.freeze(['full', 'compact', 'glance', 'immersive']);

export function createDeviceProfile({
  category = 'unknown',
  viewport,
  pixelRatio = 1,
  inputModes = ['keyboard'],
  presentationMode = 'full',
  capabilities = {},
  safeArea = { top: 0, right: 0, bottom: 0, left: 0 },
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertEnum(category, DEVICE_CATEGORIES, 'category');
  assertViewport(viewport);
  assertPositiveNumber(pixelRatio, 'pixelRatio');
  assertEnumArray(inputModes, INPUT_MODES, 'inputModes');
  assertEnum(presentationMode, PRESENTATION_MODES, 'presentationMode');
  assertPlainObject(capabilities, 'capabilities');
  assertSafeArea(safeArea);
  assertPlainObject(metadata, 'metadata');

  return freezeJson({
    contractVersion,
    category,
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
    pixelRatio,
    inputModes: [...new Set(inputModes)],
    presentationMode,
    capabilities: {
      hover: Boolean(capabilities.hover),
      speech: Boolean(capabilities.speech),
      coarsePointer: Boolean(capabilities.coarsePointer),
      reducedMotion: Boolean(capabilities.reducedMotion),
    },
    safeArea: {
      top: safeArea.top ?? 0,
      right: safeArea.right ?? 0,
      bottom: safeArea.bottom ?? 0,
      left: safeArea.left ?? 0,
    },
    metadata,
  });
}

export function inferDeviceProfile({
  width,
  height,
  pixelRatio = 1,
  userAgent = '',
  hover = false,
  pointer = 'fine',
  maxTouchPoints = 0,
  speech = false,
  reducedMotion = false,
  isWearable = false,
  safeArea,
  metadata = {},
} = {}) {
  assertViewport({ width, height });
  assertPositiveNumber(pixelRatio, 'pixelRatio');

  const normalizedUserAgent = userAgent.toLowerCase();
  const hasTouch = maxTouchPoints > 0 || pointer === 'coarse';
  const looksLikeWearable = isWearable || /\b(glass|glasses|wearable|vision pro|quest|hololens)\b/.test(normalizedUserAgent);
  const narrowestSide = Math.min(width, height);
  const widestSide = Math.max(width, height);
  const isGlanceViewport = narrowestSide <= 420 && widestSide <= 720;
  const category = resolveDeviceCategory({ looksLikeWearable, isGlanceViewport, hasTouch, narrowestSide, widestSide });
  const presentationMode = resolvePresentationMode(category, { narrowestSide, widestSide });
  const inputModes = resolveInputModes({ category, hasTouch, hover, speech, pointer });

  return createDeviceProfile({
    category,
    viewport: { width, height },
    pixelRatio,
    inputModes,
    presentationMode,
    capabilities: {
      hover,
      speech,
      coarsePointer: pointer === 'coarse' || hasTouch,
      reducedMotion,
    },
    safeArea: safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 },
    metadata,
  });
}

export function inferBrowserDeviceProfile(win = globalThis.window) {
  if (!win) {
    return inferDeviceProfile({ width: 1024, height: 768, metadata: { source: 'server-default' } });
  }

  const media = (query) => Boolean(win.matchMedia?.(query).matches);
  return inferDeviceProfile({
    width: Math.round(win.innerWidth || win.document?.documentElement?.clientWidth || 1024),
    height: Math.round(win.innerHeight || win.document?.documentElement?.clientHeight || 768),
    pixelRatio: win.devicePixelRatio || 1,
    userAgent: win.navigator?.userAgent ?? '',
    hover: media('(hover: hover)'),
    pointer: media('(pointer: coarse)') ? 'coarse' : 'fine',
    maxTouchPoints: win.navigator?.maxTouchPoints ?? 0,
    speech: 'speechSynthesis' in win,
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    metadata: { source: 'browser' },
  });
}

export function applyDeviceProfileToDocument(documentRef, profile) {
  assertPlainObject(documentRef?.documentElement, 'document.documentElement');
  assertPlainObject(documentRef?.body, 'document.body');
  assertEnum(profile.category, DEVICE_CATEGORIES, 'profile.category');
  assertEnum(profile.presentationMode, PRESENTATION_MODES, 'profile.presentationMode');

  documentRef.documentElement.dataset.deviceProfile = profile.category;
  documentRef.documentElement.dataset.presentationMode = profile.presentationMode;
  documentRef.body.dataset.deviceProfile = profile.category;
  documentRef.body.dataset.presentationMode = profile.presentationMode;
  return profile;
}

export function resolveResponsiveLayout(profile) {
  assertEnum(profile.category, DEVICE_CATEGORIES, 'profile.category');
  assertEnum(profile.presentationMode, PRESENTATION_MODES, 'profile.presentationMode');

  const base = {
    category: profile.category,
    presentationMode: profile.presentationMode,
    columns: 2,
    density: 'comfortable',
    showDeveloperTrace: true,
    minimumTargetSize: 44,
  };

  if (profile.category === 'computer') return freezeJson(base);
  if (profile.category === 'tablet') return freezeJson({ ...base, columns: 1, density: 'comfortable', minimumTargetSize: 48 });
  if (profile.category === 'phone') return freezeJson({ ...base, columns: 1, density: 'compact', minimumTargetSize: 52 });
  if (profile.category === 'glasses') {
    return freezeJson({ ...base, columns: 1, density: 'glance', showDeveloperTrace: false, minimumTargetSize: 56 });
  }
  return freezeJson({ ...base, columns: 1 });
}

function resolveDeviceCategory({ looksLikeWearable, isGlanceViewport, hasTouch, narrowestSide, widestSide }) {
  if (looksLikeWearable || isGlanceViewport) return 'glasses';
  if (narrowestSide < 640) return 'phone';
  if (hasTouch && narrowestSide < 1024 && widestSide < 1400) return 'tablet';
  return 'computer';
}

function resolvePresentationMode(category, { narrowestSide }) {
  if (category === 'glasses') return 'glance';
  if (category === 'phone' || category === 'tablet' || narrowestSide < 900) return 'compact';
  return 'full';
}

function resolveInputModes({ category, hasTouch, hover, speech, pointer }) {
  const modes = new Set(['keyboard']);
  if (hover || pointer === 'fine') modes.add('pointer');
  if (hasTouch) modes.add('touch');
  if (speech) modes.add('voice');
  if (category === 'glasses') {
    modes.add('gaze');
    modes.add('voice');
  }
  return [...modes];
}

function assertViewport(viewport) {
  assertPlainObject(viewport, 'viewport');
  assertPositiveInteger(viewport.width, 'viewport.width');
  assertPositiveInteger(viewport.height, 'viewport.height');
}

function assertSafeArea(safeArea) {
  assertPlainObject(safeArea, 'safeArea');
  ['top', 'right', 'bottom', 'left'].forEach((edge) => {
    if (safeArea[edge] !== undefined) assertNonNegativeInteger(safeArea[edge], `safeArea.${edge}`);
  });
}

function assertEnumArray(value, allowedValues, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty array`);
  }
  value.forEach((item) => assertEnum(item, allowedValues, fieldName));
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} must be one of ${allowedValues.join(', ')}`);
  }
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`);
  }
}

function assertPositiveNumber(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive number`);
  }
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function freezeJson(value) {
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
