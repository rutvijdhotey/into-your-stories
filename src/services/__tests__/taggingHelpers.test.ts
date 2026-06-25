import { validateCategory, normalizeSuggestion, mergeTags } from '../taggingHelpers';

describe('validateCategory', () => {
  it('returns the value for each valid category', () => {
    for (const c of ['food', 'stay', 'activity', 'shopping', 'to-visit', 'general']) {
      expect(validateCategory(c)).toBe(c);
    }
  });

  it('lowercases mixed-case input', () => {
    expect(validateCategory('Food')).toBe('food');
    expect(validateCategory('TO-VISIT')).toBe('to-visit');
  });

  it('falls back to general for junk or non-strings', () => {
    expect(validateCategory('nightlife')).toBe('general');
    expect(validateCategory('')).toBe('general');
    expect(validateCategory(null)).toBe('general');
    expect(validateCategory(42)).toBe('general');
  });
});

describe('normalizeSuggestion', () => {
  it('validates category and coerces place_name/city to nullable strings', () => {
    expect(
      normalizeSuggestion({ category: 'Food', place_name: 'Ichiran Ramen', city: 'Tokyo' }),
    ).toEqual({ category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' });
  });

  it('maps empty strings and missing fields to null', () => {
    expect(normalizeSuggestion({ category: 'bogus', place_name: '   ', city: undefined })).toEqual({
      category: 'general',
      place_name: null,
      city: null,
    });
  });

  it('returns a safe suggestion for non-object input', () => {
    expect(normalizeSuggestion(null)).toEqual({ category: 'general', place_name: null, city: null });
    expect(normalizeSuggestion('oops')).toEqual({ category: 'general', place_name: null, city: null });
  });
});

describe('mergeTags', () => {
  const suggestion = { category: 'food' as const, place_name: 'Ichiran Ramen', city: 'Tokyo' };

  it('keeps an existing user category and existing GPS city', () => {
    expect(
      mergeTags({ category: 'stay', city: 'Kyoto' }, suggestion),
    ).toEqual({ category: 'stay', place_name: 'Ichiran Ramen', city: 'Kyoto' });
  });

  it('fills category and city from the suggestion when both are blank', () => {
    expect(
      mergeTags({ category: null, city: null }, suggestion),
    ).toEqual({ category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' });
  });

  it('takes the suggested place_name when none is set', () => {
    expect(
      mergeTags({ category: 'stay', city: 'Kyoto' }, { ...suggestion, place_name: 'Park Hyatt' }),
    ).toMatchObject({ place_name: 'Park Hyatt' });
  });

  it('preserves a manually-set place_name over the suggestion', () => {
    expect(
      mergeTags(
        { category: null, city: null, place_name: 'Paris', location_source: 'manual' },
        { category: 'activity', place_name: 'Googleplex', city: 'Mountain View' },
      ),
    ).toEqual({ category: 'activity', place_name: 'Paris', city: 'Mountain View' });
  });

  it('overrides a geocoder (gps) place_name with the AI venue', () => {
    expect(
      mergeTags(
        { category: 'food', city: 'Tokyo', place_name: 'Shibuya Crossing', location_source: 'gps' },
        suggestion,
      ),
    ).toMatchObject({ place_name: 'Ichiran Ramen' });
  });

  it('keeps the geocoder place_name when the AI suggestion has none', () => {
    expect(
      mergeTags(
        { category: 'food', city: 'Tokyo', place_name: '1-2-3 Dogenzaka', location_source: 'gps' },
        { ...suggestion, place_name: null },
      ),
    ).toMatchObject({ place_name: '1-2-3 Dogenzaka' });
  });

  it('keeps a manual place_name even when the AI suggests a venue', () => {
    expect(
      mergeTags(
        { category: null, city: null, place_name: 'Grandma’s house', location_source: 'manual' },
        suggestion,
      ),
    ).toMatchObject({ place_name: 'Grandma’s house' });
  });
});
