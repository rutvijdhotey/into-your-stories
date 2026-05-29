import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import type { Note, NoteInsert, Category } from './noteHelpers';
import {
  enqueue,
  peekAll,
  removeByOfflineId,
  type PendingNote,
} from './offlineQueue';
import { drainTagging } from './taggingService';

export type CreateNoteInput = {
  userId: string;
  tripId: string;
  content: string;
  category: Category | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  photo_urls?: string[];
  offline_id?: string;
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
    captured_at: new Date().toISOString(),
  };

  await enqueue(pending);
  void trySync(pending, input.photo_urls ?? []).then((synced) => {
    if (synced) void drainTagging();
  });
  return pending;
}

async function trySync(pending: PendingNote, photoUrls: string[] = []): Promise<boolean> {
  const row: NoteInsert = {
    user_id: pending.user_id,
    trip_id: pending.trip_id,
    content: pending.content,
    category: pending.category ?? null,
    lat: pending.lat,
    lng: pending.lng,
    city: pending.city,
    offline_id: pending.offline_id,
    captured_at: pending.captured_at,
    photo_urls: photoUrls,
  };

  const { error } = await supabase
    .from('notes')
    .upsert(row, { onConflict: 'offline_id', ignoreDuplicates: true });

  if (!error) {
    await removeByOfflineId(pending.offline_id);
    return true;
  }
  return false;
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
      offline_id: item.offline_id,
      captured_at: item.captured_at,
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

export type UpdateNoteInput = {
  content: string;
  category: Category | null;
  photo_urls: string[];
};

export async function updateNote(id: string, patch: UpdateNoteInput): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({
      content: patch.content,
      category: patch.category,
      photo_urls: patch.photo_urls,
      tagging_status: 'pending',
    })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
