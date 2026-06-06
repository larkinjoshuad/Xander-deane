import { readFileSync } from 'node:fs';
import { createTutorApiServer } from '../src/app/tutor-api-server.js';

const learnerProfile = readJson('examples/shared/learner.learner-profile.json');
const consentRecord = readJson('examples/safety/guardian-consent.consent-record.json');
const safetyPolicy = readJson('examples/safety/minor.safety-policy.json');

const port = Number(process.env.PORT ?? 4180);
const allowedOrigin = process.env.TUTOR_ALLOWED_ORIGIN ?? '*';

const { server, gateway } = createTutorApiServer({
  learnerProfile,
  consentRecord,
  safetyPolicy,
  allowedOrigin,
});

server.listen(port, () => {
  console.log(`Tutor API listening on http://127.0.0.1:${port} (mode: ${gateway.mode ?? 'synthetic'})`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No ANTHROPIC_API_KEY set — serving deterministic synthetic tutor responses.');
    console.log('Set ANTHROPIC_API_KEY to enable the live Claude tutor.');
  }
  console.log(`Open the shell with: http://127.0.0.1:4173/app/?tutorApi=http://127.0.0.1:${port}`);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
