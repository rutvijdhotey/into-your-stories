/**
 * Photo references.
 *
 * The `photos` bucket is private (migration 025), so nothing stored in the
 * database is a usable URL any more. What we store is a **bucket-relative
 * storage path** — `{userId}/{noteId}/{index}.jpg` — and the app signs it at
 * render time (see signedPhotoUrls.ts).
 *
 * Rows written before the lockdown hold full `.../object/public/photos/...`
 * URLs. Rather than rewrite that data, every read path normalises through
 * `toStoragePath`, which accepts both shapes. New writes only ever store paths.
 */

export const PHOTOS_BUCKET = 'photos';

const LOCAL_URI_SCHEMES = ['file:', 'ph:', 'assets-library:', 'content:', 'data:'];

// .../storage/v1/object/{public|sign|authenticated}/photos/{path}
const STORAGE_URL_RE = new RegExp(
  `/storage/v1/object/(?:public|sign|authenticated)/${PHOTOS_BUCKET}/(.+)$`,
);

const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * True for a photo still living on the device — a freshly picked image that
 * hasn't been uploaded yet. These are already renderable and must never be sent
 * to the storage signer.
 */
export function isLocalUri(ref: string): boolean {
  const lower = ref.trim().toLowerCase();
  return LOCAL_URI_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

/**
 * Normalises a stored photo reference to a bucket-relative storage path.
 *
 * Accepts a bare path (optionally carrying the `?v=` cache-buster that cover
 * photos append) or a legacy absolute storage URL. Returns null for local URIs,
 * foreign URLs, and anything empty — callers treat null as "not signable".
 */
export function toStoragePath(ref: string): string | null {
  if (typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  if (trimmed.length === 0) return null;
  if (isLocalUri(trimmed)) return null;

  const withoutQuery = trimmed.split('?')[0];

  const match = withoutQuery.match(STORAGE_URL_RE);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  // An absolute URL that isn't a photos-bucket object isn't ours to sign.
  if (ABSOLUTE_URL_RE.test(withoutQuery)) return null;

  const path = withoutQuery.replace(/^\/+/, '');
  return path.length > 0 ? path : null;
}

// Markdown image syntax, and only image syntax: the leading `!` is required so
// ordinary links are left alone. The src group stops at `)` or whitespace, which
// also excludes the optional ("title") form we never generate.
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/**
 * Rewrites every Markdown image source through `resolve`. Generated blog posts
 * embed storage paths, so this is how a post becomes renderable — and how an
 * export becomes shareable outside the app. A source the resolver declines
 * (returns null for) is left exactly as written.
 */
export function replacePhotoRefsInMarkdown(
  markdown: string,
  resolve: (ref: string) => string | null,
): string {
  return markdown.replace(MARKDOWN_IMAGE_RE, (whole, alt: string, src: string) => {
    const replacement = resolve(src);
    return replacement ? `![${alt}](${replacement})` : whole;
  });
}

/** Every photo reference used by an image in the document, in order, with duplicates. */
export function photoRefsInMarkdown(markdown: string): string[] {
  const refs: string[] = [];
  replacePhotoRefsInMarkdown(markdown, (ref) => {
    refs.push(ref);
    return null;
  });
  return refs;
}
