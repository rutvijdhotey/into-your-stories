import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ensureMediaLibraryPermission } from '../services/photoHelpers';
import { uploadCoverPhoto, deletePhotos } from '../services/photoService';
import { updateCoverPhoto } from '../services/tripService';
import { useAuth } from '../contexts/AuthContext';
import type { Trip } from '../services/tripHelpers';

type UseCoverPhotoResult = {
  setCover: () => Promise<void>;
  removeCover: () => Promise<void>;
  busy: boolean;
};

export function useCoverPhoto(trip: Trip | null): UseCoverPhotoResult {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  const setCover = async () => {
    const userId = session?.user.id;
    if (!userId || !trip) return;

    const granted = await ensureMediaLibraryPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      allowsEditing: true,
      quality: 0.7,
      mediaTypes: ['images'] as ImagePicker.MediaType[],
    });
    if (result.canceled) return;

    // busy is set only after the picker returns; the permission prompt and picker
    // sheet are OS-modal, and Task 6 disables the trigger while busy is true — so
    // a second invocation can't slip through the upload/save window.
    setBusy(true);
    try {
      const url = await uploadCoverPhoto(userId, trip.id, result.assets[0].uri);
      await updateCoverPhoto(trip.id, url);
    } catch (e) {
      Alert.alert('Could not update cover', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeCover = async () => {
    if (!trip) return;
    setBusy(true);
    try {
      const previous = trip.cover_photo_url;
      await updateCoverPhoto(trip.id, null);
      if (previous) void deletePhotos([previous]);
    } catch (e) {
      Alert.alert('Could not update cover', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return { setCover, removeCover, busy };
}
