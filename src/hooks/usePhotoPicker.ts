import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { extractExifLocation } from '../services/photoHelpers';

export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  exifLocation: { lat: number; lng: number } | null;
};

type UsePhotoPickerResult = {
  photos: PickedPhoto[];
  pick: () => Promise<void>;
  remove: (index: number) => void;
  clear: () => void;
};

export function usePhotoPicker(): UsePhotoPickerResult {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  const pick = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Photo access required', 'Go to Settings to allow photo access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: 5,
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
    }));

    setPhotos((prev) => [...prev, ...picked].slice(0, 5));
  };

  const remove = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const clear = () => setPhotos([]);

  return { photos, pick, remove, clear };
}
