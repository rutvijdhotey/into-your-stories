import type { Database } from '../lib/database.types';
import type { LocationSource } from './locationHelpers';

type NoteRow = Database['public']['Tables']['notes']['Row'];
type NoteInsertRow = Database['public']['Tables']['notes']['Insert'];

export type Category = 'food' | 'stay' | 'activity' | 'shopping' | 'to-visit' | 'general';
export type TaggingStatus = 'pending' | 'complete' | 'failed';

export type Note = Omit<NoteRow, 'category' | 'tagging_status' | 'location_source'> & {
  category: Category | null;
  tagging_status: TaggingStatus;
  location_source: LocationSource | null;
};
export type NoteInsert = Omit<NoteInsertRow, 'category' | 'tagging_status' | 'location_source'> & {
  category?: Category | null;
  tagging_status?: TaggingStatus;
  location_source?: LocationSource | null;
};

export const CATEGORIES: Category[] = [
  'food',
  'stay',
  'activity',
  'shopping',
  'to-visit',
  'general',
];

// Categories that may carry a 1–5 star rating. Single source of truth — used by
// the capture sheet, edit sheet, and feed card. Excludes 'to-visit' and 'general'.
export const RATEABLE_CATEGORIES: Category[] = ['food', 'stay', 'activity', 'shopping'];

export function isRateable(category: Category | null): boolean {
  return category !== null && RATEABLE_CATEGORIES.includes(category);
}

const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food',
  stay: 'Stay',
  activity: 'Activity',
  shopping: 'Shopping',
  'to-visit': 'To-Visit',
  general: 'General',
};

export function categoryLabel(category: Category | null): string {
  if (!category) return '';
  return CATEGORY_LABELS[category];
}

export type ContentValidation =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' };

const MAX_CONTENT_LEN = 8000;

export function validateContent(input: string): ContentValidation {
  const value = input.trim();
  if (value.length === 0) return { ok: false, reason: 'empty' };
  if (value.length > MAX_CONTENT_LEN) return { ok: false, reason: 'too_long' };
  return { ok: true, value };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const calendarDelta = Math.floor(
    (startOfDay(now).getTime() - startOfDay(then).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (calendarDelta === 1) return 'Yesterday';
  if (calendarDelta >= 2 && calendarDelta <= 6) return `${calendarDelta} days ago`;

  return `${MONTHS[then.getMonth()]} ${then.getDate()}`;
}
