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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { useLocation } from '../hooks/useLocation';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { usePhotoPicker, MAX_PHOTOS_PER_NOTE } from '../hooks/usePhotoPicker';
import { createNote } from '../services/noteService';
import { detectIntent } from '../services/voiceService';
import { validateContent, type Category } from '../services/noteHelpers';
import CategoryPicker from './CategoryPicker';
import LocationField from './LocationField';
import TripSelector from './TripSelector';
import { Colors, Spacing, BorderRadius } from '../theme';
import { geocodeLocation, reverseCity, reverseGeocodePlace } from '../services/locationService';
import { resolveLocationEdit } from '../services/locationHelpers';
import { isPlausible, nearestAnchor, resolveAutoLocation } from '../services/tripAnchorHelpers';
import type { AnchorPoint } from '../services/tripAnchorHelpers';
import { getTripAnchors } from '../services/tripAnchorService';
import type { LocationPatch } from '../services/locationHelpers';

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

  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'active'), [trips]);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [intentLoading, setIntentLoading] = useState(false);
  const [exifPlace, setExifPlace] = useState<{ city: string | null; placeName: string | null } | null>(null);
  const [location, setLocation] = useState('');
  const [locationEdited, setLocationEdited] = useState(false);

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

  // Earliest EXIF capture date among picked photos (used as the note's occurred_at)
  const earliestExifDate = useMemo(() => {
    const dates = photoPicker.photos
      .map((p) => p.exifDate)
      .filter((d): d is string => d !== null);
    if (dates.length === 0) return null;
    return dates.reduce((min, d) => (d < min ? d : min));
  }, [photoPicker.photos]);

  useEffect(() => {
    if (!exifLocation) { setExifPlace(null); return; }
    let cancelled = false;
    reverseGeocodePlace(exifLocation.lat, exifLocation.lng)
      .then((result) => {
        if (!cancelled) setExifPlace(result);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [exifLocation]);

  // Trip anchors for GPS plausibility (destinations + trusted notes).
  const [anchors, setAnchors] = useState<AnchorPoint[]>([]);
  useEffect(() => {
    if (!visible || !selectedTripId) { setAnchors([]); return; }
    let cancelled = false;
    getTripAnchors(selectedTripId)
      .then((result) => { if (!cancelled) setAnchors(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible, selectedTripId]);

  // When the live GPS fix is implausible for the trip (and there's no EXIF),
  // the nearest anchor becomes the effective auto location.
  const inferredAnchor = useMemo(() => {
    if (exifLocation || !fix) return null;
    const point = { lat: fix.lat, lng: fix.lng };
    if (isPlausible(point, anchors)) return null;
    return nearestAnchor(point, anchors);
  }, [exifLocation, fix, anchors]);

  const [anchorPlace, setAnchorPlace] = useState<{ city: string | null; placeName: string | null } | null>(null);
  useEffect(() => {
    if (!inferredAnchor) { setAnchorPlace(null); return; }
    let cancelled = false;
    reverseGeocodePlace(inferredAnchor.lat, inferredAnchor.lng)
      .then((result) => { if (!cancelled) setAnchorPlace(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [inferredAnchor]);

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
          setContent(prev => prev ? prev + ' ' + result.text : result.text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          voice.reset();
          setContent(prev => prev ? prev + ' ' + transcript : transcript);
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
    setExifPlace(null);
    setLocation('');
    setLocationEdited(false);
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

  const displayCity =
    exifPlace?.city ??
    (inferredAnchor ? anchorPlace?.city ?? null : locating ? null : fix?.city ?? null);

  useEffect(() => {
    if (!locationEdited) setLocation(displayCity ?? '');
  }, [displayCity, locationEdited]);

  const photos = photoPicker.photos;
  const remainingPhotoSlots = MAX_PHOTOS_PER_NOTE - photos.length;

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
    validateContent(content).ok;

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
      // Determine auto location: EXIF wins; otherwise GPS is plausibility-checked
      // against the trip anchors and replaced by the nearest anchor if it looks
      // wrong for this trip (e.g. editing a Paris trip from home).
      const latest = await fetchLocation();
      const gpsFix = latest ?? fix;
      const auto = resolveAutoLocation(
        exifLocation
          ? { lat: exifLocation.lat, lng: exifLocation.lng, city: exifPlace?.city ?? null, placeName: exifPlace?.placeName ?? null }
          : null,
        gpsFix
          ? { lat: gpsFix.lat, lng: gpsFix.lng, city: gpsFix.city, placeName: gpsFix.placeName }
          : null,
        anchors,
      );

      let autoPatch: LocationPatch;
      if (auto.source === 'inferred') {
        const place = anchorPlace ?? (await reverseGeocodePlace(auto.anchor.lat, auto.anchor.lng));
        autoPatch = {
          lat: auto.anchor.lat,
          lng: auto.anchor.lng,
          city: place.city,
          place_name: place.placeName,
          location_source: 'inferred',
        };
      } else if (auto.source === null) {
        autoPatch = { lat: null, lng: null, city: null, place_name: null, location_source: null };
      } else {
        autoPatch = {
          lat: auto.lat,
          lng: auto.lng,
          city: auto.city,
          place_name: auto.place_name,
          location_source: auto.source,
        };
      }

      // Apply any manual location edit on top of the auto result
      const geocoded = locationEdited ? await geocodeLocation(location) : null;
      const revCity =
        locationEdited && geocoded ? await reverseCity(geocoded.lat, geocoded.lng) : null;
      const locPatch = resolveLocationEdit({
        text: location,
        wasEdited: locationEdited,
        auto: autoPatch,
        geocoded,
        reverseCity: revCity,
      });

      await createNote({
        userId,
        tripId: selectedTripId,
        content: validation.value,
        category,
        lat: locPatch.lat,
        lng: locPatch.lng,
        city: locPatch.city,
        place_name: locPatch.place_name,
        location_source: locPatch.location_source,
        photo_uris: photos.map((p) => p.uri),
        occurred_at: earliestExifDate,
      });

      photoPicker.clear();
      onClose();
    } catch (e) {
      Alert.alert('Could not save note', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLocationChange = (text: string) => {
    setLocation(text);
    setLocationEdited(true);
  };

  const handleMicPress = async () => {
    if (intentLoading) return;
    if (voice.status === 'recording') {
      voice.stop();
    } else if (voice.status === 'idle' || voice.status === 'error') {
      await voice.start();
    }
  };

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
          autoCorrect
          autoCapitalize="sentences"
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

        <View style={styles.actionRow}>
          <View style={styles.locationFieldWrap}>
            <LocationField
              value={location}
              onChangeText={handleLocationChange}
              loading={locating && !exifPlace?.city && !locationEdited}
            />
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
  locationFieldWrap: { flex: 1, marginHorizontal: Spacing.sm },
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
