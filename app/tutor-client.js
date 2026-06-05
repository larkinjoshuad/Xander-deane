// Opt-in client for the live tutor endpoint.
//
// Disabled by default: with no configured API base the helper is a no-op and
// the shell keeps using its deterministic tutor messages. Enable it for a
// session by opening the shell with `?tutorApi=http://127.0.0.1:4180` (the
// value is remembered in localStorage), or by setting
// `window.__XANDER_TUTOR_API__`.

const STORAGE_KEY = 'xander-deane.tutor-api';

export function getTutorApiBase() {
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location?.search ?? '');
    const fromQuery = params.get('tutorApi');
    if (fromQuery && fromQuery.trim()) {
      const normalized = normalizeBase(fromQuery);
      window.localStorage?.setItem(STORAGE_KEY, normalized);
      return normalized;
    }
  } catch {
    // location/storage unavailable — fall through
  }

  if (typeof window.__XANDER_TUTOR_API__ === 'string' && window.__XANDER_TUTOR_API__.trim()) {
    return normalizeBase(window.__XANDER_TUTOR_API__);
  }

  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored && stored.trim()) return normalizeBase(stored);
  } catch {
    // storage unavailable
  }

  return null;
}

export function isLiveTutorEnabled() {
  return getTutorApiBase() !== null;
}

// Returns a schema-shaped tutorResponse, or null if the live tutor is disabled
// or unreachable — callers keep their deterministic response in that case.
export async function requestLiveTutorResponse(session, { signal } = {}) {
  const base = getTutorApiBase();
  if (!base) return null;

  try {
    const response = await fetch(`${base}/tutor/respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session }),
      signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const tutorResponse = data?.tutorResponse;
    if (!tutorResponse || typeof tutorResponse.messageText !== 'string') return null;
    return tutorResponse;
  } catch {
    return null;
  }
}

function normalizeBase(value) {
  return value.trim().replace(/\/+$/, '');
}
