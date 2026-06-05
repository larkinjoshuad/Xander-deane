# Browser Automation QA

The fake-DOM `test:browser` harness is useful for dependency-free renderer coverage, but it does not prove the web shell works in a real browser. The next product-readiness gate is Playwright-based browser automation against the static shell.

## What this adds

- `playwright.config.js` starts the static HTTP server and runs tests against `/app/`.
- `e2e/learning-shell.spec.js` covers math, language, science, incorrect-answer retry feedback, reset/recovery, keyboard workspace placement, responsive device hooks, and keyboard reachability.
- `e2e/accessibility.spec.js` runs axe-core checks against the initial shell and each workspace, failing on serious or critical automated accessibility violations, and verifies named landmarks/live regions for assistive technology.
- `npm run test:e2e` runs the browser test suite after Playwright browsers are installed.
- `npm run test:e2e:install` installs the Chromium browser bundle needed by local runs when a Playwright container is not used.

## Covered user flows

1. Complete the math equal-groups workspace in a real browser and verify persisted recovery after reload.
2. Check an incomplete math answer, verify retry guidance, reset the workspace, and verify the cleared state survives reload.
3. Switch to the language token-selection workspace and check a correct answer.
4. Switch to the science classification-sort workspace and check a correct answer.
5. Place math counters and science sort items through keyboard activation on workspace drop targets.
6. Validate device-profile data hooks across desktop, tablet, phone, and glasses/glance viewport projects.
7. Confirm critical shell controls are keyboard reachable.
8. Run automated accessibility checks for the shell, math, language, and science workspaces.
9. Capture review screenshots for the initial shell and completed math/guardian-preview state across every configured browser/device project.

## Recommended CI order

The repository now includes `.github/workflows/quality.yml` with two quality-gate jobs:

1. `contract-runtime` runs fixture validation, the Node test suite, device QA, and the dependency-free DOM product-flow harness.
2. `browser-e2e` runs the Playwright shell tests inside the official Playwright container image so Chromium is available without relying on a fresh CDN download during every run. It also uploads intentional browser verification screenshots from `test-results/**/verification-*.png` for review, separate from failure-only traces.

For local development, use:

```bash
npm ci
npm run validate:fixtures
npm test
npm run test:device
npm run test:e2e:install
npm run test:e2e
```

If local or CI environments cannot download browser binaries, use the Playwright container image or a runner image with Chromium already installed. The accessibility checks are automated axe-core smoke tests, not a replacement for manual WCAG review, assistive-technology testing, or classroom device QA. The project should not use real learner data until this real-browser gate passes alongside consent/safety and session-persistence tests.
