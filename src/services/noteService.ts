import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import type { Note, NoteInsert, Category } from './noteHelpers';
import type { LocationSource } from './locationHelpers';
import {
  enqueue,
  peekAll,
  removeByOfflineId,
  type PendingNote,
} from './offlineQueue';
import { enqueuePhotos } from './photoUploadQueue';
import { drainPhotoUploads } from './photoUploadService';
import { drainTagging } from './taggingService';

export type CreateNoteInput = {
  userId: string;
  tripId: string;
  content: string;
  category: Category | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  place_name?: string | null;
  location_source?: LocationSource | null;
  photo_uris?: string[];
  offline_id?: string;
  occurred_at?: string | null;
  rating?: number | null;
};

export async function createNote(input: CreateNoteInput): Promise<PendingNote> {
  const pending: PendingNote = {
    offline_id: input.offline_id ?? Crypto.randomUUID(),
    user_id: input.userId,
    trip_id: input.tripId,
    content: input.content,
    category: input.category,
    lat: input.lat,
    lng: input.lng,
    city: input.city,
    place_name: input.place_name ?? null,
    location_source: input.location_source ?? null,
    captured_at: new Date().toISOString(),
    occurred_at: input.occurred_at ?? null,
    rating: input.rating ?? null,
    photo_uris: input.photo_uris ?? [],
  };

  await enqueue(pending);
  if ((input.photo_uris ?? []).length > 0) {
    await enqueuePhotos(input.photo_uris!, {
      user_id: input.userId,
      offline_note_id: pending.offline_id,
    });
  }
  void drainAll();
  return pending;
}


export async function listNotes(tripId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('trip_id', tripId)
    .order('captured_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function drainQueue(): Promise<number> {
  const items = await peekAll();
  let synced = 0;
  for (const item of items) {
    const row: NoteInsert = {
      user_id: item.user_id,
      trip_id: item.trip_id,
      content: item.content,
      category: item.category ?? null,
      lat: item.lat,
      lng: item.lng,
      city: item.city,
      place_name: item.place_name ?? null,
      location_source: item.location_source ?? null,
      offline_id: item.offline_id,
      captured_at: item.captured_at,
      occurred_at: item.occurred_at ?? null,
      rating: item.rating ?? null,
      photo_urls: [],
    };
    const { error } = await supabase
      .from('notes')
      .upsert(row, { onConflict: 'offline_id', ignoreDuplicates: true });
    if (!error) {
      await removeByOfflineId(item.offline_id);
      synced += 1;
    }
  }
  return synced;
}

export async function drainAll(): Promise<number> {
  const synced = await drainQueue();
  await drainPhotoUploads();
  if (synced > 0) await drainTagging();
  return synced;
}

export type UpdateNoteInput = {
  content: string;
  category: Category | null;
  photo_urls: string[];
  lat: number | null;
  lng: number | null;
  city: string | null;
  place_name: string | null;
  location_source: LocationSource | null;
  rating: number | null;
};

export async function updateNote(id: string, patch: UpdateNoteInput): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({
      content: patch.content,
      category: patch.category,
      photo_urls: patch.photo_urls,
      lat: patch.lat,
      lng: patch.lng,
      city: patch.city,
      place_name: patch.place_name,
      location_source: patch.location_source,
      rating: patch.rating,
      tagging_status: 'pending',
    })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Reassign a note to a different trip. Touches only trip_id — deliberately NOT
 * routed through updateNote, so it does not reset tagging_status or re-resolve
 * location. RLS (notes_update_own) enforces that newTripId belongs to the user.
 */
export async function moveNote(noteId: string, newTripId: string): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({ trip_id: newTripId })
    .eq('id', noteId);

  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
