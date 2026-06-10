import * as Location from 'expo-location';

export type LocationFix = {
  lat: number;
  lng: number;
  city: string | null;
  placeName: string | null;
};

export async function getCurrentLocation(): Promise<LocationFix | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const { city, placeName } = await reverseGeocodePlace(lat, lng);
    return { lat, lng, city, placeName };
  } catch {
    return null;
  }
}

/**
 * Reverse-geocode coordinates to a city and a more specific place name.
 * `placeName` is always at least as specific as `city` (often a POI/street),
 * falling back through name -> street -> city -> subregion -> region.
 */
export async function reverseGeocodePlace(
  lat: number,
  lng: number,
): Promise<{ city: string | null; placeName: string | null }> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!results.length) return { city: null, placeName: null };
    const r = results[0];
    const city = r.city ?? r.subregion ?? r.region ?? null;
    const placeName = r.name ?? r.street ?? city ?? r.subregion ?? r.region ?? null;
    return { city, placeName };
  } catch {
    return { city: null, placeName: null };
  }
}

/** Forward-geocode free text to coordinates. Returns null on empty/no-result/error. */
export async function geocodeLocation(
  text: string,
): Promise<{ lat: number; lng: number } | null> {
  const query = text.trim();
  if (query.length === 0) return null;
  try {
    const [hit] = await Location.geocodeAsync(query);
    if (!hit) return null;
    return { lat: hit.latitude, lng: hit.longitude };
  } catch {
    return null;
  }
}

/** Reverse-geocode coordinates to a city/district name. Returns null on no-result/error. */
export async function reverseCity(lat: number, lng: number): Promise<string | null> {
  try {
    const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return geo?.city ?? geo?.district ?? null;
  } catch {
    return null;
  }
}
