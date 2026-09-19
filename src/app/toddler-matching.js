export const MATCHING_SETS = Object.freeze({
  letters: Object.freeze(Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ')),
  numbers: Object.freeze(Array.from({ length: 10 }, (_, index) => String(index + 1))),
});

export function matchingRound(mode, round = 0) {
  const symbols = MATCHING_SETS[mode];
  if (!symbols || !Number.isInteger(round) || round < 0 || round >= symbols.length / 2) {
    throw new RangeError('Unknown matching round');
  }
  return symbols.slice(round * 2, round * 2 + 2);
}

export function isMatchingDrop(symbols, symbol, destination) {
  return symbols.includes(symbol) && symbol === destination;
}
