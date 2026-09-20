const words = ['cat', 'sun', 'boat', 'bee', 'frog', 'light', 'cake', 'chair'];
export const SHANON_CLIPS = Object.fromEntries(words.map(word => [
  `Which word rhymes with ${word}?`, `./assets/voice/shanon/rhyme-${word}.mp3`,
]));

export function createRecordedVoice(makeAudio = source => new Audio(source)) {
  let current = null;
  function stop() {
    if (!current) return;
    const previous = current;
    current = null;
    previous.audio.pause();
    previous.done();
  }
  async function play(text, done = () => {}) {
    stop();
    const source = SHANON_CLIPS[text];
    if (!source) return false;
    const audio = makeAudio(source);
    const entry = { audio, done };
    current = entry;
    audio.onended = () => { if (current === entry) stop(); };
    try { await audio.play(); }
    catch (error) {
      if (current !== entry) return true;
      stop();
      throw error;
    }
    return true;
  }
  return { play, stop, get playing() { return current !== null; } };
}
