import { useEffect, useMemo, useState } from 'react';
import { peekSignedUrl, signPhotoRefs } from '../services/signedPhotoUrls';

// refs are joined into a single dependency so the effect re-runs on content
// change rather than on every new array identity. NUL can't appear in a path.
const SEP = '\u0000';

function seedFromCache(refs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ref of refs) {
    const hit = peekSignedUrl(ref);
    if (hit) out[ref] = hit;
  }
  return out;
}

/**
 * Resolves stored photo references to displayable URLs, keyed by reference.
 *
 * A reference is absent from the result until it resolves — and stays absent if
 * it can't be signed — so callers must render a placeholder for a missing key
 * rather than assume one. Already-cached URLs are returned on the first render,
 * so revisiting a screen doesn't flash empty tiles.
 */
export function useSignedPhotoUrls(refs: string[]): Record<string, string> {
  const key = refs.join(SEP);
  const list = useMemo(() => (key.length > 0 ? key.split(SEP) : []), [key]);
  const seeded = useMemo(() => seedFromCache(list), [list]);
  const [signed, setSigned] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void signPhotoRefs(list).then((map) => {
      if (active) setSigned(Object.fromEntries(map));
    });
    return () => {
      active = false;
    };
  }, [list]);

  // seeded is recomputed per ref-set, so entries left over from a previous set
  // can only survive in `signed` until the next resolve replaces it wholesale.
  return useMemo(() => ({ ...seeded, ...signed }), [seeded, signed]);
}

/** Single-photo convenience wrapper. Returns null until the URL is available. */
export function useSignedPhotoUrl(ref: string | null | undefined): string | null {
  const refs = useMemo(() => (ref ? [ref] : []), [ref]);
  const urls = useSignedPhotoUrls(refs);
  return ref ? (urls[ref] ?? null) : null;
}
