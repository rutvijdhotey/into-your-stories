import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

/** Max pixel length on the longer side. Fine for any display; full-res re-picked later if editing lands. */
const MAX_DIMENSION = 1200;
const UPLOAD_QUALITY = 0.75;

/**
 * Resizes the image so its longest side is at most MAX_DIMENSION, then
 * re-encodes as JPEG at UPLOAD_QUALITY. Returns a new local file:// URI.
 * If the image is already within the limit the resize is a no-op (expo
 * skips the scale step but still re-encodes, which is acceptable).
 */
async function resizeForUpload(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: UPLOAD_QUALITY, format: SaveFormat.JPEG },
  );
  return result.uri;
}

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
  const resized = await resizeForUpload(uri);
  return uploadToBucket(`${userId}/${noteOfflineId}/${index}.jpg`, resized);
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
      const clean = url.split('?')[0];
      const match = clean.match(/\/photos\/(.+)$/);
      return match ? match[1] : null;
    })
    .filter((p): p is string => p !== null);

  if (paths.length === 0) return;

  await supabase.storage.from('photos').remove(paths).catch(() => {});
}
