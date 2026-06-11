import {
  ANCHOR_PLAUSIBLE_KM,
  haversineKm,
  isPlausible,
  nearestAnchor,
  resolveAutoLocation,
  type AnchorPoint,
} from '../tripAnchorHelpers';

const PARIS: AnchorPoint = { lat: 48.8566, lng: 2.3522 };
const VERSAILLES: AnchorPoint = { lat: 48.8049, lng: 2.1204 };
const LONDON: AnchorPoint = { lat: 51.5074, lng: -0.1278 };
const MOUNTAIN_VIEW: AnchorPoint = { lat: 37.3861, lng: -122.0839 };

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm(PARIS, PARIS)).toBe(0);
  });

  it('computes known distances within 2% (Paris–London ≈ 344 km)', () => {
    expect(haversineKm(PARIS, LONDON)).toBeGreaterThan(335);
    expect(haversineKm(PARIS, LONDON)).toBeLessThan(355);
  });

  it('Paris–Versailles is a short hop (≈ 18 km)', () => {
    expect(haversineKm(PARIS, VERSAILLES)).toBeLessThan(25);
  });
});

describe('isPlausible', () => {
  it('is true with no anchors (no judgment possible)', () => {
    expect(isPlausible(MOUNTAIN_VIEW, [])).toBe(true);
  });

  it('is true within the threshold of any anchor', () => {
    expect(isPlausible(VERSAILLES, [LONDON, PARIS])).toBe(true);
  });

  it('is false when far from every anchor', () => {
    expect(isPlausible(MOUNTAIN_VIEW, [PARIS, LONDON])).toBe(false);
  });

  it('uses the 200 km default threshold (London is implausible for a Paris-only trip)', () => {
    expect(ANCHOR_PLAUSIBLE_KM).toBe(200);
    expect(isPlausible(LONDON, [PARIS])).toBe(false);
  });
});

describe('nearestAnchor', () => {
  it('returns null for an empty anchor list', () => {
    expect(nearestAnchor(PARIS, [])).toBeNull();
  });

  it('picks the closest anchor', () => {
    expect(nearestAnchor(VERSAILLES, [LONDON, PARIS])).toEqual(PARIS);
  });
});

describe('resolveAutoLocation', () => {
  const exifFix = { lat: 48.86, lng: 2.34, city: 'Paris', placeName: 'Louvre' };
  const gpsParis = { lat: 48.85, lng: 2.35, city: 'Paris', placeName: 'Le Marais' };
  const gpsMtv = { lat: 37.3861, lng: -122.0839, city: 'Mountain View', placeName: 'Castro St' };

  it('EXIF always wins, no plausibility check', () => {
    expect(resolveAutoLocation(exifFix, gpsMtv, [PARIS])).toEqual({
      source: 'exif', lat: 48.86, lng: 2.34, city: 'Paris', place_name: 'Louvre',
    });
  });

  it('no EXIF and no GPS → null source', () => {
    expect(resolveAutoLocation(null, null, [PARIS])).toEqual({ source: null });
  });

  it('plausible GPS passes through as gps', () => {
    expect(resolveAutoLocation(null, gpsParis, [PARIS])).toEqual({
      source: 'gps', lat: 48.85, lng: 2.35, city: 'Paris', place_name: 'Le Marais',
    });
  });

  it('GPS with no anchors passes through as gps (no judgment)', () => {
    expect(resolveAutoLocation(null, gpsMtv, [])).toEqual({
      source: 'gps', lat: gpsMtv.lat, lng: gpsMtv.lng, city: 'Mountain View', place_name: 'Castro St',
    });
  });

  it('implausible GPS is replaced by the nearest anchor', () => {
    expect(resolveAutoLocation(null, gpsMtv, [LONDON, PARIS])).toEqual({
      source: 'inferred', anchor: LONDON,
    });
  });
});
