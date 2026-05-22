import {
  CATEGORIES,
  categoryLabel,
  validateContent,
  formatRelativeTime,
  type Note,
} from '../noteHelpers';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1',
  user_id: 'u1',
  trip_id: 't1',
  content: 'Hello',
  category: null,
  lat: null,
  lng: null,
  city: null,
  place_name: null,
  tagging_status: 'pending',
  offline_id: 'o1',
  captured_at: '2026-05-22T12:00:00Z',
  created_at: '2026-05-22T12:00:00Z',
  updated_at: '2026-05-22T12:00:00Z',
  ...overrides,
});

describe('CATEGORIES', () => {
  it('lists the six categories in design-spec order', () => {
    expect(CATEGORIES).toEqual([
      'food',
      'stay',
      'activity',
      'shopping',
      'to-visit',
      'general',
    ]);
  });
});

describe('categoryLabel', () => {
  it('renders a title-cased label per category', () => {
    expect(categoryLabel('food')).toBe('Food');
    expect(categoryLabel('to-visit')).toBe('To-Visit');
    expect(categoryLabel('general')).toBe('General');
  });
  it('returns empty string when no category set', () => {
    expect(categoryLabel(null)).toBe('');
  });
});

describe('validateContent', () => {
  it('trims and accepts non-empty within length', () => {
    expect(validateContent('  hi  ')).toEqual({ ok: true, value: 'hi' });
  });
  it('rejects empty / whitespace-only', () => {
    expect(validateContent('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateContent('   ')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects content over 8000 chars', () => {
    const long = 'a'.repeat(8001);
    expect(validateContent(long)).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-05-22T12:00:00Z');
  it('returns "Just now" within the last 60 seconds', () => {
    expect(formatRelativeTime('2026-05-22T11:59:30Z', now)).toBe('Just now');
  });
  it('returns "X minutes ago" between 1 and 59 minutes', () => {
    expect(formatRelativeTime('2026-05-22T11:58:00Z', now)).toBe('2 minutes ago');
    expect(formatRelativeTime('2026-05-22T11:01:00Z', now)).toBe('59 minutes ago');
  });
  it('returns "X hours ago" between 1 and 23 hours', () => {
    expect(formatRelativeTime('2026-05-22T10:00:00Z', now)).toBe('2 hours ago');
  });
  it('returns "Yesterday" for 1 calendar day ago', () => {
    expect(formatRelativeTime('2026-05-21T08:00:00Z', now)).toBe('Yesterday');
  });
  it('returns "X days ago" for 2–6 days ago', () => {
    expect(formatRelativeTime('2026-05-19T12:00:00Z', now)).toBe('3 days ago');
  });
  it('falls back to a short date for older entries', () => {
    expect(formatRelativeTime('2026-04-12T12:00:00Z', now)).toBe('Apr 12');
  });
  it('handles "1 minute ago" (singular) correctly', () => {
    expect(formatRelativeTime('2026-05-22T11:59:00Z', now)).toBe('1 minute ago');
  });
  it('handles "1 hour ago" (singular) correctly', () => {
    expect(formatRelativeTime('2026-05-22T11:00:00Z', now)).toBe('1 hour ago');
  });
});

test('Note type is exported', () => {
  expect(note().id).toBe('n1');
});
