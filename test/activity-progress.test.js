import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIVITY_LIBRARY, getActivity } from '../src/app/activity-library.js';
import { ACTIVITY_PROGRESS_NAMESPACE as PREFIX, createActivityProgressStore, validActivityProgress } from '../src/app/activity-progress.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const schema = JSON.parse(readFileSync('schemas/activity-progress.schema.json', 'utf8'));
const blank = (index = 0) => ({ index, answer: [], checked: false, deck: [], exposed: [], matched: [] });
function storageFixture() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('all catalog activities produce schema-valid records and survive a new store instance', () => {
  const storage = storageFixture(), store = createActivityProgressStore({ storage });
  for (const activity of ACTIVITY_LIBRARY) {
    const state = blank();
    if (activity.kind === 'memory') state.deck = activity.rounds[0].choices.flatMap(choice => [choice.id, choice.id]);
    const record = store.save(activity.id, 0, [state]);
    assert.deepEqual(validateJsonSchema(record, schema), [], activity.id);
    assert.deepEqual(createActivityProgressStore({ storage }).load(activity.id), record);
  }
});

test('partial, checked, completed and multiple-round states are retained independently', () => {
  const storage = storageFixture(), store = createActivityProgressStore({ storage });
  const order = { ...blank(), answer: ['2', '1', '3'], checked: true };
  const round2 = { ...blank(1), answer: ['4'] };
  const record = store.save('number-order', 1, [order, round2]);
  store.save('color-hunt', 0, [{ ...blank(), answer: ['red'] }]);
  assert.deepEqual(createActivityProgressStore({ storage }).load('number-order'), record);
  const loaded = store.load('number-order');
  loaded.rounds[0].answer.length = 0;
  assert.deepEqual(store.load('number-order'), record);
  assert.deepEqual(order.answer, ['2', '1', '3']);
});

test('memory layout, face-up cards and matched pairs survive restoration', () => {
  const storage = storageFixture(), store = createActivityProgressStore({ storage });
  for (const state of [
    { ...blank(), deck: ['cup', 'apple', 'cup', 'apple'], exposed: [0] },
    { ...blank(), deck: ['cup', 'apple', 'cup', 'apple'], exposed: [0, 1] },
    { ...blank(), deck: ['cup', 'apple', 'cup', 'apple'], exposed: [1], matched: ['cup'] },
    { ...blank(), deck: ['cup', 'apple', 'cup', 'apple'], matched: ['cup', 'apple'] },
  ]) {
    const record = store.save('picture-memory', 0, [state]);
    assert.deepEqual(createActivityProgressStore({ storage }).load('picture-memory'), record);
  }
});

test('malformed, oversized, stale, cross-activity and extra-field saves are ignored', () => {
  const storage = storageFixture();
  const record = createActivityProgressStore({ storage }).save('color-hunt', 0, [blank()]);
  const variants = [null, [], {}, { ...record, syntheticOnly: false }, { ...record, contractVersion: '9' },
    { ...record, activityId: 'rhymes' }, { ...record, contentKey: 'old' }, { ...record, learnerName: 'forbidden-field' },
    { ...record, currentRound: -1 }, { ...record, currentRound: 1000 }, { ...record, currentRound: 1 },
    { ...record, rounds: [blank(), blank()] },
    { ...record, rounds: [{ ...blank(), answer: ['not-a-choice'] }] },
    { ...record, rounds: [{ ...blank(), answer: ['red', 'blue'] }] },
    { ...record, rounds: [{ ...blank(), complete: true }] },
  ];
  for (const raw of ['{', 'x'.repeat(100001), ...variants.map(value => JSON.stringify(value))]) {
    storage.setItem(PREFIX + 'color-hunt', raw);
    assert.equal(createActivityProgressStore({ storage }).load('color-hunt'), null);
  }
  assert.equal(createActivityProgressStore({ storage }).load('__proto__'), null);
  const updatedCatalog = structuredClone(ACTIVITY_LIBRARY);
  updatedCatalog.find(activity => activity.id === 'color-hunt').rounds[0].prompt = 'Changed lesson';
  storage.setItem(PREFIX + 'color-hunt', JSON.stringify(record));
  assert.equal(createActivityProgressStore({ storage, catalog: updatedCatalog }).load('color-hunt'), null);
});

test('invalid memory and ordering states cannot be saved or loaded', () => {
  const store = createActivityProgressStore({ storage: storageFixture() });
  const memory = { ...blank(), deck: ['apple', 'cup', 'apple', 'cup'] };
  const badStates = [
    { ...memory, deck: ['apple', 'apple', 'apple', 'cup'] },
    { ...memory, exposed: [-1] }, { ...memory, exposed: [4] }, { ...memory, exposed: [0, 0] },
    { ...memory, exposed: [0, 2] }, { ...memory, exposed: [1], matched: ['cup'] },
    { ...memory, matched: ['cup', 'cup'] }, { ...memory, checked: true }, { ...memory, answer: ['cup'] },
  ];
  for (const state of badStates) assert.throws(() => store.save('picture-memory', 0, [state]), /Invalid/);
  assert.throws(() => store.save('number-order', 0, [{ ...blank(), checked: true }]), /Invalid/);
  assert.throws(() => store.save('number-order', 0, [{ ...blank(), answer: ['1', '1'] }]), /Invalid/);
  assert.throws(() => store.save('__proto__', 0, [blank()]), /Unknown/);
  const good = store.save('picture-memory', 0, [memory]);
  for (const state of badStates) assert.equal(validActivityProgress({ ...good, rounds: [state] }, getActivity('picture-memory')), false);
});

test('missing or failing storage keeps the current page usable with an in-memory fallback', () => {
  for (const storage of [null,
    { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } },
    { getItem() { return null; }, setItem() { throw Error('quota'); }, removeItem() {} },
  ]) {
    const store = createActivityProgressStore({ storage });
    assert.equal(store.load('color-hunt'), null);
    const record = store.save('color-hunt', 0, [{ ...blank(), answer: ['blue'] }]);
    assert.equal(store.persistent, false);
    assert.deepEqual(store.load('color-hunt'), record);
    store.save('rhymes', 0, [blank()]);
    assert.deepEqual(store.load('color-hunt'), record);
  }
});

test('clearing removes only known library saves and reports blocked deletion', () => {
  const storage = storageFixture(), store = createActivityProgressStore({ storage });
  storage.setItem('unrelated', 'keep');
  storage.setItem('xander-deane.learning-session.other', 'keep');
  store.save('color-hunt', 0, [blank()]);
  store.save('rhymes', 0, [blank()]);
  assert.equal(store.clearAll(), true);
  assert.equal(store.load('color-hunt'), null);
  assert.deepEqual([...storage.data.keys()], ['unrelated', 'xander-deane.learning-session.other']);
  assert.equal(createActivityProgressStore({ storage: { removeItem() { throw Error('blocked'); } } }).clearAll(), false);
});
