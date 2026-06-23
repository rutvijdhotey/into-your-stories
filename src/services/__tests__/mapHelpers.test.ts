import { pinColor, toPins, countWithoutLocation, filterPins, regionForPins, type MapPin } from '../mapHelpers';
import { CategoryColors } from '../../theme';
import type { Note } from '../noteHelpers';
import type { FeedItem } from '../../hooks/useNotes';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1', user_id: 'u1', trip_id: 't1',
  content: 'Great ramen here', category: 'food',
  lat: 35.0, lng: 139.0, city: 'Tokyo', place_name: 'Ramen Shop',
  photo_urls: [], tagging_status: 'complete', location_source: null, offline_id: 'o1', occurred_at: null,
  captured_at: '2026-05-22T12:00:00Z', created_at: '2026-05-22T12:00:00Z', updated_at: '2026-05-22T12:00:00Z',
  ...overrides,
});

const noteItem = (overrides: Partial<Note> = {}): FeedItem => ({ kind: 'note', note: note(overrides), photoStatus: null });
const pendingItem = (): FeedItem => ({
  kind: 'pending',
  pending: { offline_id: 'p1', trip_id: 't1', captured_at: '2026-05-22T12:00:00Z' } as never,
});

const pin = (id: string, category: MapPin['category']): MapPin => ({
  id, lat: 1, lng: 2, category, place_name: null, content: '', note: note({ id, category }),
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

describe('filterPins', () => {
  const pins = [pin('a', 'food'), pin('b', 'stay'), pin('c', 'food')];
  it('returns all pins when category is null (the All state)', () => {
    expect(filterPins(pins, null)).toHaveLength(3);
  });
  it('returns only pins matching the given category', () => {
    expect(filterPins(pins, 'food').map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('regionForPins', () => {
  it('returns null for no pins', () => {
    expect(regionForPins([])).toBeNull();
  });
  it('centers on a single pin with the default delta', () => {
    const region = regionForPins([pin('a', 'food')]);
    expect(region).toEqual({ latitude: 1, longitude: 2, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  });
  it('returns the padded bounding box for multiple pins', () => {
    const pins = [ { ...pin('a', 'food'), lat: 10, lng: 20 }, { ...pin('b', 'stay'), lat: 12, lng: 26 } ];
    const region = regionForPins(pins)!;
    expect(region.latitude).toBeCloseTo(11, 5);
    expect(region.longitude).toBeCloseTo(23, 5);
    expect(region.latitudeDelta).toBeCloseTo(2 * 1.4, 5);
    expect(region.longitudeDelta).toBeCloseTo(6 * 1.4, 5);
  });
  it('clamps tiny spans to the minimum delta', () => {
    const pins = [ { ...pin('a', 'food'), lat: 10, lng: 20 }, { ...pin('b', 'stay'), lat: 10.0001, lng: 20.0001 } ];
    const region = regionForPins(pins)!;
    expect(region.latitudeDelta).toBe(0.01);
    expect(region.longitudeDelta).toBe(0.01);
  });
  it('accepts a plain lat/lng list (not just MapPins)', () => {
    const region = regionForPins([
      { lat: 10, lng: 20 },
      { lat: 12, lng: 24 },
    ])!;
    expect(region.latitude).toBeCloseTo(11);
    expect(region.longitude).toBeCloseTo(22);
  });
});
