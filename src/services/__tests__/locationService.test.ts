import * as Location from 'expo-location';
import { geocodeLocation, reverseCity, reverseGeocodePlace } from '../locationService';

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

test('reverseGeocodePlace returns city and a more specific placeName from name', async () => {
  mockReverse.mockResolvedValue([
    { name: 'Eiffel Tower', street: 'Champ de Mars', city: 'Paris', subregion: null, region: 'Île-de-France' },
  ]);
  await expect(reverseGeocodePlace(48.8584, 2.2945)).resolves.toEqual({
    city: 'Paris',
    placeName: 'Eiffel Tower',
  });
});

test('reverseGeocodePlace falls back placeName through street then city/subregion/region', async () => {
  mockReverse.mockResolvedValue([
    { name: null, street: 'Rue de Rivoli', city: 'Paris', subregion: null, region: 'Île-de-France' },
  ]);
  await expect(reverseGeocodePlace(48.86, 2.34)).resolves.toEqual({
    city: 'Paris',
    placeName: 'Rue de Rivoli',
  });
});

test('reverseGeocodePlace placeName falls back to city when no name/street', async () => {
  mockReverse.mockResolvedValue([
    { name: null, street: null, city: 'Kyoto', subregion: null, region: 'Kyoto Prefecture' },
  ]);
  await expect(reverseGeocodePlace(35.0, 135.77)).resolves.toEqual({
    city: 'Kyoto',
    placeName: 'Kyoto',
  });
});

test('reverseGeocodePlace derives city from subregion/region when city is null', async () => {
  mockReverse.mockResolvedValue([
    { name: null, street: null, city: null, subregion: 'Shibuya', region: 'Tokyo' },
  ]);
  await expect(reverseGeocodePlace(35.66, 139.7)).resolves.toEqual({
    city: 'Shibuya',
    placeName: 'Shibuya',
  });
});

test('reverseGeocodePlace returns nulls when there are no results', async () => {
  mockReverse.mockResolvedValue([]);
  await expect(reverseGeocodePlace(0, 0)).resolves.toEqual({ city: null, placeName: null });
});

test('reverseGeocodePlace returns nulls when expo throws', async () => {
  mockReverse.mockRejectedValue(new Error('offline'));
  await expect(reverseGeocodePlace(1, 2)).resolves.toEqual({ city: null, placeName: null });
});
