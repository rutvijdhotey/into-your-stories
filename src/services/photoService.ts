import { supabase } from '../lib/supabase';

async function uploadToBucket(path: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('photos')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadPhoto(
  userId: string,
  noteOfflineId: string,
  index: number,
  uri: string,
): Promise<string> {
  return uploadToBucket(`${userId}/${noteOfflineId}/${index}.jpg`, uri);
}

/**
 * Uploads a trip cover to a fixed per-trip path (upsert overwrites, so no orphan
 * files accumulate). Appends a ?v= cache-buster so RN <Image> doesn't show the
 * stale cached image after a replace at the same URL.
 */
export async function uploadCoverPhoto(
  userId: string,
  tripId: string,
  uri: string,
): Promise<string> {
  const url = await uploadToBucket(`${userId}/trip-covers/${tripId}.jpg`, uri);
  return `${url}?v=${Date.now()}`;
}

export async function deletePhotos(urls: string[]): Promise<void> {
  const paths = urls
    .map((url) => {
      const match = url.match(/\/photos\/(.+)$/);
      return match ? match[1] : null;
    })
    .filter((p): p is string => p !== null);

  if (paths.length === 0) return;

  await supabase.storage.from('photos').remove(paths).catch(() => {});
}
