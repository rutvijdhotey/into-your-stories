import type { Category, Note } from './noteHelpers';
import type { FeedItem } from '../hooks/useNotes';
import { CategoryColors } from '../theme';

export type MapPin = {
  id: string; // note id
  lat: number;
  lng: number;
  category: Category | null;
  place_name: string | null;
  content: string;
  note: Note; // full note, passed to NoteEditSheet on callout press
};

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export function pinColor(category: Category | null): string {
  const key = category ?? 'general';
  return (CategoryColors[key] ?? CategoryColors.general).text;
}

export function toPins(items: FeedItem[]): MapPin[] {
  const pins: MapPin[] = [];
  for (const item of items) {
    if (item.kind !== 'note') continue;
    const { note } = item;
    if (note.lat == null || note.lng == null) continue;
    pins.push({
      id: note.id, lat: note.lat, lng: note.lng,
      category: note.category, place_name: note.place_name, content: note.content, note,
    });
  }
  return pins;
}

export function countWithoutLocation(items: FeedItem[]): number {
  return items.filter(
    (item) => item.kind === 'note' && (item.note.lat == null || item.note.lng == null),
  ).length;
}

export function filterPins(pins: MapPin[], category: Category | null): MapPin[] {
  if (category == null) return pins;
  return pins.filter((p) => p.category === category);
}

const DEFAULT_DELTA = 0.02;
const MIN_DELTA = 0.01;
const PADDING = 1.4;

export function regionForPins(pins: MapPin[]): Region | null {
  if (pins.length === 0) return null;
  if (pins.length === 1) {
    return { latitude: pins[0].lat, longitude: pins[0].lng, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA };
  }
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pins) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING, MIN_DELTA),
  };
}
