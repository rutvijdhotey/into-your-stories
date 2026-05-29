import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNotes } from '../../hooks/useNotes';
import NoteCard from '../../components/NoteCard';
import PhotoStrip from '../../components/PhotoStrip';
import { Colors, Spacing, Typography } from '../../theme';

type Props = { tripId: string };

export default function TripFeedScreen({ tripId }: Props) {
  const { items, loading, error } = useNotes(tripId);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not load notes: {error.message}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No notes yet.</Text>
        <Text style={styles.emptyBody}>
          Tap the + button to capture your first memory.
        </Text>
      </View>
    );
  }

  const allPhotoUrls = items
    .filter((item) => item.kind === 'note')
    .flatMap((item) => (item.kind === 'note' ? item.note.photo_urls : []));

  return (
    <FlatList
      data={items}
      keyExtractor={(item) =>
        item.kind === 'note' ? `note:${item.note.id}` : `pending:${item.pending.offline_id}`
      }
      renderItem={({ item }) => <NoteCard item={item} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<PhotoStrip urls={allPhotoUrls} />}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  list: { paddingTop: Spacing.md, paddingBottom: 96 },
  emptyTitle: { ...Typography.heading, color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyBody: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  error: { ...Typography.body, color: Colors.error, textAlign: 'center' },
});
