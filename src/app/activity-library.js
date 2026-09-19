const text = value => ({ id: String(value), text: String(value) });
const visual = (id, label, picture) => ({ id, text: label, visual: picture });
const question = (prompt, answer, alternatives) => ({ prompt, choices: [answer, ...alternatives].map(text), answer: [String(answer)] });
const order = (prompt, values) => ({ prompt, choices: values.map(text), answer: values.map(String) });
const family = (id, subject, title, kind, hint, rounds) => ({ contractVersion: '0.1.0', syntheticOnly: true, id, subject, title, kind, hint, rounds });
const library = [];
const add = (...args) => library.push(family(...args));

add('add', 'math', 'Addition kitchen', 'choice', 'Start with the first number and count on.',
  Array.from({ length: 24 }, (_, i) => { const a = i % 8 + 1, b = Math.floor(i / 8) + 1; return question(`${a} + ${b} = ?`, a + b, [a + b + 1, a + b + 2]); }));
add('subtract', 'math', 'Take-away trail', 'choice', 'Start with the larger number. Take away one at a time.',
  Array.from({ length: 24 }, (_, i) => { const b = i % 4 + 1, a = Math.floor(i / 4) + b + 1; return question(`${a} - ${b} = ?`, a - b, [a - b + 1, a - b + 2]); }));
add('multiply', 'math', 'Equal-group puzzles', 'choice', 'Add the same group size once for each group.',
  Array.from({ length: 24 }, (_, i) => { const groups = i % 4 + 2, size = Math.floor(i / 4) + 1; return question(`${groups} groups of ${size}. How many altogether?`, groups * size, [groups * size + 1, groups * size + 2]); }));
add('compare', 'math', 'Number mountain', 'choice', 'Compare tens first, then ones.',
  Array.from({ length: 24 }, (_, i) => { const a = i * 3 + 2; return question('Which number is greatest?', a + 4, [a, a + 2]); }));
add('number-order', 'math', 'Number stepping stones', 'order', 'Find the smallest number first. Then find the next smallest.',
  Array.from({ length: 12 }, (_, i) => order('Put the numbers in order, smallest first.', [i * 3 + 1, i * 3 + 2, i * 3 + 3])));
add('skip-count', 'math', 'Skip-count parade', 'order', 'Add the same amount each time.',
  [2, 3, 4, 5, 10].flatMap(step => [1, 2, 3].map(start => order(`Count by ${step}, smallest first.`, [start * step, (start + 1) * step, (start + 2) * step]))));

const verbs = [
  ['The dog runs fast.', 'runs', 'dog', 'fast'], ['Birds sing sweetly.', 'sing', 'Birds', 'sweetly'],
  ['We jump high.', 'jump', 'We', 'high'], ['Maya paints stars.', 'paints', 'Maya', 'stars'],
  ['The baby sleeps.', 'sleeps', 'The', 'baby'], ['Fish swim away.', 'swim', 'Fish', 'away'],
  ['Dad cooks rice.', 'cooks', 'Dad', 'rice'], ['Children build towers.', 'build', 'Children', 'towers'],
];
add('verbs', 'language', 'Action detectives', 'choice', 'Which word tells what someone does?', verbs.map(([sentence, answer, ...other]) => question(`Find the action word: ${sentence}`, answer, other)));
const adjectives = [
  ['The red kite flies.', 'red', 'kite', 'flies'], ['A tiny mouse hides.', 'tiny', 'mouse', 'hides'],
  ['The soft blanket helps.', 'soft', 'blanket', 'helps'], ['A tall tree grows.', 'tall', 'tree', 'grows'],
  ['The cold wind blows.', 'cold', 'wind', 'blows'], ['A bright star shines.', 'bright', 'star', 'shines'],
  ['The round ball rolls.', 'round', 'ball', 'rolls'], ['A happy child waves.', 'happy', 'child', 'waves'],
];
add('describing', 'language', 'Describing detectives', 'choice', 'Look for a word that describes a thing or person.', adjectives.map(([sentence, answer, ...other]) => question(`Find the describing word: ${sentence}`, answer, other)));
add('nouns', 'language', 'Naming words', 'choice', 'A naming word can name a person, place, or thing.',
  [['apple','quickly','jump'],['teacher','soft','run'],['school','slowly','hop'],['table','red','dance'],['river','gently','sing'],['book','tall','skip'],['garden','bright','walk'],['shoe','quietly','clap']]
    .map(([answer, ...other]) => question('Which word names a person, place, or thing?', answer, other)));
