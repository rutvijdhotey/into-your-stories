import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const QUEUE_KEY = 'iys.photoUploadQueue.v1';
const MAX_ATTEMPTS = 5;

export type PendingPhotoUpload = {
  id: string;
  offline_note_id?: string;
  note_db_id?: string;
  user_id: string;
  index: number;
  local_uri: string;
  attempts: number;
  status: 'pending' | 'failed';
};

type Listener = (items: PendingPhotoUpload[]) => void;
const listeners = new Set<Listener>();

async function readAll(): Promise<PendingPhotoUpload[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingPhotoUpload[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: PendingPhotoUpload[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  for (const fn of listeners) fn(items);
}

export async function enqueuePhotos(
  uris: string[],
  opts: { user_id: string; offline_note_id?: string; note_db_id?: string },
): Promise<void> {
  if (uris.length === 0) return;
  const items = await readAll();
  for (let i = 0; i < uris.length; i++) {
    items.push({
      id: Crypto.randomUUID(),
      offline_note_id: opts.offline_note_id,
      note_db_id: opts.note_db_id,
      user_id: opts.user_id,
      index: i,
      local_uri: uris[i],
      attempts: 0,
      status: 'pending',
    });
  }
  await writeAll(items);
}

export async function peekAllPhotos(): Promise<PendingPhotoUpload[]> {
  return readAll();
}

export async function removePhotosByKey(
  key: { offline_note_id: string } | { note_db_id: string },
): Promise<void> {
  const items = await readAll();
  const next =
    'offline_note_id' in key
      ? items.filter((p) => p.offline_note_id !== key.offline_note_id)
      : items.filter((p) => p.note_db_id !== key.note_db_id);
  if (next.length === items.length) return;
  await writeAll(next);
}

export async function updatePhotoAttempt(id: string): Promise<void> {
  const items = await readAll();
  const next = items.map((p) => {
    if (p.id !== id) return p;
    const attempts = p.attempts + 1;
    return { ...p, attempts, status: attempts >= MAX_ATTEMPTS ? ('failed' as const) : p.status };
  });
  await writeAll(next);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
