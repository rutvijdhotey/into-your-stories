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