add('plurals', 'language', 'One and many', 'choice', 'Say the word as if there is more than one.',
  [['cat','cats','cates','cat'],['dog','dogs','doges','dog'],['box','boxes','boxs','box'],['bus','buses','buss','bus'],['baby','babies','babys','baby'],['leaf','leaves','leafs','leaf'],['child','children','childs','child'],['foot','feet','foots','foot']]
    .map(([word, answer, ...other]) => question(`One ${word}. Two ...?`, answer, other)));
add('rhymes', 'language', 'Rhyme time', 'choice', 'Say both words aloud. Listen to their endings.',
  [['cat','hat','dog','sun'],['sun','run','cup','bed'],['boat','coat','fish','tree'],['bee','tree','ball','hat'],['frog','log','moon','cup'],['light','night','shoe','day'],['cake','lake','cat','car'],['chair','bear','book','bus']]
    .map(([word, answer, ...other]) => question(`Which word rhymes with ${word}?`, answer, other)));
add('sentences', 'language', 'Sentence builder', 'order', 'Start with the capital letter. End with the full stop.',
  [['Birds','can','fly.'],['We','like','apples.'],['The','sun','shines.'],['I','see','you.'],['Dogs','can','run.'],['She','reads','books.']]
    .map(words => order('Build a sentence.', words)));

add('habitats', 'science', 'Habitat explorers', 'choice', 'Think about where this animal finds food and shelter.',
  [['polar bear','Arctic sea ice','hot desert','tropical reef'],['camel','desert','polar sea ice','coral reef'],['clownfish','coral reef','grassland','forest canopy'],['earthworm','soil','open ocean','sea ice'],['woodpecker','woodland','deep ocean','sea ice'],['pond snail','freshwater pond','dry desert','tree canopy'],['giraffe','savanna','deep ocean','sea ice'],['octopus','ocean','dry meadow','forest canopy']]
    .map(([animal, answer, ...other]) => question(`Where would you look for a ${animal}?`, answer, other)));
add('materials', 'science', 'Material detectives', 'choice', 'Think about the material named in the question.',
  [['glass jar','glass','wood','cloth'],['wooden spoon','wood','glass','paper'],['cotton shirt','fabric','stone','metal'],['steel fork','metal','paper','rubber'],['paper bag','paper','glass','stone'],['rubber band','rubber','glass','wood'],['brick wall','brick','cloth','paper'],['plastic bottle','plastic','wood','fabric']]
    .map(([object, answer, ...other]) => question(`What is this ${object} made of?`, answer, other)));
add('states', 'science', 'Solid, liquid, gas', 'choice', 'A solid holds its shape; a liquid flows; a gas spreads through its container.',
  [['ice cube','solid'],['liquid water','liquid'],['air in a balloon','gas'],['wooden block','solid'],['cooking oil','liquid'],['helium in a balloon','gas']]
    .map(([object, answer]) => question(`Is ${object} a solid, liquid, or gas?`, answer, ['solid','liquid','gas'].filter(item => item !== answer))));
add('senses', 'science', 'Sense explorers', 'choice', 'Think about which body part helps with this sense.',
  [['see a rainbow','eyes','ears','nose'],['hear a bell','ears','eyes','nose'],['smell a flower','nose','eyes','ears'],['taste food','tongue','ears','eyes'],['feel a soft blanket','skin','eyes','tongue']]
    .map(([action, answer, ...other]) => question(`What helps you ${action}?`, answer, other)));
add('life-sequences', 'science', 'Growing stories', 'order', 'What happens first? What comes after that?',
  [['seed','seedling','mature plant'],['egg','caterpillar','chrysalis','butterfly'],['egg','tadpole','frog'],['egg','chick','adult chicken']]
    .map(stages => order('Put these growing stages in order.', stages)));
add('space', 'science', 'Space explorers', 'choice', 'Picture our solar system and the objects in it.',
  [['Which object is a star?','Sun','Earth','Moon'],['Which planet do we live on?','Earth','Mars','Venus'],['What goes around Earth?','Moon','Sun','Jupiter'],['Which planet is closest to the Sun?','Mercury','Earth','Neptune'],['Which is the largest planet in our solar system?','Jupiter','Mars','Mercury'],['Which planet is known as the red planet?','Mars','Venus','Earth'],['What makes day and night on Earth?','Earth turning','Moon changing shape','clouds moving'],['What is the Sun mainly made of?','hot gas and plasma','solid rock','liquid water']]
    .map(([prompt, answer, ...other]) => question(prompt, answer, other)));

