import assert from 'node:assert/strict';
import { test } from 'node:test';
import { touchFeedback } from '../app/touch-feedback.js';

const session = {
  problem: { id: 'science.animals.sort-feathers' },
  events: [{ type: 'answer_checked' }], evaluation: { isCorrect: false },
  tutorResponse: { messageText: 'Missing from feathers: eagle. Misplaced there: snake.' },
};
test('science retry feedback withholds exact corrections', () => {
  assert.match(touchFeedback(session), /Which ones have feathers/);
  assert.doesNotMatch(touchFeedback(session), /eagle|snake|Missing|Misplaced/);
});
test('explicit hints retain the existing hint ladder and other subjects are unchanged', () => {
  assert.equal(touchFeedback({ ...session, events: [{ type: 'hint_requested' }] }), session.tutorResponse.messageText);
  assert.equal(touchFeedback({ ...session, problem: { id: 'math' } }), session.tutorResponse.messageText);
  assert.match(touchFeedback({ ...session, evaluation: { isCorrect: true } }), /Yes!/);
  assert.doesNotMatch(touchFeedback({ ...session, events: [{ type: 'user_dragged' }] }), /eagle|snake/);
});
