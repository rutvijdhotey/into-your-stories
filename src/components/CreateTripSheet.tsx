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
  ScrollView,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Spacing, Typography } from '../theme';
import { createTrip } from '../services/tripService';
import { parseDestinations } from '../services/tripHelpers';
import { useAuth } from '../contexts/AuthContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CreateTripSheet({ visible, onClose, onCreated }: Props) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [destinationsText, setDestinationsText] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setDestinationsText('');
    setStartDate(null);
    setEndDate(null);
    setShowStartPicker(false);
    setShowEndPicker(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Trip name required', 'Give your trip a name to continue.');
      return;
    }
    if (!session?.user.id) return;

    setSubmitting(true);
    try {
      await createTrip(session.user.id, {
        name: trimmed,
        destinations: parseDestinations(destinationsText),
        startDate: startDate ? toIsoDate(startDate) : null,
        endDate: endDate ? toIsoDate(endDate) : null,
      });
      onCreated?.();
      handleClose();
    } catch (e) {
      Alert.alert('Could not create trip', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>New Trip</Text>
          <Pressable onPress={handleCreate} hitSlop={12} disabled={submitting}>
            <Text style={[styles.create, submitting && styles.createDisabled]}>
              {submitting ? '...' : 'Create'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Japan 2026"
            placeholderTextColor={Colors.textSecondary}
            autoFocus
          />

          <Text style={styles.label}>Destinations</Text>
          <TextInput
            style={styles.input}
            value={destinationsText}
            onChangeText={setDestinationsText}
            placeholder="Tokyo, Kyoto, Osaka"
            placeholderTextColor={Colors.textSecondary}
          />
          <Text style={styles.hint}>Separate multiple cities with commas.</Text>

          <Text style={styles.label}>Start date</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowStartPicker((s) => !s)}>
            <Text style={styles.dateText}>{startDate ? toIsoDate(startDate) : 'Optional'}</Text>
            {startDate ? (
              <Pressable onPress={() => setStartDate(null)} hitSlop={8}>
                <Text style={styles.clear}>Clear</Text>
              </Pressable>
            ) : null}
          </Pressable>
          {showStartPicker ? (
            <DateTimePicker
              value={startDate ?? new Date()}
              mode="date"
              display="inline"
              themeVariant="dark"
              onChange={(_, d) => {
                if (d) setStartDate(d);
              }}
            />
          ) : null}

          <Text style={styles.label}>End date</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowEndPicker((s) => !s)}>
            <Text style={styles.dateText}>{endDate ? toIsoDate(endDate) : 'Optional'}</Text>
            {endDate ? (
              <Pressable onPress={() => setEndDate(null)} hitSlop={8}>
                <Text style={styles.clear}>Clear</Text>
              </Pressable>
            ) : null}
          </Pressable>
          {showEndPicker ? (
            <DateTimePicker
              value={endDate ?? startDate ?? new Date()}
              mode="date"
              display="inline"
              themeVariant="dark"
              minimumDate={startDate ?? undefined}
              onChange={(_, d) => {
                if (d) setEndDate(d);
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { ...Typography.heading },
  cancel: { ...Typography.body, color: Colors.textSecondary },
  create: { ...Typography.body, color: Colors.accent, fontWeight: '600' },
  createDisabled: { opacity: 0.4 },
  form: { padding: Spacing.md, gap: Spacing.sm },
  label: { ...Typography.caption, color: Colors.textSecondary, marginTop: Spacing.md },
  input: {
    ...Typography.body,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 12,
  },
  hint: { ...Typography.caption },
  dateButton: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: { ...Typography.body },
  clear: { ...Typography.caption, color: Colors.accent },
});
