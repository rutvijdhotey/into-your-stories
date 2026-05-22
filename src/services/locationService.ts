import * as Location from 'expo-location';

export type LocationFix = {
  lat: number;
  lng: number;
  city: string | null;
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
    const city = await reverseGeocodeCity(lat, lng);
    return { lat, lng, city };
  } catch {
    return null;
  }
}

export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!results.length) return null;
    const r = results[0];
    return r.city ?? r.subregion ?? r.region ?? null;
  } catch {
    return null;
  }
}
