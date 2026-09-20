// Read-only probes against synthetic fixtures and an isolated browser context.
// This records observations; it is not a passing security certification.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { chromium, devices } from '@playwright/test';
import { ACTIVITY_LIBRARY } from '../src/app/activity-library.js';
import { createInitialLearningSession, selectToken, checkWorkspaceAnswer } from '../src/app/learning-session.js';
import { createSkillMasteryForSession, updateSkillMasteryForSession } from '../app/learner-insights.js';
import { createClaudeModelGateway, buildTutorUserContent } from '../src/app/model-gateway-claude.js';
import { createTutorContext } from '../src/app/tutor-context.js';
import { createTutorApiServer } from '../src/app/tutor-api-server.js';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const now = () => '2026-05-30T00:00:00.000Z';
const report = { observedAt: new Date().toISOString(), syntheticOnly: true };
const math = ACTIVITY_LIBRARY.filter(a => ['add', 'subtract', 'multiply'].includes(a.id)).flatMap(a => a.rounds);
report.smallestAnswerShortcut = { total: math.length, smallestIsCorrect: math.filter(r => Number(r.answer[0]) === Math.min(...r.choices.map(c => Number(c.id)))).length };
let session = createInitialLearningSession({ objective: read('examples/language/objective.learning-objective.json'), problem: read('examples/language/problem.problem.json') });
session = selectToken(session, session.workspaceSnapshot.state.tokens.indexOf('runs'), now);
let mastery = createSkillMasteryForSession(session, { now });
for (let i = 0; i < 5; i++) {
  session = checkWorkspaceAnswer(session, now);
  mastery = updateSkillMasteryForSession(mastery, session, { now });
}
report.repeatedCheck = { attempts: mastery.attemptCount, level: mastery.masteryLevel, confidence: mastery.confidence, distinctProblems: new Set(mastery.evidence.map(e => e.problemId)).size };
const fixtures = { learnerProfile: read('examples/shared/learner.learner-profile.json'), consentRecord: read('examples/safety/guardian-consent.consent-record.json'), safetyPolicy: read('examples/safety/minor.safety-policy.json') };
const context = createTutorContext({ session, ...fixtures, consentRecord: null, mayCallAi: false, generatedAt: now(), metadata: { dataMode: 'synthetic' } });
let providerCalls = 0;
const gateway = createClaudeModelGateway({ now, client: { messages: { parse: async () => {
  providerCalls++;
  return { parsed_output: { feedbackType: 'hint', messageText: 'Try again.', speechText: 'Try again.', nextAction: 'retry', highlightTargets: [], answerRevealed: false, confidence: 'low' } };
} } } });
await gateway.generateTutorResponse(context);
report.deniedContextProviderCalls = providerCalls;
const modified = structuredClone(context);
modified.problem.prompt = 'SYNTHETIC_AUDIT_UNTRUSTED_TEXT';
report.untrustedPromptForwarded = buildTutorUserContent(modified).includes('SYNTHETIC_AUDIT_UNTRUSTED_TEXT');
let endpointCalls = 0;
const { server } = createTutorApiServer({ ...fixtures, now, gateway: { mode: 'audit_stub', generateTutorResponse: async () => { endpointCalls++; return { mode: 'audit_stub', tutorResponse: {} }; } } });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/tutor/respond`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://audit.invalid' }, body: JSON.stringify({ session }) });
  report.unauthenticatedTutor = { status: response.status, cors: response.headers.get('access-control-allow-origin'), gatewayCalls: endpointCalls };
} finally { await new Promise(resolve => server.close(resolve)); }
report.tabletBrowser = devices['iPad (gen 7)'].defaultBrowserType;

mkdirSync('test-results/release-audit', { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const remoteRequests = new Set();
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:4173/')) remoteRequests.add(new URL(req.url()).origin); });
  const base = 'http://127.0.0.1:4173';
  report.staticExposure = {};
  for (const path of ['/.git/HEAD', '/package.json', '/app/prototype.html']) {
    const response = await page.request.get(base + path);
    report.staticExposure[path] = response.status();
  }
  const response = await page.goto(`${base}/app/library.html?activity=rhymes`);
  report.responseHeaders = await response.allHeaders();
  await page.locator('.library-choice').first().focus();
  await page.keyboard.press('Enter');
  report.focusAfterAnswer = await page.evaluate(() => document.activeElement.tagName);
  await page.locator('#next').click();
  await page.reload();
  report.positionAfterReload = await page.locator('#round-position').textContent();
  await page.screenshot({ path: 'test-results/release-audit/library-phone.png', fullPage: true });
  for (const route of ['toddler', 'play-together', 'parent']) {
    await page.goto(`${base}/app/${route}.html`);
    await page.screenshot({ path: `test-results/release-audit/${route}-phone.png`, fullPage: true });
  }
  report.remoteOriginsDuringSampledFlows = [...remoteRequests];
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Synthetic audit: quota exceeded', 'QuotaExceededError'); };
  });
  await page.goto(`${base}/app/learn.html`);
  await page.waitForFunction(() => document.querySelector('#tutor-message')?.textContent.includes('Something went wrong'));
  report.storageFailure = await page.locator('#tutor-message').textContent();
} finally { await browser.close(); }
writeFileSync('test-results/release-audit/observations.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
