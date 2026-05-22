import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Category } from './noteHelpers';

export const QUEUE_KEY = 'iys.offlineQueue.v1';

export type PendingNote = {
  offline_id: string;
  user_id: string;
  trip_id: string;
  content: string;
  category: Category | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  captured_at: string;
};

type Listener = (items: PendingNote[]) => void;
const listeners = new Set<Listener>();

async function readAll(): Promise<PendingNote[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingNote[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: PendingNote[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  for (const fn of listeners) fn(items);
}

export async function enqueue(note: PendingNote): Promise<void> {
  const items = await readAll();
  items.push(note);
  await writeAll(items);
}

export async function peekAll(): Promise<PendingNote[]> {
  return readAll();
}

export async function removeByOfflineId(offlineId: string): Promise<void> {
  const items = await readAll();
  const next = items.filter((n) => n.offline_id !== offlineId);
  if (next.length === items.length) return;
  await writeAll(next);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
