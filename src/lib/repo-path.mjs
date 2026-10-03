import { posix } from 'node:path';

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** True for absolute URLs (`https:`, `data:`, ...) and protocol-relative `//host/...` links. */
export function isExternalUrl(target) {
  const value = target.trim();
  return SCHEME.test(value) || value.startsWith('//');
}

/** True for absolute `http:` / `https:` URLs. */
export function isHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a link target found in a project repository against the repository root.
 * Query strings and fragments are dropped, percent-encoding is decoded, and a leading `/`
 * means the repository root (as on GitHub).
 *
 * Returns a normalized POSIX path such as `docs/screenshots/cover.png`, or `null` when the
 * target is empty, an external URL, or points outside the repository.
 */
export function resolveRepoPath(target) {
  let path = target.trim().replace(/[?#].*$/, '');
  if (!path || isExternalUrl(path)) return null;
  try {
    path = decodeURI(path);
  } catch {
    // Keep the raw path when it contains malformed percent-encoding.
  }
  const normalized = posix.normalize(path.replace(/^\/+/, ''));
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized.replace(/\/$/, '');
}
