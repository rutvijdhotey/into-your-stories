import { parseDMS, extractExifLocation, validatePhotoCount } from '../photoHelpers';

describe('parseDMS', () => {
  it('converts north latitude to positive decimal degrees', () => {
    // Paris latitude: 48° 51' 30" N = 48.858333...
    expect(parseDMS([48, 51, 30], 'N')).toBeCloseTo(48.8583, 4);
  });

  it('converts south latitude to negative decimal degrees', () => {
    // Sydney latitude: 33° 51' 54" S = -33.865
    expect(parseDMS([33, 51, 54], 'S')).toBeCloseTo(-33.865, 4);
  });

  it('converts east longitude to positive decimal degrees', () => {
    // Paris longitude: 2° 21' 3.6" E = 2.351
    expect(parseDMS([2, 21, 3.6], 'E')).toBeCloseTo(2.351, 4);
  });

  it('converts west longitude to negative decimal degrees', () => {
    // New York longitude: 73° 56' 6" W = -73.935
    expect(parseDMS([73, 56, 6], 'W')).toBeCloseTo(-73.935, 4);
  });
});

describe('extractExifLocation', () => {
  it('returns lat/lng for a valid EXIF object with all GPS fields', () => {
    const exif = {
      GPSLatitude: [48, 51, 30],
      GPSLatitudeRef: 'N',
      GPSLongitude: [2, 21, 3.6],
      GPSLongitudeRef: 'E',
    };
    const result = extractExifLocation(exif);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(48.8583, 4);
    expect(result!.lng).toBeCloseTo(2.351, 4);
  });

  it('returns null when GPS latitude is missing', () => {
    expect(extractExifLocation({ GPSLongitude: [2, 21, 3.6], GPSLongitudeRef: 'E' })).toBeNull();
  });

  it('returns null when GPS ref is missing', () => {
    expect(extractExifLocation({ GPSLatitude: [48, 51, 30], GPSLongitude: [2, 21, 3.6] })).toBeNull();
  });

  it('returns null for empty EXIF object', () => {
    expect(extractExifLocation({})).toBeNull();
  });

  it('returns null when lat array has wrong length (not 3 elements)', () => {
    const exif = {
      GPSLatitude: [48, 51],
      GPSLatitudeRef: 'N',
      GPSLongitude: [2, 21, 3.6],
      GPSLongitudeRef: 'E',
    };
    expect(extractExifLocation(exif)).toBeNull();
  });

  it('returns null when GPS values are strings instead of numbers', () => {
    const exif = {
      GPSLatitude: ['48', '51', '30'],
      GPSLatitudeRef: 'N',
      GPSLongitude: [2, 21, 3.6],
      GPSLongitudeRef: 'E',
    };
    expect(extractExifLocation(exif)).toBeNull();
  });

  it('returns null when ref is an invalid value', () => {
    const exif = {
      GPSLatitude: [48, 51, 30],
      GPSLatitudeRef: 'X',
      GPSLongitude: [2, 21, 3.6],
      GPSLongitudeRef: 'E',
    };
    expect(extractExifLocation(exif)).toBeNull();
  });

  it('applies negative sign for S latitude ref', () => {
    const exif = {
      GPSLatitude: [33, 51, 54],
      GPSLatitudeRef: 'S',
      GPSLongitude: [151, 12, 36],
      GPSLongitudeRef: 'E',
    };
    const result = extractExifLocation(exif);
    expect(result!.lat).toBeLessThan(0);
    expect(result!.lng).toBeGreaterThan(0);
  });
});

describe('validatePhotoCount', () => {
  it('returns true for 0 photos', () => {
    expect(validatePhotoCount(0)).toBe(true);
  });
  it('returns true for exactly 5 photos', () => {
    expect(validatePhotoCount(5)).toBe(true);
  });
  it('returns false for 6 photos', () => {
    expect(validatePhotoCount(6)).toBe(false);
  });
  it('returns false for counts above 5', () => {
    expect(validatePhotoCount(10)).toBe(false);
  });
});
