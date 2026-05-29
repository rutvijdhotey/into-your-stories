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
