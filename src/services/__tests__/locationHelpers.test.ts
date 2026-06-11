import { resolveLocationEdit, type LocationPatch } from '../locationHelpers';

const auto: LocationPatch = { lat: 1, lng: 2, city: 'Auto City', place_name: null, location_source: 'gps' };

test('not edited returns the auto patch unchanged', () => {
  expect(
    resolveLocationEdit({ text: 'whatever', wasEdited: false, auto, geocoded: null, reverseCity: null }),
  ).toEqual(auto);
});

test('passes the auto source through when not edited', () => {
  expect(
    resolveLocationEdit({
      text: 'x',
      wasEdited: false,
      auto: { ...auto, location_source: 'exif' },
      geocoded: null,
      reverseCity: null,
    }).location_source,
  ).toBe('exif');
});

test('edited to empty clears every field', () => {
  expect(
    resolveLocationEdit({ text: '   ', wasEdited: true, auto, geocoded: null, reverseCity: null }),
  ).toEqual({ lat: null, lng: null, city: null, place_name: null, location_source: null });
});

test('clears the source when the field is cleared', () => {
  expect(
    resolveLocationEdit({
      text: '  ',
      wasEdited: true,
      auto,
      geocoded: null,
      reverseCity: null,
    }).location_source,
  ).toBeNull();
});

test('edited with successful geocode sets coords, typed place, reverse city', () => {
  expect(
    resolveLocationEdit({
      text: '  Paris ',
      wasEdited: true,
      auto,
      geocoded: { lat: 48.85, lng: 2.35 },
      reverseCity: 'Paris',
    }),
  ).toEqual({ lat: 48.85, lng: 2.35, city: 'Paris', place_name: 'Paris', location_source: 'manual' });
});

test('marks an edited, geocoded location as manual', () => {
  expect(
    resolveLocationEdit({
      text: 'Paris',
      wasEdited: true,
      auto,
      geocoded: { lat: 48.85, lng: 2.35 },
      reverseCity: 'Paris',
    }).location_source,
  ).toBe('manual');
});

test('edited with geocode but no reverse city falls back to typed text for city', () => {
  expect(
    resolveLocationEdit({
      text: 'Quinta da Regaleira',
      wasEdited: true,
      auto,
      geocoded: { lat: 38.79, lng: -9.39 },
      reverseCity: null,
    }),
  ).toEqual({ lat: 38.79, lng: -9.39, city: 'Quinta da Regaleira', place_name: 'Quinta da Regaleira', location_source: 'manual' });
});

test('edited but geocode failed drops the pin, keeps typed place', () => {
  expect(
    resolveLocationEdit({ text: 'Paris', wasEdited: true, auto, geocoded: null, reverseCity: null }),
  ).toEqual({ lat: null, lng: null, city: null, place_name: 'Paris', location_source: 'manual' });
});

test('marks an edited location as manual even when geocoding fails', () => {
  expect(
    resolveLocationEdit({
      text: 'Paris',
      wasEdited: true,
      auto,
      geocoded: null,
      reverseCity: null,
    }).location_source,
  ).toBe('manual');
});
