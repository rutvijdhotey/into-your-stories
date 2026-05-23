import { getTripGradient, TripGradients } from '../index';

describe('getTripGradient', () => {
  it('returns a two-element array for any string', () => {
    const result = getTripGradient('Tokyo');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('is deterministic — same name always yields the same gradient', () => {
    expect(getTripGradient('Paris')).toEqual(getTripGradient('Paris'));
    expect(getTripGradient('')).toEqual(getTripGradient(''));
  });

  it('returns a tuple that exists in TripGradients', () => {
    expect(TripGradients).toContainEqual(getTripGradient('Barcelona'));
    expect(TripGradients).toContainEqual(getTripGradient(''));
  });

  it('distributes across multiple gradients for varied names', () => {
    const results = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'Tokyo', 'Paris'].map(getTripGradient);
    const unique = new Set(results.map(JSON.stringify));
    expect(unique.size).toBeGreaterThan(1);
  });
});
