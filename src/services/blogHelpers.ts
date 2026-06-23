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

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export type ItineraryStop = {
  time_of_day: TimeOfDay | null;
  place_name: string;
  category: Category | null;
  description: string;
  lat: number | null;
  lng: number | null;
};

export type ItineraryDay = {
  day: number;
  date: string | null;
  title: string;
  stops: ItineraryStop[];
};

export type Itinerary = ItineraryDay[];

const TIME_OF_DAY: TimeOfDay[] = ['morning', 'afternoon', 'evening'];
const CATEGORY_VALUES: Category[] = ['food', 'stay', 'activity', 'shopping', 'to-visit', 'general'];

function coerceNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseStop(value: unknown): ItineraryStop | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const place_name = typeof obj.place_name === 'string' ? obj.place_name.trim() : '';
  if (place_name.length === 0) return null;
  const time_of_day =
    typeof obj.time_of_day === 'string' && (TIME_OF_DAY as string[]).includes(obj.time_of_day)
      ? (obj.time_of_day as TimeOfDay)
      : null;
  const category =
    typeof obj.category === 'string' && (CATEGORY_VALUES as string[]).includes(obj.category)
      ? (obj.category as Category)
      : null;
  return {
    time_of_day,
    place_name,
    category,
    description: typeof obj.description === 'string' ? obj.description : '',
    lat: coerceNumber(obj.lat),
    lng: coerceNumber(obj.lng),
  };
}

/**
 * Narrows the stored `itinerary` jsonb into a typed Itinerary. Drops malformed
 * stops (no place_name) and days left with no valid stops. Returns null when
 * the value is not an array, is empty, or has no valid day — callers treat null
 * as "no itinerary". The edge function does its own inline validation; this is
 * the client's defensive parse of whatever ended up in the column.
 */
export function parseItinerary(value: unknown): Itinerary | null {
  if (!Array.isArray(value)) return null;
  const days: ItineraryDay[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.day !== 'number' || !Array.isArray(obj.stops)) continue;
    const stops = obj.stops.map(parseStop).filter((s): s is ItineraryStop => s !== null);
    if (stops.length === 0) continue;
    days.push({
      day: obj.day,
      date: typeof obj.date === 'string' ? obj.date : null,
      title: typeof obj.title === 'string' ? obj.title : '',
      stops,
    });
  }
  return days.length > 0 ? days : null;
}

export type LocatedStop = ItineraryStop & { lat: number; lng: number };

/** Flattens an itinerary to the stops that have both coordinates (for the map). */
export function stopsWithCoords(itinerary: Itinerary): LocatedStop[] {
  return itinerary
    .flatMap((day) => day.stops)
    .filter((s): s is LocatedStop => s.lat !== null && s.lng !== null);
}

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

// A 'generating' post older than this is treated as failed/stalled. The edge
// worker can be killed by the platform's wall-clock limit (e.g. a photo-heavy
// trip) without ever writing an 'error' status, which would otherwise leave the
// post spinning forever. Both the trip screen and the post screen use this so a
// stalled generation falls back to a retry path.
export const STALE_GENERATING_MS = 3 * 60 * 1000;

export function isStaleGenerating(
  post: Pick<BlogPost, 'status' | 'created_at'>,
  now: number = Date.now(),
): boolean {
  if (post.status !== 'generating') return false;
  return now - new Date(post.created_at).getTime() > STALE_GENERATING_MS;
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
