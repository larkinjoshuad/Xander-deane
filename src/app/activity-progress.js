import { ACTIVITY_LIBRARY } from './activity-library.js';

export const ACTIVITY_PROGRESS_NAMESPACE = 'xander-deane.activity-progress.v1.';
const MAX_SAVE_LENGTH = 100000;
const clone = value => structuredClone(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const unique = values => new Set(values).size === values.length;

export function activityContentKey(activity) {
  return JSON.stringify({ contractVersion: activity.contractVersion, kind: activity.kind, rounds: activity.rounds });
}

export function validActivityProgress(record, activity) {
  if (!activity || !exactKeys(record, ['contractVersion', 'syntheticOnly', 'activityId', 'contentKey', 'currentRound', 'rounds'])) return false;
  if (record.contractVersion !== '0.1.0' || record.syntheticOnly !== true || record.activityId !== activity.id || record.contentKey !== activityContentKey(activity)) return false;
  if (!Number.isInteger(record.currentRound) || record.currentRound < 0 || record.currentRound >= activity.rounds.length) return false;
  if (!Array.isArray(record.rounds) || !record.rounds.length || record.rounds.length > activity.rounds.length) return false;
  if (!record.rounds.every(state => validRound(state, activity))) return false;
  return unique(record.rounds.map(state => state.index)) && record.rounds.some(state => state.index === record.currentRound);
}

function validRound(state, activity) {
  if (!exactKeys(state, ['index', 'answer', 'checked', 'deck', 'exposed', 'matched'])) return false;
  if (!Number.isInteger(state.index) || state.index < 0 || state.index >= activity.rounds.length || typeof state.checked !== 'boolean') return false;
  const round = activity.rounds[state.index];
  const ids = round.choices.map(choice => choice.id);
  for (const field of ['answer', 'deck', 'matched']) {
    if (!Array.isArray(state[field]) || state[field].length > ids.length * 2 || !state[field].every(id => ids.includes(id))) return false;
  }
  if (!Array.isArray(state.exposed) || state.exposed.length > 2 || !unique(state.exposed)) return false;
  if (!unique(state.answer) || !unique(state.matched)) return false;
  if (activity.kind !== 'memory') {
    return !state.deck.length && !state.exposed.length && !state.matched.length
      && state.answer.length <= (activity.kind === 'choice' ? 1 : round.answer.length)
      && (!state.checked || (activity.kind === 'order' && state.answer.length === round.answer.length));
  }
  if (state.answer.length || state.checked || state.deck.length !== ids.length * 2) return false;
  if (!ids.every(id => state.deck.filter(card => card === id).length === 2)) return false;
  if (!state.exposed.every(position => Number.isInteger(position) && position >= 0 && position < state.deck.length && !state.matched.includes(state.deck[position]))) return false;
  return state.exposed.length !== 2 || state.deck[state.exposed[0]] !== state.deck[state.exposed[1]];
}

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function createActivityProgressStore({ storage = browserStorage(), catalog = ACTIVITY_LIBRARY } = {}) {
  const activities = new Map(catalog.map(activity => [activity.id, activity]));
  const memory = new Map();
  let persistent = Boolean(storage);
  const keyFor = id => ACTIVITY_PROGRESS_NAMESPACE + id;
  return Object.freeze({
    get persistent() { return persistent; },
    load(id) {
      const activity = activities.get(id);
      if (!activity) return null;
      if (memory.has(id)) return clone(memory.get(id));
      let record = null;
      try {
        const raw = storage?.getItem(keyFor(id));
        if (typeof raw === 'string' && raw.length <= MAX_SAVE_LENGTH) {
          try {
            const parsed = JSON.parse(raw);
            if (validActivityProgress(parsed, activity)) record = parsed;
          } catch { /* Invalid saves are replaced on the next successful write. */ }
        }
      } catch { persistent = false; }
      memory.set(id, record);
      return clone(record);
    },
    save(id, currentRound, rounds) {
      const activity = activities.get(id);
      if (!activity) throw new TypeError('Unknown activity');
      const record = { contractVersion: '0.1.0', syntheticOnly: true, activityId: id, contentKey: activityContentKey(activity), currentRound, rounds: clone(rounds) };
      if (!validActivityProgress(record, activity)) throw new TypeError('Invalid activity progress');
      const raw = JSON.stringify(record);
      if (raw.length > MAX_SAVE_LENGTH) throw new RangeError('Activity progress is too large');
      memory.set(id, record);
      try { storage?.setItem(keyFor(id), raw); } catch { persistent = false; }
      return clone(record);
    },
    clearAll() {
      let cleared = true;
      for (const id of activities.keys()) {
        memory.set(id, null);
        try { storage?.removeItem(keyFor(id)); } catch { persistent = false; cleared = false; }
      }
      return cleared;
    },
  });
}
