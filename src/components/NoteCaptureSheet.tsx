import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { useLocation } from '../hooks/useLocation';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { usePhotoPicker, MAX_PHOTOS_PER_NOTE } from '../hooks/usePhotoPicker';
import { useConnectivity } from '../hooks/useConnectivity';
import { createNote } from '../services/noteService';
import { uploadPhoto, deletePhotos } from '../services/photoService';
import { detectIntent } from '../services/voiceService';
import { validateContent, type Category } from '../services/noteHelpers';
import CategoryPicker from './CategoryPicker';
import TripSelector from './TripSelector';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onStartTrip: () => void;
  onSearchIntent: (query: string) => void;
  /** When true, start voice recording as soon as the sheet opens. */
  autoRecord?: boolean;
};

export default function NoteCaptureSheet({
  visible,
  onClose,
  onStartTrip,
  onSearchIntent,
  autoRecord = false,
}: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { trips } = useTrips(userId);
  const { fix, loading: locating, fetch: fetchLocation } = useLocation();
  const voice = useVoiceRecording();
  const photoPicker = usePhotoPicker();
  const { isOnline } = useConnectivity();

  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'active'), [trips]);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [intentLoading, setIntentLoading] = useState(false);
  const [exifCity, setExifCity] = useState<string | null>(null);

  // Pulsing ring animation for recording state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (voice.status === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [voice.status, pulseAnim]);

  // Reverse-geocode EXIF GPS from the first photo that has it
  const exifLocation = useMemo(
    () => photoPicker.photos.find((p) => p.exifLocation)?.exifLocation ?? null,
    [photoPicker.photos],
  );

  useEffect(() => {
    if (!exifLocation) { setExifCity(null); return; }
    let cancelled = false;
    Location.reverseGeocodeAsync({ latitude: exifLocation.lat, longitude: exifLocation.lng })
      .then(([geo]) => {
        if (!cancelled) setExifCity(geo?.city ?? geo?.district ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [exifLocation]);

  // Handle completed transcription.
  // NOTE: voice.reset() is intentionally called AFTER detectIntent resolves, not
  // before. Calling it first changes voice.status + voice.finalTranscript (both
  // deps), which triggers the effect cleanup and sets cancelled=true before the
  // async work finishes — permanently blocking setIntentLoading(false).
  useEffect(() => {
    if (voice.status !== 'done' || !voice.finalTranscript) return;
    const transcript = voice.finalTranscript;
    let cancelled = false;
    setIntentLoading(true);
    detectIntent(transcript)
      .then((result) => {
        if (cancelled) return;
        voice.reset();
        if (result.intent === 'search') {
          onClose();
          onSearchIntent(result.text);
        } else {
          setContent(result.text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          voice.reset();
          setContent(transcript);
        }
      })
      .finally(() => {
        if (!cancelled) setIntentLoading(false);
      });
    return () => { cancelled = true; };
  }, [voice.status, voice.finalTranscript, voice.reset, onClose, onSearchIntent]);

  useEffect(() => {
    if (!visible) return;
    if (activeTrips.length === 0) setSelectedTripId(null);
    else if (!selectedTripId || !activeTrips.some((t) => t.id === selectedTripId)) {
      setSelectedTripId(activeTrips[0].id);
    }
  }, [visible, activeTrips, selectedTripId]);

  useEffect(() => {
    if (!visible) return;
    setContent('');
    setCategory(null);
    setIntentLoading(false);
    setExifCity(null);
    photoPicker.clear();
    voice.reset();
    void fetchLocation();
    if (autoRecord) {
      void voice.start();
    }
  // Intentional: runs only when the sheet opens (visible flip). autoRecord, voice.*
  // and photoPicker.clear are excluded — their identities change each render and
  // including them would re-fire the reset on every keystroke.
  }, [visible, fetchLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const photos = photoPicker.photos;
  const remainingPhotoSlots = MAX_PHOTOS_PER_NOTE - photos.length;
  const photosBlockSave = photos.length > 0 && !isOnline;

  const handleAddPhotos = () => {
    if (remainingPhotoSlots <= 0) {
      Alert.alert('Photo limit reached', `You can add up to ${MAX_PHOTOS_PER_NOTE} photos per note.`);
      return;
    }
    void photoPicker.pick(remainingPhotoSlots);
  };
  const canSave =
    !saving &&
    !intentLoading &&
    selectedTripId !== null &&
    validateContent(content).ok &&
    !photosBlockSave;

  const handleSave = async () => {
    if (!userId || !selectedTripId) return;
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
      const offlineId = Crypto.randomUUID();

      // Upload photos sequentially
      let uploadedUrls: string[] = [];
      if (photos.length > 0) {
        let allUploaded = true;
        let uploadError: string | null = null;
        for (let i = 0; i < photos.length; i++) {
          try {
            const url = await uploadPhoto(userId, offlineId, i, photos[i].uri);
            uploadedUrls.push(url);
          } catch (uploadErr) {
            console.error('[PhotoUpload] failed:', uploadErr);
            uploadError = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
            allUploaded = false;
            break;
          }
        }

        if (!allUploaded) {
          let saveWithout = false;
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Upload failed',
              uploadError ?? 'Some photos could not be uploaded.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
                { text: 'Save without photos', onPress: () => { saveWithout = true; resolve(); } },
              ],
            );
          });
          if (!saveWithout) {
            void deletePhotos(uploadedUrls); // best-effort cleanup of partially-uploaded files
            return;
          }
          uploadedUrls = [];
        }
      }

      // Determine final location: EXIF overrides live GPS
      const latest = await fetchLocation();
      const noteLat = exifLocation ? exifLocation.lat : (latest?.lat ?? fix?.lat ?? null);
      const noteLng = exifLocation ? exifLocation.lng : (latest?.lng ?? fix?.lng ?? null);
      const noteCity = exifLocation ? exifCity : (latest?.city ?? fix?.city ?? null);

      await createNote({
        userId,
        tripId: selectedTripId,
        content: validation.value,
        category,
        lat: noteLat,
        lng: noteLng,
        city: noteCity,
        photo_urls: uploadedUrls,
        offline_id: offlineId,
      });

      photoPicker.clear();
      onClose();
    } catch (e) {
      Alert.alert('Could not save note', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleMicPress = async () => {
    if (intentLoading) return;
    if (voice.status === 'recording') {
      voice.stop();
    } else if (voice.status === 'idle' || voice.status === 'error') {
      await voice.start();
    }
  };

  const displayCity = exifCity ?? (locating ? null : fix?.city ?? null);
  const locationLabel = locating && !exifCity
    ? '📍 Locating…'
    : displayCity
    ? `📍 ${displayCity}`
    : '📍 No location';

  const isRecording = voice.status === 'recording';
  const micLabel =
    intentLoading
      ? 'Thinking…'
      : isRecording
      ? (voice.partialTranscript || 'Listening…')
      : voice.status === 'error'
      ? (voice.error ?? 'Try again')
      : 'Hold to record';
  const micLabelColor =
    voice.status === 'error' ? Colors.error : isRecording ? Colors.accent : '#555555';

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.flex}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <TripSelector
          activeTrips={activeTrips}
          selectedTripId={selectedTripId}
          onSelect={setSelectedTripId}
          onStartTrip={() => {
            onClose();
            onStartTrip();
          }}
        />

        <View style={styles.micSection}>
          <Pressable
            onPress={handleMicPress}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start voice recording'}
            style={styles.micOuter}
          >
            {isRecording && (
              <Animated.View
                style={[styles.micRing, { transform: [{ scale: pulseAnim }] }]}
              />
            )}
            <LinearGradient
              colors={['#E08040', '#C0581A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.micButton, !isRecording && styles.micButtonIdle]}
            >
              {intentLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.micEmoji}>{isRecording ? '⏹' : '🎙️'}</Text>
              )}
            </LinearGradient>
          </Pressable>
          <Text style={[styles.micHint, { color: micLabelColor }]} numberOfLines={2}>
            {micLabel}
          </Text>
        </View>

        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          autoFocus={false}
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        <Pressable
          onPress={handleAddPhotos}
          accessibilityRole="button"
          accessibilityLabel="Add photos"
          style={styles.addPhotosButton}
        >
          <Text style={styles.addPhotosEmoji}>📷</Text>
          <Text style={styles.addPhotosLabel}>
            {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} added` : 'Add photos'}
          </Text>
        </Pressable>

        {photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.previewStrip}
            contentContainerStyle={styles.previewStripContent}
          >
            {photos.map((photo, index) => (
              <View key={photo.uri} style={styles.previewThumbContainer}>
                <Image source={{ uri: photo.uri }} style={styles.previewThumb} resizeMode="cover" />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => photoPicker.remove(index)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {photosBlockSave && (
          <Text style={styles.offlineWarning}>Connect to save with photos</Text>
        )}

        <View style={styles.actionRow}>
          <View style={styles.locationPill}>
            <Text style={styles.locationPillText}>{locationLabel}</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            accessibilityRole="button"
          >
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
        </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  handleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  micSection: { alignItems: 'center', paddingVertical: Spacing.md },
  micOuter: { alignItems: 'center', justifyContent: 'center', width: 80, height: 80 },
  micRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,69,58,0.7)',
  },
  micButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonIdle: { opacity: 0.5 },
  micEmoji: { fontSize: 28 },
  micHint: { marginTop: Spacing.sm, fontSize: 11, textAlign: 'center', paddingHorizontal: Spacing.lg },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#444444' },
  orText: { fontSize: 11, color: '#444444', fontWeight: '700' },
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
  previewThumbContainer: { position: 'relative' },
  previewThumb: { width: 60, height: 60, borderRadius: 8 },
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
  removeButtonText: { color: '#fff', fontSize: 14, lineHeight: 16, fontWeight: '700' },
  offlineWarning: {
    fontSize: 12,
    color: Colors.error,
    textAlign: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  addPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
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
  locationPill: {
    flex: 1,
    marginHorizontal: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  locationPillText: { fontSize: 12, color: Colors.textSecondary },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.button,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveLabel: { fontSize: 16, color: Colors.background, fontWeight: '800' },
});