const colors = ['red','blue','yellow','green','pink','orange'];
const shapes = ['circle','square','triangle','oval','star','heart'];
add('color-hunt', 'toddler', 'Color hunt', 'choice', 'Look for the same color. A grown-up can say its name.', colors.map((color, index) => ({
  prompt: `Find ${color}.`, choices: [color, colors[(index + 1) % 6], colors[(index + 3) % 6]].map(value => visual(value, value, `color:${value}`)), answer: [color],
})));
add('shape-hunt', 'toddler', 'Shape hunt', 'choice', 'Look at the edges and corners together.', shapes.map((shape, index) => ({
  prompt: `Find the ${shape}.`, choices: [shape, shapes[(index + 1) % 6], shapes[(index + 3) % 6]].map(value => visual(value, value, `shape:${value}`)), answer: [shape],
})));
add('little-counts', 'toddler', 'Little collections', 'choice', 'Touch each dot and count together.', [1, 2, 3].map(count => ({
  prompt: `Find ${['','one dot','two dots','three dots'][count]}.`, choices: [1,2,3].map(value => visual(String(value), `${value} dots`, `dots:${value}`)), answer: [String(count)],
})));
add('color-patterns', 'toddler', 'Pattern parade', 'choice', 'Say the colors together. What comes next?', colors.map((color, index) => {
  const other = colors[(index + 1) % 6];
  return { prompt: 'What comes next?', preview: [color, other, color].map(value => `color:${value}`), choices: [color, other].map(value => visual(value, value, `color:${value}`)), answer: [other] };
}));
add('size-order', 'toddler', 'Growing shapes', 'order', 'Find the little one first, then the middle one, then the big one.', shapes.map(shape => ({
  prompt: 'Little, middle, big.', choices: ['small','medium','large'].map(size => visual(size, `${size} ${shape}`, `size:${shape}:${size}`)), answer: ['small','medium','large'],
})));
add('picture-memory', 'toddler', 'Peekaboo pairs', 'memory', 'Find two pictures that are the same. Take turns with a grown-up.',
  [['apple','cup'],['ball','shoe'],['cup','ball'],['shoe','apple'],['apple','ball'],['cup','shoe']].map(items => ({
    prompt: 'Find the matching pictures.', choices: items.map(item => visual(item, item, `object:${item}`)), answer: items,
  })));

const wordObjects = ['cup', 'ball', 'shoe', 'apple'];
add('word-match', 'toddler', 'Word Match', 'choice', 'Say the word together. Look for the picture or word that goes with it.',
  wordObjects.flatMap((item, index) => {
    const options = [item, wordObjects[(index + 1) % wordObjects.length], wordObjects[(index + 2) % wordObjects.length]];
    return [
      { prompt: 'Which word goes with this picture?', preview: [`object:${item}`], choices: options.map(text), answer: [item] },
      { prompt: `Find the picture: ${item}`, choices: options.map(value => visual(value, value, `object:${value}`)), answer: [item] },
    ];
  }));

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const ACTIVITY_LIBRARY = freeze(library);
export function getActivity(id) { return ACTIVITY_LIBRARY.find(activity => activity.id === id) ?? null; }
export function libraryCounts() {
  return Object.fromEntries(['toddler','math','language','science'].map(subject => {
    const activities = ACTIVITY_LIBRARY.filter(activity => activity.subject === subject);
    return [subject, { activities: activities.length, problems: activities.reduce((sum, activity) => sum + activity.rounds.length, 0) }];
  }));
}
export function checkLibraryAnswer(activity, roundIndex, answer) {
  const round = activity.rounds[roundIndex];
  return Array.isArray(answer) && answer.length === round.answer.length && answer.every((id, index) => id === round.answer[index]);
}
export function displayChoices(round, index = 0) {
  const choices = [...round.choices];
  const offset = index % Math.max(1, choices.length - 1) + 1;
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}
export function memoryDeck(round, random = Math.random) {
  const cards = [...round.choices, ...round.choices];
  for (let index = cards.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}
