import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { deletePhotos } from '../services/photoService';
import { updateNote, deleteNote, drainAll } from '../services/noteService';
import { enqueuePhotos } from '../services/photoUploadQueue';
import { validateContent, type Category, type Note, isRateable } from '../services/noteHelpers';
import StarRating from './StarRating';
import { usePhotoPicker, MAX_PHOTOS_PER_NOTE } from '../hooks/usePhotoPicker';
import CategoryPicker from './CategoryPicker';
import LocationField from './LocationField';
import MoveToTripSheet from './MoveToTripSheet';
import { geocodeLocation, reverseCity } from '../services/locationService';
import { resolveLocationEdit } from '../services/locationHelpers';
import { invalidateTripAnchors } from '../services/tripAnchorService';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  note: Note;
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onMoved: () => void;
};

export default function NoteEditSheet({ note, visible, onClose, onDeleted, onMoved }: Props) {
  const [content, setContent] = useState(note.content);
  const [showMove, setShowMove] = useState(false);
  const [category, setCategory] = useState<Category | null>(note.category);
  const [rating, setRating] = useState<number | null>(note.rating);
  const [location, setLocation] = useState(note.place_name ?? note.city ?? '');
  const [locationEdited, setLocationEdited] = useState(false);
  // existingUrls: photos already on the note; removedUrls: staged for deletion on Save
  const [existingUrls, setExistingUrls] = useState<string[]>(note.photo_urls);
  const [removedUrls, setRemovedUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const photoPicker = usePhotoPicker();

  // Reset local state each time the sheet opens for a (potentially different) note
  const handleShow = () => {
    setContent(note.content);
    setCategory(note.category);
    setRating(note.rating);
    setLocation(note.place_name ?? note.city ?? '');
    setLocationEdited(false);
    setExistingUrls(note.photo_urls);
    setRemovedUrls([]);
    photoPicker.clear();
  };

  const handleCategoryChange = (next: Category | null) => {
    setCategory(next);
    if (!isRateable(next)) setRating(null);
  };

  const handleLocationChange = (text: string) => {
    setLocation(text);
    setLocationEdited(true);
  };

  const handleRemoveExisting = (url: string) => {
    setExistingUrls((prev) => prev.filter((u) => u !== url));
    setRemovedUrls((prev) => [...prev, url]);
  };

  const canSave = !saving && validateContent(content).ok;

  // Cap total photos per note: existing (kept) + newly picked must not exceed the limit.
  const remainingPhotoSlots = MAX_PHOTOS_PER_NOTE - existingUrls.length - photoPicker.photos.length;

  const handleAddPhotos = () => {
    if (remainingPhotoSlots <= 0) {
      Alert.alert('Photo limit reached', `You can add up to ${MAX_PHOTOS_PER_NOTE} photos per note.`);
      return;
    }
    void photoPicker.pick(remainingPhotoSlots);
  };

  const handleSave = async () => {
    const validation = validateContent(content);
    if (!validation.ok) {
      Alert.alert(
        'Cannot save note',
        validation.reason === 'empty' ? 'Add some text first.' : 'Note is too long (max 8000 chars).',
      );
      return;
    }

    setSaving(true);
    try {
      // 1. Delete removed photos from Storage (synchronous, not a bottleneck)
      if (removedUrls.length > 0) {
        await deletePhotos(removedUrls);
      }

      // 2. Enqueue new photos for background upload
      if (photoPicker.photos.length > 0) {
        await enqueuePhotos(
          photoPicker.photos.map((p) => p.uri),
          { user_id: note.user_id, note_db_id: note.id },
        );
      }

      // 3. Update note record with existing URLs only; new ones patched in by drain
      const geocoded = locationEdited ? await geocodeLocation(location) : null;
      const revCity =
        locationEdited && geocoded ? await reverseCity(geocoded.lat, geocoded.lng) : null;
      const locPatch = resolveLocationEdit({
        text: location,
        wasEdited: locationEdited,
        auto: { lat: note.lat, lng: note.lng, city: note.city, place_name: note.place_name, location_source: note.location_source },
        geocoded,
        reverseCity: revCity,
      });

      await updateNote(note.id, {
        content: validation.value,
        category,
        photo_urls: existingUrls,
        lat: locPatch.lat,
        lng: locPatch.lng,
        city: locPatch.city,
        place_name: locPatch.place_name,
        location_source: locPatch.location_source,
        rating,
      });

      // A manual location is a new trusted anchor — refresh this trip's cache.
      if (locPatch.location_source === 'manual') invalidateTripAnchors(note.trip_id);

      void drainAll();
      photoPicker.clear();
      onClose();
    } catch (e) {
      Alert.alert('Could not save note', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete note?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (deleting) return;
            setDeleting(true);
            try {
              // Best-effort delete all photos from Storage
              const allUrls = [...existingUrls, ...removedUrls, ...note.photo_urls];
              const uniqueUrls = [...new Set(allUrls)];
              if (uniqueUrls.length > 0) await deletePhotos(uniqueUrls);
              await deleteNote(note.id);
              onDeleted();
            } catch (e) {
              Alert.alert('Could not delete note', (e as Error).message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
      onShow={handleShow}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Edit Note</Text>
          <Pressable onPress={onClose} style={styles.cancelButton} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          autoFocus={false}
          autoCorrect
          autoCapitalize="sentences"
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={handleCategoryChange} />
        {isRateable(category) && (
          <View style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.sm }}>
            <StarRating value={rating} onChange={setRating} />
          </View>
        )}

        <View style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.sm }}>
          <LocationField value={location} onChangeText={handleLocationChange} />
        </View>

        {/* Existing photos with delete badges */}
        {(existingUrls.length > 0 || photoPicker.photos.length > 0) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.previewStrip}
            contentContainerStyle={styles.previewStripContent}
          >
            {existingUrls.map((url) => (
              <View key={url} style={styles.thumbContainer}>
                <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => handleRemoveExisting(url)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))}
            {photoPicker.photos.map((photo, index) => (
              <View key={photo.uri} style={styles.thumbContainer}>
                <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => photoPicker.remove(index)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        <Pressable
          onPress={handleAddPhotos}
          accessibilityRole="button"
          accessibilityLabel="Add photos"
          style={styles.addPhotosButton}
        >
          <Text style={styles.addPhotosEmoji}>📷</Text>
          <Text style={styles.addPhotosLabel}>
            {remainingPhotoSlots > 0
              ? `Add photos (${remainingPhotoSlots} left)`
              : `Photo limit reached (${MAX_PHOTOS_PER_NOTE} max)`}
          </Text>
        </Pressable>

        <View style={styles.actionRow}>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Save note"
          >
            {saving ? (
              <ActivityIndicator color={Colors.background} size="small" />
            ) : (
              <Text style={styles.saveLabel}>Save</Text>
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={() => setShowMove(true)}
          accessibilityRole="button"
          accessibilityLabel="Move note to another trip"
          style={styles.moveButton}
        >
          <Text style={styles.moveLabel}>Move to trip…</Text>
        </Pressable>

        <Pressable onPress={handleDelete} disabled={deleting} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Delete note">
          <Text style={styles.deleteLabel}>Delete Note</Text>
        </Pressable>

        <MoveToTripSheet
          visible={showMove}
          userId={note.user_id}
          currentTripId={note.trip_id}
          noteId={note.id}
          onClose={() => setShowMove(false)}
          onMoved={() => {
            setShowMove(false);
            onMoved();
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  handleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  cancelButton: { padding: 4 },
  cancelLabel: { fontSize: 16, color: Colors.accent },
  input: {
    fontSize: 16,
    color: Colors.textPrimary,
    flex: 1,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
  },
  previewStrip: { maxHeight: 76 },
  previewStripContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    gap: 8,
  },
  thumbContainer: { position: 'relative' },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  removeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 14, lineHeight: 16, fontWeight: '700' },
  addPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: 8,
  },
  addPhotosEmoji: { fontSize: 18 },
  addPhotosLabel: { fontSize: 14, color: Colors.textSecondary },
  actionRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveLabel: { fontSize: 16, color: Colors.background, fontWeight: '800' },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  deleteLabel: { fontSize: 15, color: Colors.error },
  moveButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  moveLabel: { fontSize: 15, color: Colors.accent },
});
