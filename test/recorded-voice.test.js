import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHANON_CLIPS, createRecordedVoice } from '../app/recorded-voice.js';
import { getActivity } from '../src/app/activity-library.js';

test('every rhyme prompt has a bundled MP3 recording', () => {
  for (const round of getActivity('rhymes').rounds) {
    const path = SHANON_CLIPS[round.prompt];
    assert.ok(path);
    const bytes = readFileSync(new URL(`../app/${path}`, import.meta.url));
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1] & 0xe0, 0xe0);
    assert.ok(bytes.length > 1000);
  }
});

test('replay cancels previous audio and stale end events cannot stop new audio', async () => {
  const audios = [];
  const voice = createRecordedVoice(() => {
    const audio = { play: async () => {}, pause() { this.paused = true; } };
    audios.push(audio);
    return audio;
  });
  const text = Object.keys(SHANON_CLIPS)[0];
  await voice.play(text);
  await voice.play(text);
  assert.equal(audios[0].paused, true);
  audios[0].onended();
  assert.equal(voice.playing, true);
  voice.stop();
  assert.equal(audios[1].paused, true);
  assert.equal(voice.playing, false);
  assert.equal(await voice.play('Unknown prompt'), false);
});

test('playback failures reset state and notify caller', async () => {
  let done = false;
  const voice = createRecordedVoice(() => ({ play: async () => { throw Error('blocked'); }, pause() {} }));
  await assert.rejects(voice.play(Object.keys(SHANON_CLIPS)[0], () => { done = true; }), /blocked/);
  assert.equal(voice.playing, false);
  assert.equal(done, true);
});
