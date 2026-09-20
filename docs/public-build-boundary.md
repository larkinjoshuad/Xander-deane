# Isolated Public Build Boundary

This is a technical containment milestone, not authorization for public child use.
All content remains synthetic and the international privacy, educator, licensing,
accessibility, and store gates in `public-release-plan.md` remain open.

## Build and Preview

Use Node 24 LTS and the locked dependencies:

```sh
npm ci
npm run build:public
npm run preview:public
```

The isolated preview is at `http://127.0.0.1:4174/app/`. Set `PUBLIC_PORT` to a
different unused port if necessary. It binds only to loopback. It is not a
production web server, does not implement HTTPS, and must not be exposed as one.
The older development preview at port 4173 remains separate.

`dist/public/` is the only candidate static document root. The sibling
`dist/public-manifest.json` records deterministic SHA-256 file hashes and required
HTTP headers and is not served. Never deploy the repository root or all of `dist`.
The preview checks every expected file's hash before listening and serves a
fixed in-memory file map, never a requested filesystem path or directory listing.
The hashes detect accidental changes; they are not a signed supply-chain attestation.

## Included and Excluded

`scripts/public-build-policy.js` explicitly lists all permitted module inputs,
HTML, CSS, illustration, eight narration clips, and six synthetic learning JSON
fixtures. The latter retain their existing `/examples/{subject}/` URLs solely to
keep the current clients compatible. No whole examples directory is copied.
Content review/versioning and moving these six fixtures into a reviewed content
package are still separate release work.

esbuild parses and bundles the six JavaScript entry points. An import resolver
rejects every unlisted module and package, including static/dynamic imports of
the provider SDK, server modules, or diagnostic tutor client. Source maps are
not emitted. Missing permitted files or build warnings fail the command.
Rebuilding replaces only the fixed, canonical `dist/public` directory after
compilation succeeds, removing stale output. Symlinked inputs/output directories
are rejected. A failed build is not a publishable new release; do not deploy an
old artifact left by an unsuccessful command.

Excluded: `prototype.html`, `main.js`, `tutor-client.js`, server/API/model code,
identity/consent/session fixtures, schemas, databases, keys, environment files,
source files, test output, and voice-provider provenance URLs. No API handlers
or provider keys exist in the artifact. Unknown paths return 404 in the preview;
methods other than GET/HEAD return 405. Production hosts must preserve those
boundaries and must not add a fallback proxy to a development API.

The app index now uses an external script compatible with the script policy;
it carries only a valid subject into the practice route. Query parameters,
saved tutor API destinations, and window-level tutor overrides do not enable
provider calls in the permitted entry points.

## Browser and Hosting Policy

The preview applies CSP, nosniff, frame denial, no-referrer, sensitive-permission
restrictions, and no-store on responses. CSP permits scripts, media, and fetch
only from the same origin and disables frames as ancestors, objects, workers,
form submissions, and base URL changes. Inline scripts/eval are not allowed.
Inline styling remains permitted because the current renderers size/color game
pieces through DOM style properties; removing that exception is future work.

A static upload does not automatically apply headers from the manifest. Before
any Internet deployment, map them into the chosen host's configuration, enforce
HTTPS and an appropriate HSTS policy, disable directory listings, keep all other
files outside the document root, and re-run probes against the deployed origin.
Cache/offline/update policy is deliberately not implemented in this step.
The no-store preview policy avoids stale build validation.

## Development Tutor Containment

`npm run start:tutor` now binds to 127.0.0.1, uses a fixed local CORS origin, and
always uses synthetic responses even if provider keys are present. The API
factory's default is also synthetic. Injected gateways remain available for
existing stub tests and explicitly invoked development code; their consent,
authorization, and moderation gaps are not solved here. They remain outside the
public artifact and must not be deployed. The generic model gateway helper can
still be invoked explicitly by development code, so this is not a repository-wide
ban on every possible provider invocation.

The repository-root Python development command now binds loopback. Environment
files and generated output are ignored by Git. This is not an exhaustive secret
history scan or a substitute for credential management.

## Verification

```sh
node --test test/public-build.test.js test/tutor-api-server.test.js
npm run test:public
```

The public browser runner rebuilds first, starts a fresh loopback server on an
available port, runs desktop/phone Chromium and tablet WebKit against that artifact, and closes
the test server. It never reuses the repository-root development server.

Tests cover deterministic outputs, stale-file exclusion, forbidden imports,
redirected output, modified hashes, excluded routes, traversal probes, denied
API writes, headers, third-party connection blocking, poisoned tutor preferences,
all learning-page shells, representative answers, family evidence, local audio,
and no unexpected requests or CSP violations in the sampled flows. Screenshots
are retained under test-results. CI uses Node 24 and runs this boundary suite.

Subsequent hardening adds arithmetic shortcut checks, library focus and progress
recovery, original-lesson storage fallback/validation, bounded browser histories,
and duplicate-check suppression. New practice updates cannot award mastery or
high confidence. These changes do not validate historical prototype assessments,
educational effectiveness, or a complete curriculum. The public tests close the
menu before continuing; the earlier phone menu finding is not marked fixed.
Do not represent browser automation as physical-device or store certification.
