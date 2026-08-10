import { supabase } from '../lib/supabase';
import { PHOTOS_BUCKET, isLocalUri, toStoragePath } from './photoRefs';

/**
 * Signed-URL resolution for the private `photos` bucket.
 *
 * Every photo the app renders goes through here: a stored reference (a storage
 * path, or a legacy public URL from before migration 025) becomes a short-lived
 * signed URL. Signing requires SELECT on the object under RLS, so a user can
 * only ever sign their own photos.
 *
 * Results are cached in memory, keyed by the *reference* rather than the path,
 * so a cover photo's `?v=` cache-buster still busts the cache the way it did
 * when references were public URLs.
 */

/** In-app rendering. Short, because a leaked URL is valid until it expires. */
export const RENDER_TTL_SECONDS = 60 * 60;

/**
 * Exported posts. A shared Markdown/HTML file is read outside the app, so its
 * image URLs must outlive the session — a week is long enough to be useful and
 * short enough that a forwarded export doesn't become a permanent handle.
 */
export const EXPORT_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Treat a URL as expired this long before it actually is, so it never dies mid-render. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Supabase accepts a batch; keep each request bounded on very photo-heavy trips. */
const SIGN_BATCH_SIZE = 100;

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function readCache(ref: string): string | null {
  const hit = cache.get(ref);
  if (!hit) return null;
  if (hit.expiresAt - REFRESH_MARGIN_MS <= Date.now()) {
    cache.delete(ref);
    return null;
  }
  return hit.url;
}

/**
 * Synchronous cache read. Lets a component paint an already-signed photo on its
 * first frame instead of flashing an empty tile while the signer round-trips.
 */
export function peekSignedUrl(ref: string): string | null {
  if (isLocalUri(ref)) return ref;
  return readCache(ref);
}

/** Drop every cached URL. Called on sign-out so one user's URLs never outlive their session. */
export function clearSignedPhotoCache(): void {
  cache.clear();
}

type SignOptions = { ttlSeconds?: number; useCache?: boolean };

type SignedUrlRow = { path?: string | null; signedUrl?: string | null; error?: unknown };

/**
 * Resolves photo references to displayable URLs.
 *
 * Returns a ref → URL map containing only what resolved: local URIs map to
 * themselves, signable refs to a signed URL, and anything that fails (deleted
 * object, offline, foreign URL) is simply absent. Callers render what's there
 * and skip the rest — a missing photo is never a thrown error.
 */
export async function signPhotoRefs(
  refs: string[],
  { ttlSeconds = RENDER_TTL_SECONDS, useCache = true }: SignOptions = {},
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();

  // path → the refs that share it (cover photos differ only by their ?v= suffix)
  const pending = new Map<string, string[]>();

  for (const ref of refs) {
    if (resolved.has(ref)) continue;

    if (isLocalUri(ref)) {
      resolved.set(ref, ref);
      continue;
    }

    if (useCache) {
      const hit = readCache(ref);
      if (hit) {
        resolved.set(ref, hit);
        continue;
      }
    }

    const path = toStoragePath(ref);
    if (!path) continue;

    const group = pending.get(path);
    if (group) {
      if (!group.includes(ref)) group.push(ref);
    } else {
      pending.set(path, [ref]);
    }
  }

  if (pending.size === 0) return resolved;

  const paths = [...pending.keys()];
  const expiresAt = Date.now() + ttlSeconds * 1000;

  for (let i = 0; i < paths.length; i += SIGN_BATCH_SIZE) {
    const batch = paths.slice(i, i + SIGN_BATCH_SIZE);
    let rows: SignedUrlRow[];
    try {
      const { data, error } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrls(batch, ttlSeconds);
      if (error || !data) continue;
      rows = data as SignedUrlRow[];
    } catch {
      // Offline or the storage host is unreachable — leave these unresolved so
      // the next render retries rather than caching a failure.
      continue;
    }

    for (const row of rows) {
      if (row.error || !row.signedUrl || !row.path) continue;
      for (const ref of pending.get(row.path) ?? []) {
        resolved.set(ref, row.signedUrl);
        if (useCache) cache.set(ref, { url: row.signedUrl, expiresAt });
      }
    }
  }

  return resolved;
}
