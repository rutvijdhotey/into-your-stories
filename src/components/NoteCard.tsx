import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { categoryLabel, formatRelativeTime, type Note, type Category } from '../services/noteHelpers';
import type { PendingNote } from '../services/offlineQueue';
import type { FeedItem } from '../hooks/useNotes';

type Props = { item: FeedItem };

export default function NoteCard({ item }: Props) {
  if (item.kind === 'note') return <ServerNoteCard note={item.note} />;
  return <PendingNoteCard pending={item.pending} />;
}

function ServerNoteCard({ note }: { note: Note }) {
  const showShimmer = note.tagging_status === 'pending' && !note.category;
  return (
    <View style={styles.card}>
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
      <Text style={styles.content}>{note.content}</Text>
    </View>
  );
}

function PendingNoteCard({ pending }: { pending: PendingNote }) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {pending.category ? <CategoryBadge category={pending.category} /> : null}
        <Text style={[styles.meta, styles.syncing]}>
          {[pending.city, '⏳ Syncing'].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.content}>{pending.content}</Text>
    </View>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{categoryLabel(category)}</Text>
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
  return <Animated.View style={[styles.badge, styles.shimmer, { opacity }]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  badge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    minHeight: 18,
    minWidth: 56,
  },
  badgeLabel: { ...Typography.caption, color: Colors.background, fontWeight: '600' },
  shimmer: { backgroundColor: Colors.border },
  meta: { ...Typography.caption, color: Colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  syncing: { color: Colors.accent },
  content: { ...Typography.body, color: Colors.textPrimary },
});
