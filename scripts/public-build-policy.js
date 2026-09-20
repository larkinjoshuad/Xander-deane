// This list is a release security boundary, not a glob over the repository.
export const PUBLIC_ENTRIES = Object.freeze([
  'app/index.js', 'app/learn.js', 'app/library.js', 'app/toddler.js',
  'app/play-together.js', 'app/parent-dashboard.js',
]);
export const PUBLIC_MODULES = Object.freeze([...PUBLIC_ENTRIES,
  'app/recorded-voice.js', 'app/touch-feedback.js', 'app/learner-insights.js',
  'app/parent-insights.js', 'app/renderers/equal-groups-renderer.js',
  'app/renderers/token-selection-renderer.js', 'app/renderers/touch-sort-renderer.js',
  'src/core/domain.js', 'src/core/subject-pack.js', 'src/app/learning-session.js',
  'src/app/workspace-host.js', 'src/app/device-profile.js', 'src/app/session-persistence.js',
  'src/app/progress-model.js', 'src/app/activity-library.js', 'src/app/toddler-matching.js',
  'src/app/play-together.js',
]);
export const PUBLIC_STATIC = Object.freeze([
  ...['index', 'learn', 'library', 'toddler', 'play-together', 'parent'].map(name => `app/${name}.html`),
  ...['styles', 'touch', 'library', 'toddler', 'play-together'].map(name => `app/${name}.css`),
  'app/assets/play-world.svg',
  'app/assets/library-play.svg',
  'app/assets/fonts/nunito-latin-wght-normal.woff2',
  'app/assets/fonts/LICENSE', 'app/assets/icons/LICENSE',
  ...['ellipsis', 'arrow-left', 'arrow-right', 'volume-2', 'lightbulb', 'undo-2', 'check', 'rotate-ccw', 'chevron-down', 'circle-check'].map(name => `app/assets/icons/${name}.svg`),
  ...['cat', 'sun', 'boat', 'bee', 'frog', 'light', 'cake', 'chair'].map(word => `app/assets/voice/shanon/rhyme-${word}.mp3`),
  ...['math', 'language', 'science'].flatMap(subject => [
    `examples/${subject}/objective.learning-objective.json`,
    `examples/${subject}/problem.problem.json`,
  ]),
]);
export const PUBLIC_FILES = Object.freeze([...PUBLIC_STATIC, ...PUBLIC_ENTRIES, 'index.html'].sort());

// Dynamic visual sizing uses element.style; scripts still cannot run inline.
export const PUBLIC_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cache-Control': 'no-store',
});
