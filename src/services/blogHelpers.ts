import type { Database } from '../lib/database.types';
import type { Category, Note } from './noteHelpers';

type BlogPostRow = Database['public']['Tables']['blog_posts']['Row'];

export type BlogStatus = 'generating' | 'draft' | 'published' | 'error';

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
  }
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
