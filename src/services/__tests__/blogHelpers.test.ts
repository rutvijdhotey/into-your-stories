import { statusLabel, formatBlogDate, collectPlaces, validateBlogResult } from '../blogHelpers';
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

describe('validateBlogResult', () => {
  const valid = {
    title: 'Five Days in Tokyo',
    content_markdown: '# Tokyo\n\nWhat a trip.',
    cover_photo_url: 'https://x/p.jpg',
    selected_photo_urls: ['https://x/p.jpg'],
  };

  it('returns the typed result for a well-formed object', () => {
    expect(validateBlogResult(valid)).toEqual(valid);
  });

  it('accepts a null cover_photo_url and empty photo list', () => {
    const r = validateBlogResult({ ...valid, cover_photo_url: null, selected_photo_urls: [] });
    expect(r).not.toBeNull();
    expect(r!.cover_photo_url).toBeNull();
    expect(r!.selected_photo_urls).toEqual([]);
  });

  it('returns null when title is missing', () => {
    const { title: _omit, ...rest } = valid;
    expect(validateBlogResult(rest)).toBeNull();
  });

  it('returns null when content_markdown is not a string', () => {
    expect(validateBlogResult({ ...valid, content_markdown: 123 })).toBeNull();
  });

  it('returns null when selected_photo_urls contains a non-string', () => {
    expect(validateBlogResult({ ...valid, selected_photo_urls: ['ok', 5] })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(validateBlogResult(null)).toBeNull();
    expect(validateBlogResult('nope')).toBeNull();
  });
});
