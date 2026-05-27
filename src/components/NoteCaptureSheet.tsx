import { useEffect, useMemo, useRef, useState } from 'react';
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
  Animated,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { useLocation } from '../hooks/useLocation';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { createNote } from '../services/noteService';
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

  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'active'), [trips]);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [intentLoading, setIntentLoading] = useState(false);

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
    voice.reset();
    void fetchLocation();
    if (autoRecord) {
      void voice.start();
    }
  }, [visible, fetchLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = !saving && !intentLoading && selectedTripId !== null && validateContent(content).ok;

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
      const latest = await fetchLocation();
      await createNote({
        userId,
        tripId: selectedTripId,
        content: validation.value,
        category,
        lat: latest?.lat ?? fix?.lat ?? null,
        lng: latest?.lng ?? fix?.lng ?? null,
        city: latest?.city ?? fix?.city ?? null,
      });
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

  const locationLabel = locating
    ? '📍 Locating…'
    : fix?.city
    ? `📍 ${fix.city}`
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
          autoFocus={!isRecording}
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        <View style={styles.actionRow}>
          <View
            accessibilityLabel="Photo (coming in Phase 5)"
            style={styles.inertIcon}
          >
            <Text style={styles.inertIconLabel}>📷</Text>
          </View>
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  inertIcon: { opacity: 0.4, padding: Spacing.xs },
  inertIconLabel: { fontSize: 20 },
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
