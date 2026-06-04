import { supabase } from '../lib/supabase';
import { uploadPhoto } from './photoService';
import {
  peekAllPhotos,
  updatePhotoAttempt,
  removePhotosByKey,
  type PendingPhotoUpload,
} from './photoUploadQueue';

function noteKeyString(item: PendingPhotoUpload): string | null {
  if (item.offline_note_id) return `offline:${item.offline_note_id}`;
  if (item.note_db_id) return `db:${item.note_db_id}`;
  return null;
}

async function patchNote(
  item: PendingPhotoUpload,
  cdnUrls: string[],
): Promise<void> {
  if (item.offline_note_id) {
    const { data } = await supabase
      .from('notes')
      .select('id, photo_urls')
      .eq('offline_id', item.offline_note_id)
      .maybeSingle();
    if (!data) return;
    const merged = [...(data.photo_urls ?? []), ...cdnUrls];
    await supabase.from('notes').update({ photo_urls: merged }).eq('id', data.id);
    await removePhotosByKey({ offline_note_id: item.offline_note_id });
  } else if (item.note_db_id) {
    const { data } = await supabase
      .from('notes')
      .select('id, photo_urls')
      .eq('id', item.note_db_id)
      .maybeSingle();
    if (!data) return;
    const merged = [...(data.photo_urls ?? []), ...cdnUrls];
    await supabase.from('notes').update({ photo_urls: merged }).eq('id', data.id);
    await removePhotosByKey({ note_db_id: item.note_db_id });
  }
}

export async function drainPhotoUploads(): Promise<void> {
  const items = await peekAllPhotos();
  const pending = items.filter((p) => p.status === 'pending');
  if (pending.length === 0) return;

  // id → CDN url for items that uploaded successfully in this run
  const succeeded = new Map<string, string>();

  for (const item of pending) {
    if (!item.offline_note_id && !item.note_db_id) {
      await updatePhotoAttempt(item.id);
      continue;
    }
    const noteId = item.offline_note_id ?? item.note_db_id!;
    try {
      const url = await uploadPhoto(item.user_id, noteId, item.index, item.local_uri);
      succeeded.set(item.id, url);
    } catch {
      await updatePhotoAttempt(item.id);
    }
  }

  // Re-read to get updated attempt counts / statuses after failures
  const updated = await peekAllPhotos();

  // Group all items (pending + failed) by note key
  const byKey = new Map<string, PendingPhotoUpload[]>();
  for (const item of updated) {
    const k = noteKeyString(item);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(item);
  }

  // Also include items that were just successfully uploaded (removed from queue)
  // by reconstituting them from `pending` with succeeded status
  for (const item of pending) {
    if (!succeeded.has(item.id)) continue;
    const k = noteKeyString(item);
    if (!k) continue;
    // Only add if not already in the group (i.e., not still in queue)
    const group = byKey.get(k);
    if (!group) {
      byKey.set(k, [item]);
    } else if (!group.some((g) => g.id === item.id)) {
      group.push(item);
    }
  }

  for (const group of byKey.values()) {
    // A group is fully resolved when every item either succeeded this run or is 'failed'
    const allResolved = group.every(
      (p) => succeeded.has(p.id) || p.status === 'failed',
    );
    if (!allResolved) continue;

    const cdnUrls = group
      .map((p) => succeeded.get(p.id))
      .filter((u): u is string => u !== undefined);

    await patchNote(group[0], cdnUrls);
  }
}
