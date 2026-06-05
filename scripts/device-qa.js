#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferDeviceProfile,
  resolveResponsiveLayout,
} from '../src/app/device-profile.js';

const REPO_ROOT = new URL('..', import.meta.url).pathname;

export const DEVICE_QA_PRESETS = Object.freeze([
  {
    id: 'desktop-computer',
    description: 'Desktop/laptop browser with keyboard, pointer, and hover.',
    input: { width: 1440, height: 900, pixelRatio: 1, hover: true, pointer: 'fine', maxTouchPoints: 0 },
    expected: { category: 'computer', presentationMode: 'full', minimumTargetSize: 44, showDeveloperTrace: true },
  },
  {
    id: 'tablet-portrait',
    description: 'Touch-first tablet portrait viewport with optional keyboard and voice.',
    input: { width: 820, height: 1180, pixelRatio: 2, hover: false, pointer: 'coarse', maxTouchPoints: 5, speech: true },
    expected: { category: 'tablet', presentationMode: 'compact', minimumTargetSize: 48, showDeveloperTrace: true },
  },
  {
    id: 'phone-portrait',
    description: 'Narrow touch phone viewport with safe-area-sensitive single-column layout.',
    input: { width: 390, height: 844, pixelRatio: 3, hover: false, pointer: 'coarse', maxTouchPoints: 5, speech: true },
    expected: { category: 'phone', presentationMode: 'compact', minimumTargetSize: 52, showDeveloperTrace: true },
  },
  {
    id: 'smart-glasses-glance',
    description: 'Wearable/glance viewport with voice and gaze-friendly target sizing.',
    input: { width: 360, height: 360, pixelRatio: 2, hover: false, pointer: 'coarse', maxTouchPoints: 0, speech: true, isWearable: true },
    expected: { category: 'glasses', presentationMode: 'glance', minimumTargetSize: 56, showDeveloperTrace: false },
  },
]);

const REQUIRED_HTML_SNIPPETS = Object.freeze([
  { id: 'viewport-meta', file: 'app/index.html', snippet: 'name="viewport"' },
  { id: 'device-status-chip', file: 'app/index.html', snippet: 'id="device-status"' },
  { id: 'responsive-device-import', file: 'app/main.js', snippet: 'inferBrowserDeviceProfile' },
  { id: 'document-profile-hook', file: 'app/main.js', snippet: 'applyDeviceProfileToDocument' },
]);

const REQUIRED_CSS_SNIPPETS = Object.freeze([
  { id: 'tablet-breakpoint', snippet: '@media (max-width: 1024px)' },
  { id: 'phone-breakpoint', snippet: '@media (max-width: 640px)' },
  { id: 'glance-breakpoint', snippet: '@media (max-width: 420px) and (max-height: 720px)' },
  { id: 'glance-data-hook', snippet: 'data-presentation-mode="glance"' },
  { id: 'glasses-data-hook', snippet: 'data-device-profile="glasses"' },
  { id: 'coarse-pointer-targets', snippet: '@media (hover: none), (pointer: coarse)' },
  { id: 'safe-area-padding', snippet: 'env(safe-area-inset-top)' },
  { id: 'reduced-motion', snippet: '@media (prefers-reduced-motion: reduce)' },
  { id: 'forced-colors', snippet: '@media (forced-colors: active)' },
]);

export function runDeviceQa({ repoRoot = REPO_ROOT } = {}) {
  const presetChecks = DEVICE_QA_PRESETS.map(validateDevicePreset);
  const htmlChecks = REQUIRED_HTML_SNIPPETS.map((requirement) => validateFileSnippet(requirement, repoRoot));
  const css = readFileSync(join(repoRoot, 'app/styles.css'), 'utf8');
  const cssChecks = REQUIRED_CSS_SNIPPETS.map((requirement) => validateSnippet({
    ...requirement,
    file: 'app/styles.css',
    source: css,
  }));
  const checks = [...presetChecks, ...htmlChecks, ...cssChecks];

  return {
    valid: checks.every((check) => check.valid),
    checks,
  };
}

function validateDevicePreset(preset) {
  const profile = inferDeviceProfile({ ...preset.input, metadata: { qaPreset: preset.id } });
  const layout = resolveResponsiveLayout(profile);
  const issues = [];

  Object.entries(preset.expected).forEach(([key, expectedValue]) => {
    const actualValue = key in layout ? layout[key] : profile[key];
    if (actualValue !== expectedValue) {
      issues.push(`${key} expected ${expectedValue} but received ${actualValue}`);
    }
  });

  if (profile.category === 'glasses' && !profile.inputModes.includes('gaze')) {
    issues.push('smart-glasses profile must include gaze input mode');
  }

  if ((profile.category === 'tablet' || profile.category === 'phone') && !profile.inputModes.includes('touch')) {
    issues.push(`${profile.category} profile must include touch input mode`);
  }

  return {
    id: `device-preset:${preset.id}`,
    valid: issues.length === 0,
    summary: `${preset.description} -> ${profile.category}/${profile.presentationMode}/${layout.minimumTargetSize}px`,
    issues,
    profile,
    layout,
  };
}

function validateFileSnippet(requirement, repoRoot) {
  const source = readFileSync(join(repoRoot, requirement.file), 'utf8');
  return validateSnippet({ ...requirement, source });
}

function validateSnippet({ id, file, snippet, source }) {
  const valid = source.includes(snippet);
  return {
    id: `source:${id}`,
    valid,
    summary: `${file} contains ${snippet}`,
    issues: valid ? [] : [`${file} is missing required snippet: ${snippet}`],
  };
}

function isCliEntryPoint() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isCliEntryPoint()) {
  const result = runDeviceQa();
  result.checks.forEach((check) => {
    const prefix = check.valid ? 'ok' : 'not ok';
    console.log(`${prefix} ${check.id} - ${check.summary}`);
    check.issues.forEach((issue) => console.error(`  - ${issue}`));
  });

  if (!result.valid) {
    process.exitCode = 1;
  }
}
