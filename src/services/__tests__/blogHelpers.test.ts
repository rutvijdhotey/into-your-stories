import { statusLabel, formatBlogDate, collectPlaces } from '../blogHelpers';
import type { Note } from '../noteHelpers';

describe('statusLabel', () => {
  it('maps each status to a human label', () => {
    expect(statusLabel('generating')).toBe('Generating…');
    expect(statusLabel('draft')).toBe('Ready to review');
    expect(statusLabel('published')).toBe('Published');
    expect(statusLabel('error')).toBe('Failed');
  });
});

describe('formatBlogDate', () => {
  it('formats an ISO timestamp as "Mon D, YYYY"', () => {
    expect(formatBlogDate('2026-05-29T10:00:00.000Z')).toBe('May 29, 2026');
  });
});

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    user_id: 'u1',
    trip_id: 't1',
    content: 'x',
    category: null,
    lat: null,
    lng: null,
    city: null,
    place_name: null,
    tagging_status: 'complete',
    photo_urls: [],
    offline_id: 'o1',
    captured_at: '2026-05-28T00:00:00.000Z',
    created_at: '2026-05-28T00:00:00.000Z',
    updated_at: '2026-05-28T00:00:00.000Z',
    ...overrides,
  } as Note;
}

describe('collectPlaces', () => {
  it('returns one entry per named place, skipping notes without a place_name', () => {
    const places = collectPlaces([
      makeNote({ place_name: 'Ichiran Ramen', category: 'food', city: 'Tokyo' }),
      makeNote({ place_name: null }),
      makeNote({ place_name: 'Senso-ji', category: 'activity', city: 'Tokyo' }),
    ]);
    expect(places).toEqual([
      { place_name: 'Ichiran Ramen', category: 'food', city: 'Tokyo' },
      { place_name: 'Senso-ji', category: 'activity', city: 'Tokyo' },
    ]);
  });

  it('dedupes case-insensitively, keeping the first occurrence', () => {
    const places = collectPlaces([
      makeNote({ place_name: 'Ichiran Ramen', category: 'food', city: 'Tokyo' }),
      makeNote({ place_name: 'ichiran ramen', category: 'general', city: 'Osaka' }),
    ]);
    expect(places).toHaveLength(1);
    expect(places[0]).toEqual({ place_name: 'Ichiran Ramen', category: 'food', city: 'Tokyo' });
  });

  it('returns an empty array when no notes have places', () => {
    expect(collectPlaces([makeNote(), makeNote()])).toEqual([]);
  });
});
