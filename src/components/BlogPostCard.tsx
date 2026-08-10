import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../theme';
import { statusLabel, formatBlogDate, type BlogPost } from '../services/blogHelpers';
import { useSignedPhotoUrl } from '../hooks/useSignedPhotos';

type Props = {
  post: BlogPost;
  onPress: () => void;
};

function statusColor(status: BlogPost['status']): string {
  if (status === 'error') return Colors.error;
  if (status === 'published') return Colors.stay; // green
  return Colors.textSecondary;
}

export default function BlogPostCard({ post, onPress }: Props) {
  const date = post.published_at ?? post.created_at;
  const coverUri = useSignedPhotoUrl(post.cover_photo_url);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
    >
      {coverUri ? (
        <Image source={{ uri: coverUri }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]} />
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {post.title ?? 'Untitled'}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.status, { color: statusColor(post.status) }]}>
            {statusLabel(post.status)}
          </Text>
          <Text style={styles.date}>{formatBlogDate(date)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Shadows.card,
  },
  pressed: { opacity: 0.85 },
  cover: { width: 96, height: 96 },
  coverFallback: { backgroundColor: Colors.border },
  body: { flex: 1, padding: Spacing.md, justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  status: { fontSize: 12, fontWeight: '700' },
  date: { fontSize: 12, color: Colors.textSecondary },
});
