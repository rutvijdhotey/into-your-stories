import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ensureMediaLibraryPermission, extractExifLocation, extractExifDate } from '../services/photoHelpers';

/** Maximum number of photos allowed on a single note (across existing + new). */
export const MAX_PHOTOS_PER_NOTE = 5;

export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  exifLocation: { lat: number; lng: number } | null;
  exifDate: string | null;
};

type UsePhotoPickerResult = {
  photos: PickedPhoto[];
  /** @param remaining how many more photos may be added (caps the OS picker). */
  pick: (remaining?: number) => Promise<void>;
  remove: (index: number) => void;
  clear: () => void;
};

export function usePhotoPicker(): UsePhotoPickerResult {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  const pick = async (remaining: number = MAX_PHOTOS_PER_NOTE) => {
    if (remaining <= 0) return;

    const granted = await ensureMediaLibraryPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      exif: true,
      quality: 0.7,
      mediaTypes: ['images'] as ImagePicker.MediaType[],
    });

    if (result.canceled) return;

    const picked: PickedPhoto[] = result.assets.map((asset) => ({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      exifLocation: asset.exif
        ? extractExifLocation(asset.exif as Record<string, unknown>)
        : null,
      exifDate: asset.exif
        ? extractExifDate(asset.exif as Record<string, unknown>)
        : null,
    }));

    // Clamp defensively: never exceed the slots the caller said were free.
    setPhotos((prev) => [...prev, ...picked].slice(0, prev.length + remaining));
  };

  const remove = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const clear = () => setPhotos([]);

  return { photos, pick, remove, clear };
}
