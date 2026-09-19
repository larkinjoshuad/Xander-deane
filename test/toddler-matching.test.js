import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCHING_SETS, matchingRound, isMatchingDrop } from '../src/app/toddler-matching.js';

test('toddler rounds cover all 26 letters and 10 numbers exactly once', () => {
  for (const [mode, values] of Object.entries(MATCHING_SETS)) {
    const rounds = Array.from({ length: values.length / 2 }, (_, index) => matchingRound(mode, index));
    assert.deepEqual(rounds.flat(), values);
    assert.equal(new Set(rounds.flat()).size, values.length);
    rounds.forEach(symbols => {
      assert.equal(isMatchingDrop(symbols, symbols[0], symbols[0]), true);
      assert.equal(isMatchingDrop(symbols, symbols[0], symbols[1]), false);
      assert.equal(isMatchingDrop(symbols, '?', '?'), false);
    });
  }
});
test('unknown modes and invalid rounds are rejected', () => {
  for (const [mode, round] of [['other', 0], ['letters', -1], ['letters', 13], ['numbers', 5], ['numbers', 1.5]]) {
    assert.throws(() => matchingRound(mode, round), RangeError);
  }
});
