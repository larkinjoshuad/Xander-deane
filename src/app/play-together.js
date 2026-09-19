export const PLAY_GAMES = Object.freeze({
  picnic: Object.freeze([
    { prompt: 'One apple for our picnic!', item: 'apple', count: 1, offline: 'With your grown-up, put one large toy on a plate. Take turns giving it to each other.' },
    { prompt: 'Two apples for our picnic!', item: 'apple', count: 2, offline: 'Find two large toys together. Give one to each of two toy friends.' },
    { prompt: 'Three apples for our picnic!', item: 'apple', count: 3, offline: 'Count three large blocks together. Touch each block as you say its number.' },
  ].map(Object.freeze)),
  hide: Object.freeze([
    { prompt: 'Put Teddy inside the basket.', item: 'teddy', destination: 'inside', offline: 'With your grown-up, put a large soft toy inside an open basket. Where did it go?' },
    { prompt: 'Put Teddy under the table.', item: 'teddy', destination: 'under', offline: 'Put a soft toy under a sturdy table together. Take turns finding it.' },
    { prompt: 'Put Teddy beside the table.', item: 'teddy', destination: 'beside', offline: 'Sit beside your grown-up. Put a soft toy beside you. Say who is beside whom.' },
  ].map(Object.freeze)),
  pack: Object.freeze([
    { prompt: 'Pack the cup!', item: 'cup', choices: ['cup', 'ball'], offline: 'Find a cup with your grown-up. Name it, point to its handle, and pretend to take a sip.' },
    { prompt: 'Pack the ball!', item: 'ball', choices: ['shoe', 'ball'], offline: 'Find a large soft ball. Sit together and gently roll it back and forth.' },
    { prompt: 'Pack the shoe!', item: 'shoe', choices: ['shoe', 'cup'], offline: 'Find a shoe together. Whose shoe is it? Point to the toe and the heel.' },
  ].map(round => Object.freeze({ ...round, choices: Object.freeze(round.choices) }))),
});

export function createPlayState(game = 'picnic', round = 0) {
  if (!Object.hasOwn(PLAY_GAMES, game) || !Number.isInteger(round) || !PLAY_GAMES[game][round]) {
    throw new RangeError('Unknown play activity');
  }
  return { game, round, placed: [], complete: false, feedback: '' };
}

export function playPieces(state) {
  const activity = PLAY_GAMES[state.game][state.round];
  if (state.complete) return [];
  const items = state.game === 'picnic' ? Array.from({ length: activity.count }, () => activity.item)
    : activity.choices ?? [activity.item];
  return items.map((item, index) => ({ id: `${item}-${index}`, item })).filter(piece => !state.placed.includes(piece.id));
}

export function dropPlayPiece(state, pieceId, destination) {
  const activity = PLAY_GAMES[state.game][state.round];
  const piece = playPieces(state).find(candidate => candidate.id === pieceId);
  if (!piece || state.complete) return state;
  const correctDestination = state.game === 'picnic' ? 'plate' : state.game === 'pack' ? 'bag' : activity.destination;
  if (destination !== correctDestination || piece.item !== activity.item) {
    return { ...state, feedback: state.game === 'hide' ? 'Teddy can try another spot.' : `Can you find the ${activity.item}?` };
  }
  const placed = [...state.placed, piece.id];
  const complete = placed.length === (activity.count ?? 1);
  const feedback = state.game === 'picnic' ? `${['One', 'Two', 'Three'][placed.length - 1]}!${complete ? ' Picnic time!' : ''}`
    : state.game === 'hide' ? `Peekaboo! Teddy is ${activity.destination === 'inside' ? 'inside the basket' : `${activity.destination} the table`}.`
    : `The ${activity.item} is in the bag!`;
  return { ...state, placed, complete, feedback };
}
