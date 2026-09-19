import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_GAMES, createPlayState, playPieces, dropPlayPiece } from '../src/app/play-together.js';

test('all nine play activities finish only with their intended objects and locations', () => {
  for (const [game, activities] of Object.entries(PLAY_GAMES)) {
    activities.forEach((activity, round) => {
      let state = createPlayState(game, round);
      const destination = game === 'picnic' ? 'plate' : game === 'pack' ? 'bag' : activity.destination;
      const initial = state;
      assert.equal(dropPlayPiece(state, 'invented', destination), state);
      const first = playPieces(state)[0];
      assert.equal(dropPlayPiece(state, first.id, 'elsewhere').complete, false);
      assert.deepEqual(state, initial);
      for (const piece of playPieces(state).filter(piece => piece.item === activity.item)) {
        state = dropPlayPiece(state, piece.id, destination);
        assert.equal(dropPlayPiece(state, piece.id, destination), state);
      }
      assert.equal(state.complete, true);
      assert.equal(state.placed.length, activity.count ?? 1);
      assert.deepEqual(playPieces(state), []);
      assert.ok(activity.offline.length > 20);
    });
  }
});

test('packing rejects a distractor and picnic requires all distinct pieces', () => {
  let pack = createPlayState('pack');
  pack = dropPlayPiece(pack, 'ball-1', 'bag');
  assert.equal(pack.complete, false);
  assert.deepEqual(pack.placed, []);
  let picnic = createPlayState('picnic', 2);
  picnic = dropPlayPiece(picnic, 'apple-0', 'plate');
  assert.equal(picnic.complete, false);
  assert.equal(dropPlayPiece(picnic, 'apple-0', 'plate'), picnic);
  assert.equal(playPieces(picnic).length, 2);
});

test('invalid game and round values are rejected', () => {
  for (const [game, round] of [['unknown', 0], ['__proto__', 0], ['picnic', -1], ['pack', 3], ['hide', 0.5]]) {
    assert.throws(() => createPlayState(game, round), RangeError);
  }
});
