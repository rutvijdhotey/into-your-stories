import { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { useLocation } from '../hooks/useLocation';
import { createNote } from '../services/noteService';
import { validateContent, type Category } from '../services/noteHelpers';
import CategoryPicker from './CategoryPicker';
import TripSelector from './TripSelector';
import { Colors, Spacing, Typography } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onStartTrip: () => void;
};

export default function NoteCaptureSheet({ visible, onClose, onStartTrip }: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { trips } = useTrips(userId);
  const { fix, loading: locating, fetch: fetchLocation } = useLocation();

  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'active'), [trips]);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    void fetchLocation();
  }, [visible, fetchLocation]);

  const canSave =
    !saving && selectedTripId !== null && validateContent(content).ok;

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

  const locationLabel = locating
    ? '📍 Locating…'
    : fix?.city
    ? `📍 ${fix.city}`
    : '📍 No location';

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

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          autoFocus
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        <View style={styles.actionRow}>
          <View style={styles.actionLeft}>
            <InertIcon symbol="🎙️" accessibilityLabel="Voice (coming in Phase 4)" />
            <InertIcon symbol="📷" accessibilityLabel="Photo (coming in Phase 5)" />
            <Text style={styles.locationLabel}>{locationLabel}</Text>
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

function InertIcon({ symbol, accessibilityLabel }: { symbol: string; accessibilityLabel: string }) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.inertIcon}>
      <Text style={styles.inertIconLabel}>{symbol}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  handleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  input: {
    ...Typography.body,
    color: Colors.textPrimary,
    minHeight: 120,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  inertIcon: { opacity: 0.4, padding: Spacing.xs },
  inertIconLabel: { fontSize: 20 },
  locationLabel: { ...Typography.caption, color: Colors.textSecondary, marginLeft: Spacing.sm },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveLabel: { ...Typography.body, color: Colors.background, fontWeight: '600' },
});
