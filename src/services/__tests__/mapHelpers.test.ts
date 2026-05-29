import { pinColor, toPins, countWithoutLocation } from '../mapHelpers';
import { CategoryColors } from '../../theme';
import type { Note } from '../noteHelpers';
import type { FeedItem } from '../../hooks/useNotes';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1', user_id: 'u1', trip_id: 't1',
  content: 'Great ramen here', category: 'food',
  lat: 35.0, lng: 139.0, city: 'Tokyo', place_name: 'Ramen Shop',
  photo_urls: [], tagging_status: 'complete', offline_id: 'o1',
  captured_at: '2026-05-22T12:00:00Z', created_at: '2026-05-22T12:00:00Z', updated_at: '2026-05-22T12:00:00Z',
  ...overrides,
});

const noteItem = (overrides: Partial<Note> = {}): FeedItem => ({ kind: 'note', note: note(overrides) });
const pendingItem = (): FeedItem => ({
  kind: 'pending',
  pending: { offline_id: 'p1', trip_id: 't1', captured_at: '2026-05-22T12:00:00Z' } as never,
});

describe('pinColor', () => {
  it('returns the vivid text color for a known category', () => {
    expect(pinColor('food')).toBe(CategoryColors.food.text);
    expect(pinColor('to-visit')).toBe(CategoryColors['to-visit'].text);
  });

  it('falls back to the general color for null', () => {
    expect(pinColor(null)).toBe(CategoryColors.general.text);
  });
});

describe('toPins', () => {
  it('keeps only note-items with both lat and lng, projecting the fields', () => {
    const items = [
      noteItem({ id: 'a', lat: 1, lng: 2 }),
      noteItem({ id: 'b', lat: null }),
      noteItem({ id: 'c', lng: null }),
      pendingItem(),
    ];
    const pins = toPins(items);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ id: 'a', lat: 1, lng: 2, category: 'food', place_name: 'Ramen Shop', content: 'Great ramen here' });
    expect(pins[0].note.id).toBe('a');
  });
});

describe('countWithoutLocation', () => {
  it('counts note-items missing lat or lng and ignores pending', () => {
    const items = [ noteItem({ lat: 1, lng: 2 }), noteItem({ lat: null }), noteItem({ lng: null }), pendingItem() ];
    expect(countWithoutLocation(items)).toBe(2);
  });
});
