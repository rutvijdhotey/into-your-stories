import * as Location from 'expo-location';
import { geocodeLocation, reverseCity } from '../locationService';

jest.mock('expo-location');

const mockGeocode = Location.geocodeAsync as jest.Mock;
const mockReverse = Location.reverseGeocodeAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

test('geocodeLocation returns coords from the first hit', async () => {
  mockGeocode.mockResolvedValue([{ latitude: 48.85, longitude: 2.35 }]);
  await expect(geocodeLocation('Paris')).resolves.toEqual({ lat: 48.85, lng: 2.35 });
});

test('geocodeLocation returns null for empty input without calling expo', async () => {
  await expect(geocodeLocation('   ')).resolves.toBeNull();
  expect(mockGeocode).not.toHaveBeenCalled();
});

test('geocodeLocation returns null when no hits', async () => {
  mockGeocode.mockResolvedValue([]);
  await expect(geocodeLocation('Nowheresville')).resolves.toBeNull();
});

test('geocodeLocation returns null when expo throws (offline)', async () => {
  mockGeocode.mockRejectedValue(new Error('offline'));
  await expect(geocodeLocation('Paris')).resolves.toBeNull();
});

test('reverseCity returns city, falling back to district', async () => {
  mockReverse.mockResolvedValue([{ city: null, district: 'Shibuya' }]);
  await expect(reverseCity(35.6, 139.7)).resolves.toBe('Shibuya');
});

test('reverseCity returns null when expo throws', async () => {
  mockReverse.mockRejectedValue(new Error('offline'));
  await expect(reverseCity(1, 2)).resolves.toBeNull();
});
