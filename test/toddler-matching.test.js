import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCHING_SETS, matchingRound, isMatchingDrop, matchingVisual } from '../src/app/toddler-matching.js';

test('toddler rounds cover each activity symbol exactly once', () => {
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

test('size rounds compare the same shape at two sizes without changing its name', () => {
  for (let round = 0; round < 3; round++) {
    const pair = matchingRound('sizes', round).map(symbol => matchingVisual('sizes', symbol));
    assert.equal(pair[0].shape, pair[1].shape);
    assert.deepEqual(new Set(pair.map(item => item.size)), new Set(['big', 'small']));
  }
  assert.equal(MATCHING_SETS.shapes.length, 6);
  MATCHING_SETS.shapes.forEach(symbol => assert.equal(matchingVisual('shapes', symbol).shape, symbol));
  assert.throws(() => matchingVisual('sizes', 'big_star'), RangeError);
});
test('unknown modes and invalid rounds are rejected', () => {
  for (const [mode, round] of [['other', 0], ['letters', -1], ['letters', 13], ['numbers', 5], ['numbers', 1.5]]) {
    assert.throws(() => matchingRound(mode, round), RangeError);
  }
});
