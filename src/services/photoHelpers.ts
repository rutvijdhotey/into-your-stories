export function parseDMS(dms: number[], ref: 'N' | 'S' | 'E' | 'W'): number {
  const decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
  return ref === 'S' || ref === 'W' ? -decimal : decimal;
}

export function extractExifLocation(
  exif: Record<string, unknown>,
): { lat: number; lng: number } | null {
  const latArr = exif['GPSLatitude'];
  const latRef = exif['GPSLatitudeRef'];
  const lngArr = exif['GPSLongitude'];
  const lngRef = exif['GPSLongitudeRef'];

  if (!Array.isArray(latArr) || !Array.isArray(lngArr)) return null;
  if (typeof latRef !== 'string' || typeof lngRef !== 'string') return null;
  if (latArr.length !== 3 || lngArr.length !== 3) return null;
  if (!latArr.every((v) => typeof v === 'number')) return null;
  if (!lngArr.every((v) => typeof v === 'number')) return null;
  if (!['N', 'S'].includes(latRef) || !['E', 'W'].includes(lngRef)) return null;

  return {
    lat: parseDMS(latArr as number[], latRef as 'N' | 'S'),
    lng: parseDMS(lngArr as number[], lngRef as 'E' | 'W'),
  };
}

export function validatePhotoCount(count: number): boolean {
  return count <= 5;
}
