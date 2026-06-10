import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export function parseDMS(dms: number[], ref: 'N' | 'S' | 'E' | 'W'): number {
  const decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
  return ref === 'S' || ref === 'W' ? -decimal : decimal;
}

export function extractExifLocation(
  exif: Record<string, unknown>,
): { lat: number; lng: number } | null {
  const latRaw = exif['GPSLatitude'];
  const latRef = exif['GPSLatitudeRef'];
  const lngRaw = exif['GPSLongitude'];
  const lngRef = exif['GPSLongitudeRef'];

  // iOS (expo-image-picker on device/simulator) returns decimal degrees directly.
  if (typeof latRaw === 'number' && typeof lngRaw === 'number') {
    const lat = latRef === 'S' ? -Math.abs(latRaw) : Math.abs(latRaw);
    const lng = lngRef === 'W' ? -Math.abs(lngRaw) : Math.abs(lngRaw);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  }

  // Android / some metadata tools return DMS arrays: [degrees, minutes, seconds].
  if (!Array.isArray(latRaw) || !Array.isArray(lngRaw)) return null;
  if (typeof latRef !== 'string' || typeof lngRef !== 'string') return null;
  if (latRaw.length !== 3 || lngRaw.length !== 3) return null;
  if (!latRaw.every((v) => typeof v === 'number')) return null;
  if (!lngRaw.every((v) => typeof v === 'number')) return null;
  if (!['N', 'S'].includes(latRef) || !['E', 'W'].includes(lngRef)) return null;

  return {
    lat: parseDMS(latRaw as number[], latRef as 'N' | 'S'),
    lng: parseDMS(lngRaw as number[], lngRef as 'E' | 'W'),
  };
}

export function validatePhotoCount(count: number): boolean {
  return count <= 5;
}

/**
 * Requests media-library permission. On denial, shows an Alert pointing the
 * user to Settings and returns false. Shared by usePhotoPicker and useCoverPhoto.
 */
export async function ensureMediaLibraryPermission(): Promise<boolean> {
  const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!granted) {
    Alert.alert('Photo access required', 'Go to Settings to allow photo access.');
    return false;
  }
  return true;
}

export function extractExifDate(exif: Record<string, unknown>): string | null {
  const raw = exif['DateTimeOriginal'];
  if (typeof raw !== 'string') return null;
  // EXIF format: "YYYY:MM:DD HH:MM:SS"
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, min, sec] = match;
  const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
