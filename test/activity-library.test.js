import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';
import { ACTIVITY_LIBRARY, getActivity, libraryCounts, checkLibraryAnswer, displayChoices, memoryDeck } from '../src/app/activity-library.js';

test('all activity sets validate, have distinct choices and reachable answers', () => {
  const schema = JSON.parse(readFileSync('schemas/activity-set.schema.json', 'utf8'));
  assert.equal(new Set(ACTIVITY_LIBRARY.map(item => item.id)).size, ACTIVITY_LIBRARY.length);
  for (const activity of ACTIVITY_LIBRARY) {
    assert.deepEqual(validateJsonSchema(activity, schema), [], activity.id);
    activity.rounds.forEach((round, index) => {
      assert.equal(new Set(round.choices.map(item => item.id)).size, round.choices.length);
      assert.ok(round.answer.every(id => round.choices.some(item => item.id === id)));
      assert.equal(checkLibraryAnswer(activity, index, round.answer), true);
      assert.equal(checkLibraryAnswer(activity, index, []), false);
      assert.equal(checkLibraryAnswer(activity, index, ['invalid']), false);
      assert.deepEqual(new Set(displayChoices(round, index).map(item => item.id)), new Set(round.choices.map(item => item.id)));
      if (activity.kind === 'choice') assert.equal(round.answer.length, 1);
      else assert.equal(round.answer.length, round.choices.length);
    });
  }
  assert.equal(getActivity('unknown'), null);
});
test('catalog counts are exact, not estimated', () => {
  assert.deepEqual(libraryCounts(), {
    toddler: { activities: 6, problems: 33 }, math: { activities: 6, problems: 123 },
    language: { activities: 6, problems: 46 }, science: { activities: 6, problems: 39 },
  });
});
test('memory shuffle preserves exactly two of every picture and varies positions', () => {
  const round = getActivity('picture-memory').rounds[0];
  const first = memoryDeck(round, () => 0).map(item => item.id);
  const second = memoryDeck(round, () => .99).map(item => item.id);
  assert.notDeepEqual(first, second);
  for (const choice of round.choices) assert.equal(first.filter(id => id === choice.id).length, 2);
});
test('arithmetic answers are independently recomputed for every generated question', () => {
  for (const id of ['add', 'subtract', 'multiply']) getActivity(id).rounds.forEach(round => {
    const [a, b] = round.prompt.match(/\d+/g).map(Number);
    const expected = id === 'add' ? a + b : id === 'subtract' ? a - b : a * b;
    assert.equal(Number(round.answer[0]), expected);
    assert.equal(round.choices.filter(choice => Number(choice.id) === expected).length, 1);
  });
  getActivity('compare').rounds.forEach(round => assert.equal(Number(round.answer[0]), Math.max(...round.choices.map(item => Number(item.id)))));
  for (const id of ['number-order','skip-count']) getActivity(id).rounds.forEach(round => {
    const values = round.answer.map(Number);
    assert.deepEqual(values, [...values].sort((a,b) => a-b));
    assert.equal(values[1] - values[0], values[2] - values[1]);
  });
});
