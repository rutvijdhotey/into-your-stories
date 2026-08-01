import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/types';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { splitByStatus, type Trip } from '../services/tripHelpers';
import { deleteTrip } from '../services/tripService';
import TripCard from '../components/TripCard';
import EmptyState from '../components/EmptyState';
import CreateTripSheet from '../components/CreateTripSheet';

type Nav = NativeStackNavigationProp<MainStackParamList, 'Tabs'>;

type Row =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'trip'; id: string; trip: Trip }
  | { kind: 'toggle'; id: string; expanded: boolean; hidden: number };

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { session, signOut } = useAuth();
  const { trips, loading, error, refresh, optimisticRemove } = useTrips(session?.user.id);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  const displayName =
    ((session?.user.user_metadata?.display_name ?? '') as string) || 'Traveler';

  const rows = useMemo<Row[]>(() => {
    const { active, completed } = splitByStatus(trips);
    const out: Row[] = [];
    if (active.length > 0) {
      out.push({ kind: 'header', id: 'h-active', label: 'Active' });
      for (const t of active) out.push({ kind: 'trip', id: t.id, trip: t });
    }
    if (completed.length > 0) {
      out.push({ kind: 'header', id: 'h-completed', label: 'Completed' });
      const collapsed = completed.length > 3 && !completedExpanded;
      const visible = collapsed ? completed.slice(0, 3) : completed;
      for (const t of visible) out.push({ kind: 'trip', id: t.id, trip: t });
      if (collapsed) {
        out.push({ kind: 'toggle', id: 'toggle-completed', expanded: false, hidden: completed.length - 3 });
      } else if (completed.length > 3) {
        out.push({ kind: 'toggle', id: 'toggle-completed', expanded: true, hidden: 0 });
      }
    }
    return out;
  }, [trips, completedExpanded]);

  const confirmDelete = (trip: Trip) => {
    Alert.alert(
      `Delete "${trip.name}"?`,
      'This will permanently delete the trip and all of its notes. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            optimisticRemove(trip.id);
            try {
              await deleteTrip(trip.id);
            } catch (e) {
              Alert.alert('Could not delete trip', (e as Error).message);
              void refresh();
            }
          },
        },
      ],
    );
  };

  const handleLongPressTrip = (trip: Trip) => {
    if (Platform.OS !== 'ios') {
      Alert.alert(trip.name, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Trip', style: 'destructive', onPress: () => confirmDelete(trip) },
      ]);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: trip.name,
        options: ['Cancel', 'Delete Trip'],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 1,
      },
      (idx) => {
        if (idx === 1) confirmDelete(trip);
      },
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Could not load trips.</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.topBarLeft}>
          <Text style={styles.eyebrow}>NOTEBOUND</Text>
          <Text style={styles.greeting}>Hey, {displayName}</Text>
        </View>
        <View style={styles.topBarRight}>
          <Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
            <Text style={styles.newTripLabel}>＋ New trip</Text>
          </Pressable>
          <Pressable onPress={signOut} hitSlop={8} style={styles.signOutButton}>
            <Text style={styles.signOutLabel}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {trips.length === 0 ? (
        <EmptyState
          emoji="✈️"
          title="No trips yet"
          subtitle="Start your first trip to begin capturing notes, photos, and places."
          ctaLabel="Start your first trip"
          onCtaPress={() => setSheetVisible(true)}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return <Text style={styles.sectionHeader}>{item.label}</Text>;
            }
            if (item.kind === 'toggle') {
              return (
                <Pressable
                  style={styles.toggleButton}
                  onPress={() => setCompletedExpanded((e) => !e)}
                >
                  <Text style={styles.toggleLabel}>
                    {item.expanded ? 'Show fewer' : `Show ${item.hidden} more`}
                  </Text>
                </Pressable>
              );
            }
            return (
              <TripCard
                trip={item.trip}
                onPress={() => navigation.navigate('TripDetail', { tripId: item.trip.id })}
                onLongPress={() => handleLongPressTrip(item.trip)}
              />
            );
          }}
        />
      )}

      <CreateTripSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  topBarLeft: { flex: 1 },
  topBarRight: { alignItems: 'flex-end', gap: Spacing.sm },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  greeting: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  newTripLabel: { fontSize: 14, color: Colors.accent, fontWeight: '700' },
  signOutButton: { paddingVertical: 2 },
  signOutLabel: { fontSize: 12, color: '#555555' },
  listContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  sectionHeader: {
    ...Typography.label,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  toggleButton: { paddingVertical: Spacing.sm, alignItems: 'center' },
  toggleLabel: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  errorText: { ...Typography.heading, marginBottom: Spacing.sm },
  errorDetail: { ...Typography.caption, textAlign: 'center' },
});
