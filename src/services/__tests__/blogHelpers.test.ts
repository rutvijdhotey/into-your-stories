import {
  statusLabel,
  formatBlogDate,
  collectPlaces,
  validateBlogResult,
  markdownToHtml,
  checkBlogReadiness,
  MIN_NOTES_FOR_BLOG,
  parseItinerary,
} from '../blogHelpers';
import type { Note } from '../noteHelpers';

describe('statusLabel', () => {
  it('maps each status to a human label', () => {
    expect(statusLabel('generating')).toBe('Generating…');
    expect(statusLabel('draft')).toBe('Ready to review');
    expect(statusLabel('published')).toBe('Published');
    expect(statusLabel('error')).toBe('Failed');
    expect(statusLabel('insufficient')).toBe('Not enough notes');
  });
});

describe('checkBlogReadiness', () => {
  const note = (content: string) => ({ content });

  it('blocks when there are fewer than the minimum notes', () => {
    const result = checkBlogReadiness([note('A decent length note about the harbor at dawn.')]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(String(MIN_NOTES_FOR_BLOG));
  });

  it('blocks when notes meet the count but are trivially short', () => {
    const result = checkBlogReadiness([note('a'), note('b'), note('c')]);
    expect(result.ok).toBe(false);
  });

  it('passes when there are enough notes with real substance', () => {
    const result = checkBlogReadiness([
      note('Wandered the old town and found a tiny bakery tucked off the square.'),
      note('Lunch by the canal — grilled fish and a glass of crisp white wine.'),
      note('Climbed the bell tower at sunset; the whole city glowed amber.'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('ignores whitespace-only padding when measuring substance', () => {
    const result = checkBlogReadiness([note('   '), note('   '), note('   ')]);
    expect(result.ok).toBe(false);
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

describe('markdownToHtml', () => {
  it('wraps output in a full HTML document', () => {
    const html = markdownToHtml('Hello');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<body>');
    expect(html).toContain('</html>');
  });

  it('converts #/##/### into h1/h2/h3', () => {
    const html = markdownToHtml('# Title\n\n## Section\n\n### Sub');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Section</h2>');
    expect(html).toContain('<h3>Sub</h3>');
  });

  it('wraps plain lines in a paragraph', () => {
    expect(markdownToHtml('Just some prose.')).toContain('<p>Just some prose.</p>');
  });

  it('converts a standalone image line to an <img> (URL untouched)', () => {
    const html = markdownToHtml('![A photo](https://x/p.jpg?token=a&b=1)');
    expect(html).toContain('<img alt="A photo" src="https://x/p.jpg?token=a&b=1" />');
  });

  it('converts **bold** to <strong>', () => {
    expect(markdownToHtml('This is **important** stuff.')).toContain('<strong>important</strong>');
  });

  it('escapes HTML-significant characters in prose', () => {
    expect(markdownToHtml('2 < 3 & 4 > 1')).toContain('2 &lt; 3 &amp; 4 &gt; 1');
  });

  it('escapes double-quotes in image alt text so they cannot break the attribute', () => {
    const html = markdownToHtml('![a "quoted" caption](https://x/p.jpg)');
    expect(html).toContain('<img alt="a &quot;quoted&quot; caption" src="https://x/p.jpg" />');
  });
});

describe('parseItinerary', () => {
  const validStop = {
    time_of_day: 'morning',
    place_name: 'Café Aurora',
    category: 'food',
    description: 'Pastries and strong coffee.',
    lat: 41.1,
    lng: -8.6,
  };
  const validDay = { day: 1, date: '2026-05-12', title: 'Old town', stops: [validStop] };

  it('returns null for non-arrays and empty arrays', () => {
    expect(parseItinerary(null)).toBeNull();
    expect(parseItinerary(undefined)).toBeNull();
    expect(parseItinerary('nope')).toBeNull();
    expect(parseItinerary([])).toBeNull();
  });

  it('parses a valid itinerary', () => {
    const result = parseItinerary([validDay]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].day).toBe(1);
    expect(result![0].title).toBe('Old town');
    expect(result![0].stops[0].place_name).toBe('Café Aurora');
    expect(result![0].stops[0].time_of_day).toBe('morning');
    expect(result![0].stops[0].category).toBe('food');
    expect(result![0].stops[0].lat).toBe(41.1);
  });

  it('drops stops without a place_name and days left with no stops', () => {
    const result = parseItinerary([
      { day: 1, date: null, title: 'Day one', stops: [{ ...validStop, place_name: '' }] },
      validDay,
    ]);
    expect(result).toHaveLength(1);
    expect(result![0].day).toBe(1);
    expect(result![0].title).toBe('Old town');
  });

  it('coerces unknown time_of_day and category to null', () => {
    const result = parseItinerary([
      { ...validDay, stops: [{ ...validStop, time_of_day: 'midnight', category: 'wat' }] },
    ]);
    expect(result![0].stops[0].time_of_day).toBeNull();
    expect(result![0].stops[0].category).toBeNull();
  });

  it('coerces non-numeric coords and missing description to safe values', () => {
    const result = parseItinerary([
      { ...validDay, stops: [{ place_name: 'A Place', lat: 'x', lng: null }] },
    ]);
    expect(result![0].stops[0].lat).toBeNull();
    expect(result![0].stops[0].lng).toBeNull();
    expect(result![0].stops[0].description).toBe('');
    expect(result![0].stops[0].category).toBeNull();
  });

  it('returns null when no day has any valid stop', () => {
    expect(parseItinerary([{ day: 1, date: null, title: 'x', stops: [] }])).toBeNull();
  });
});
