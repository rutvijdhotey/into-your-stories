import { supabase } from '../lib/supabase';

export async function uploadPhoto(
  userId: string,
  noteOfflineId: string,
  index: number,
  uri: string,
): Promise<string> {
  const path = `${userId}/${noteOfflineId}/${index}.jpg`;
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('photos')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
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
