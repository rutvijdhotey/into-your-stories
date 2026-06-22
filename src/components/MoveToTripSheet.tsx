import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { listTrips } from '../services/tripService';
import { moveNote } from '../services/noteService';
import type { Trip } from '../services/tripHelpers';
import TripStatusBadge from './TripStatusBadge';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  visible: boolean;
  userId: string;
  currentTripId: string;
  noteId: string;
  onClose: () => void;
  onMoved: () => void;
};

export default function MoveToTripSheet({
  visible,
  userId,
  currentTripId,
  noteId,
  onClose,
  onMoved,
}: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);

  // Load trips whenever the sheet becomes visible; reset when it hides so a
  // stale list never flashes on reopen.
  useEffect(() => {
    if (!visible) {
      setTrips([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listTrips(userId)
      .then((all) => {
        if (cancelled) return;
        setTrips(all.filter((t) => t.id !== currentTripId));
      })
      .catch((e: Error) => {
        if (cancelled) return;
        Alert.alert('Could not load trips', e.message);
        setTrips([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, userId, currentTripId]);

  const confirmMove = (trip: Trip) => {
    if (moving) return;
    Alert.alert('Move note', `Move this note to "${trip.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move',
        onPress: async () => {
          setMoving(true);
          try {
            await moveNote(noteId, trip.id);
            onMoved();
          } catch (e) {
            Alert.alert('Could not move note', (e as Error).message);
          } finally {
            setMoving(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <View style={styles.flex}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Move to Trip</Text>
          <Pressable onPress={onClose} style={styles.cancelButton} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.lg }} />
        ) : trips.length === 0 ? (
          <Text style={styles.empty}>No other trips to move this note to.</Text>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const dest = item.destinations.length > 0 ? item.destinations[0] : null;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => confirmMove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move to ${item.name}`}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    {dest ? <Text style={styles.rowDest}>{dest}</Text> : null}
                  </View>
                  <TripStatusBadge status={item.status} />
                </Pressable>
              );
            }}
          />
        )}
      </View>
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
  empty: { color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.lg },
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowText: { flex: 1, marginRight: Spacing.sm },
  rowName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  rowDest: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
