import type { Database } from '../lib/database.types';
import type { Category, Note } from './noteHelpers';

type BlogPostRow = Database['public']['Tables']['blog_posts']['Row'];

export type BlogStatus = 'generating' | 'draft' | 'published' | 'error' | 'insufficient';

// Narrow the DB row's `status: string` to the literal union the CHECK enforces.
export type BlogPost = Omit<BlogPostRow, 'status'> & { status: BlogStatus };

export type BlogResult = {
  title: string;
  content_markdown: string;
  cover_photo_url: string | null;
  selected_photo_urls: string[];
};

export type Place = { place_name: string; category: Category | null; city: string | null };

export function statusLabel(status: BlogStatus): string {
  switch (status) {
    case 'generating':
      return 'Generating…';
    case 'draft':
      return 'Ready to review';
    case 'published':
      return 'Published';
    case 'error':
      return 'Failed';
    case 'insufficient':
      return 'Not enough notes';
  }
}

// A blog needs enough raw material to be worth writing. These gate generation
// client-side (free, instant) before we spend an API call. The floor is
// intentionally lenient — the edge function's own judgment is the real quality
// check and may still come back 'insufficient'.
export const MIN_NOTES_FOR_BLOG = 3;
export const MIN_NOTE_TEXT_CHARS = 80;

export type BlogReadiness = { ok: true } | { ok: false; reason: string };

/** Decides whether a trip has enough note material to attempt a blog. */
export function checkBlogReadiness(notes: { content: string }[]): BlogReadiness {
  if (notes.length < MIN_NOTES_FOR_BLOG) {
    return {
      ok: false,
      reason: `Add at least ${MIN_NOTES_FOR_BLOG} notes before generating a blog — you have ${notes.length}.`,
    };
  }
  const totalChars = notes.reduce((sum, n) => sum + n.content.trim().length, 0);
  if (totalChars < MIN_NOTE_TEXT_CHARS) {
    return {
      ok: false,
      reason: 'Your notes are a little thin — add a bit more detail before generating a blog.',
    };
  }
  return { ok: true };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatBlogDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function collectPlaces(notes: Note[]): Place[] {
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const note of notes) {
    if (!note.place_name) continue;
    const name = note.place_name.trim();
    const key = name.toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    places.push({ place_name: name, category: note.category, city: note.city });
  }
  return places;
}

export function validateBlogResult(data: unknown): BlogResult | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.title !== 'string') return null;
  if (typeof obj.content_markdown !== 'string') return null;
  if (!(obj.cover_photo_url === null || typeof obj.cover_photo_url === 'string')) return null;
  if (!Array.isArray(obj.selected_photo_urls)) return null;
  if (!obj.selected_photo_urls.every((u) => typeof u === 'string')) return null;
  return {
    title: obj.title,
    content_markdown: obj.content_markdown,
    cover_photo_url: obj.cover_photo_url as string | null,
    selected_photo_urls: obj.selected_photo_urls as string[],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function boldify(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// Render inline content: images become <img> (their URLs kept raw so query
// strings survive), surrounding text is escaped then bolded.
function renderInline(text: string): string {
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let result = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(text)) !== null) {
    result += boldify(escapeHtml(text.slice(lastIndex, m.index)));
    result += `<img alt="${escapeHtml(m[1])}" src="${m[2].trim()}" />`;
    lastIndex = imgRe.lastIndex;
  }
  result += boldify(escapeHtml(text.slice(lastIndex)));
  return result;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const blocks: string[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length > 0) {
      blocks.push(`<p>${renderInline(para.join(' '))}</p>`);
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      blocks.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(line)) {
      flush();
      blocks.push(renderInline(line));
      continue;
    }
    para.push(line);
  }
  flush();

  const body = blocks.join('\n');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body { font-family: -apple-system, system-ui, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; line-height: 1.6; color: #111; }
img { max-width: 100%; border-radius: 12px; margin: 12px 0; }
h1 { font-size: 28px; } h2 { font-size: 22px; } h3 { font-size: 18px; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
