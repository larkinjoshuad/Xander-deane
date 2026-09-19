export const MATCHING_SETS = Object.freeze({
  letters: Object.freeze(Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ')),
  numbers: Object.freeze(Array.from({ length: 10 }, (_, index) => String(index + 1))),
  shapes: Object.freeze(['circle', 'square', 'triangle', 'oval', 'star', 'heart']),
  sizes: Object.freeze(['big_circle', 'small_circle', 'small_square', 'big_square', 'big_triangle', 'small_triangle']),
});

export function matchingVisual(mode, symbol) {
  if (!MATCHING_SETS[mode]?.includes(symbol)) throw new RangeError('Unknown matching symbol');
  if (mode === 'shapes') return { shape: symbol, size: 'big', label: symbol };
  if (mode === 'sizes') {
    const [size, shape] = symbol.split('_');
    return { shape, size, label: `${size} ${shape}` };
  }
  return { label: symbol };
}

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
