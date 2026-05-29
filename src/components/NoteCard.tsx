import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing, Pressable } from 'react-native';
import { Colors } from '../theme';
import CategoryBadge from './CategoryBadge';
import PhotoStrip from './PhotoStrip';
import { formatRelativeTime, type Note } from '../services/noteHelpers';
import type { PendingNote } from '../services/offlineQueue';
import type { FeedItem } from '../hooks/useNotes';

type Props = {
  item: FeedItem;
  onPressNote?: (note: Note) => void;
};

export default function NoteCard({ item, onPressNote }: Props) {
  if (item.kind === 'note') return <ServerNoteCard note={item.note} onPress={onPressNote} />;
  return <PendingNoteCard pending={item.pending} />;
}

function ServerNoteCard({ note, onPress }: { note: Note; onPress?: (note: Note) => void }) {
  const showShimmer = note.tagging_status === 'pending' && !note.category;
  return (
    <Pressable
      onPress={() => onPress?.(note)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel="Edit note"
    >
      <View style={styles.headerRow}>
        {note.category ? (
          <CategoryBadge category={note.category} />
        ) : showShimmer ? (
          <ShimmerBadge />
        ) : null}
        <Text style={styles.meta}>
          {[note.city, formatRelativeTime(note.captured_at)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.content} numberOfLines={3}>{note.content}</Text>
      {note.photo_urls.length > 0 && <PhotoStrip urls={note.photo_urls} />}
    </Pressable>
  );
}

function PendingNoteCard({ pending }: { pending: PendingNote }) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <CategoryBadge category={pending.category} />
        <Text style={[styles.meta, styles.syncing]}>
          {[pending.city, '⏳ Syncing'].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.content} numberOfLines={3}>{pending.content}</Text>
    </View>
  );
}

function ShimmerBadge() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.shimmer, { opacity }]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  cardPressed: { opacity: 0.75 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 6,
  },
  shimmer: {
    backgroundColor: Colors.border,
    width: 58,
    height: 20,
    borderRadius: 999,
  },
  meta: {
    fontSize: 10,
    color: '#555555',
    flexShrink: 1,
    textAlign: 'right',
  },
  syncing: { color: Colors.accent },
  content: {
    fontSize: 13,
    color: '#E0E0E0',
    lineHeight: 19,
  },
});
