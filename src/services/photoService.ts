import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { PHOTOS_BUCKET, toStoragePath } from './photoRefs';

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

/**
 * Uploads and returns the bucket-relative storage path — NOT a URL. The bucket
 * is private (migration 025), so there is no durable URL to store; the app signs
 * the path at render time via signPhotoRefs.
 */
async function uploadToBucket(path: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;

  return path;
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
 * files accumulate). Appends a ?v= cache-buster so replacing a cover produces a
 * different stored reference — otherwise the signed-URL cache, which is keyed by
 * reference, would keep serving the previous image until its TTL ran out.
 */
export async function uploadCoverPhoto(
  userId: string,
  tripId: string,
  uri: string,
): Promise<string> {
  const path = await uploadToBucket(`${userId}/trip-covers/${tripId}.jpg`, uri);
  return `${path}?v=${Date.now()}`;
}

/** Accepts storage paths and legacy public URLs alike; both normalise to a path. */
export async function deletePhotos(refs: string[]): Promise<void> {
  const paths = refs
    .map((ref) => toStoragePath(ref))
    .filter((p): p is string => p !== null);

  if (paths.length === 0) return;

  await supabase.storage.from(PHOTOS_BUCKET).remove(paths).catch(() => {});
}
