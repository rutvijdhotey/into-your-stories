export type LocationPatch = {
  lat: number | null;
  lng: number | null;
  city: string | null;
  place_name: string | null;
};

export type ResolveLocationEditInput = {
  /** Current text in the Location field. */
  text: string;
  /** Did the user actually change the field? */
  wasEdited: boolean;
  /** Patch to use when the field was not edited (auto GPS/EXIF result). */
  auto: LocationPatch;
  /** Forward-geocode result for `text`, or null if it failed/empty/offline. */
  geocoded: { lat: number; lng: number } | null;
  /** Reverse-geocoded city for `geocoded`, or null. */
  reverseCity: string | null;
};

export function resolveLocationEdit(input: ResolveLocationEditInput): LocationPatch {
  const { text, wasEdited, auto, geocoded, reverseCity } = input;

  if (!wasEdited) return auto;

  const place = text.trim();
  if (place.length === 0) {
    return { lat: null, lng: null, city: null, place_name: null };
  }

  if (geocoded) {
    return {
      lat: geocoded.lat,
      lng: geocoded.lng,
      city: reverseCity ?? place,
      place_name: place,
    };
  }

  // Geocode failed/offline: keep the label, drop the bad pin.
  return { lat: null, lng: null, city: null, place_name: place };
}
