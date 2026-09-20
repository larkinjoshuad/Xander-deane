import { readFileSync } from 'node:fs';
import { createTutorApiServer } from '../src/app/tutor-api-server.js';
import { createSyntheticModelGateway } from '../src/app/model-gateway.js';

const learnerProfile = readJson('examples/shared/learner.learner-profile.json');
const consentRecord = readJson('examples/safety/guardian-consent.consent-record.json');
const safetyPolicy = readJson('examples/safety/minor.safety-policy.json');

const port = Number(process.env.PORT ?? 4180);
const allowedOrigin = 'http://127.0.0.1:4173';

const { server, gateway } = createTutorApiServer({
  gateway: createSyntheticModelGateway(),
  learnerProfile,
  consentRecord,
  safetyPolicy,
  allowedOrigin,
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Tutor API listening on http://127.0.0.1:${port} (mode: ${gateway.mode ?? 'synthetic'})`);
  console.log('Development only: synthetic responses; provider keys are ignored.');
  console.log(`Open the shell with: http://127.0.0.1:4173/app/?tutorApi=http://127.0.0.1:${port}`);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
