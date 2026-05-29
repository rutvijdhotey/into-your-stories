import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius } from '../../theme';
import { getBlogPost, publishPost, unpublish, discardDraft } from '../../services/blogService';
import { markdownToHtml, statusLabel, type BlogPost } from '../../services/blogHelpers';
import { supabase } from '../../lib/supabase';

type Props = NativeStackScreenProps<MainStackParamList, 'BlogPost'>;

export default function BlogPostScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const row = await getBlogPost(postId);
      setPost(row);
    } catch {
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates so a 'generating' post flips to 'draft' on this screen too.
  useEffect(() => {
    const channel = supabase
      .channel(`blog_post:${postId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'blog_posts', filter: `id=eq.${postId}` },
        (payload) => {
          const next = payload.new as BlogPost;
          setPost((prev) => {
            // Ignore strictly-older updates so an out-of-order event can't
            // clobber fresher state (e.g. a stale 'draft' arriving post-publish).
            if (prev && next.updated_at < prev.updated_at) return prev;
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [postId]);

  const handlePublish = async () => {
    setBusy(true);
    try {
      await publishPost(postId);
      await load();
    } catch (e) {
      Alert.alert('Could not publish', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnpublish = async () => {
    setBusy(true);
    try {
      await unpublish(postId);
      await load();
    } catch (e) {
      Alert.alert('Could not unpublish', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert('Discard draft?', 'This permanently deletes the draft.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            await discardDraft(postId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not discard', (e as Error).message);
          }
        },
      },
    ]);
  };

  const handleExport = () => {
    if (!post?.content_markdown) return;
    Alert.alert('Export', 'Choose a format', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Markdown', onPress: () => exportMarkdown(post) },
      { text: 'HTML', onPress: () => exportHtml(post) },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This post is no longer available.</Text>
      </View>
    );
  }

  if (post.status === 'generating') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
        <Text style={styles.muted}>Writing your story… this takes about a minute.</Text>
      </View>
    );
  }

  if (post.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Generation failed</Text>
        <Text style={styles.muted}>{post.error_message ?? 'Something went wrong.'}</Text>
        <Text style={styles.muted}>Open the trip and tap Generate Blog to try again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {post.cover_photo_url ? (
          <Image source={{ uri: post.cover_photo_url }} style={styles.hero} />
        ) : null}
        <View style={styles.content}>
          <Text style={styles.statusPill}>{statusLabel(post.status)}</Text>
          <Text style={styles.title}>{post.title ?? 'Untitled'}</Text>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Markdown style={markdownStyles as any}>{post.content_markdown ?? ''}</Markdown>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {post.status === 'draft' ? (
          <>
            <Pressable
              style={[styles.primaryButton, busy && styles.disabled]}
              onPress={handlePublish}
              disabled={busy}
            >
              <Text style={styles.primaryLabel}>Publish</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleExport}>
              <Text style={styles.secondaryLabel}>Export</Text>
            </Pressable>
            <Pressable style={styles.destructiveButton} onPress={handleDiscard}>
              <Text style={styles.destructiveLabel}>Discard</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.secondaryButton, busy && styles.disabled]}
              onPress={handleUnpublish}
              disabled={busy}
            >
              <Text style={styles.secondaryLabel}>Unpublish</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleExport}>
              <Text style={styles.secondaryLabel}>Export</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

async function exportMarkdown(post: BlogPost) {
  try {
    await Share.share({ message: post.content_markdown ?? '' });
  } catch (e) {
    Alert.alert('Could not export', (e as Error).message);
  }
}

async function exportHtml(post: BlogPost) {
  try {
    const html = markdownToHtml(post.content_markdown ?? '');
    const safeName =
      (post.title ?? 'post').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'post';
    const file = new File(Paths.cache, `${safeName}.html`);
    file.create({ overwrite: true });
    file.write(html);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/html', UTI: 'public.html' });
    } else {
      Alert.alert('Sharing unavailable', 'This device cannot open the share sheet.');
    }
  } catch (e) {
    Alert.alert('Could not export', (e as Error).message);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  muted: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.error },
  scroll: { paddingBottom: Spacing.xl },
  hero: { width: '100%', height: 240 },
  content: { padding: Spacing.md },
  statusPill: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.accent,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: Colors.background,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  primaryLabel: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  secondaryButton: {
    flex: 1,
    borderColor: Colors.border,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  secondaryLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  destructiveButton: {
    flex: 1,
    borderColor: Colors.error,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  destructiveLabel: { fontSize: 15, fontWeight: '700', color: Colors.error },
  disabled: { opacity: 0.5 },
});

const markdownStyles = StyleSheet.create({
  body: { color: Colors.textPrimary, fontSize: 16, lineHeight: 26 },
  heading1: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: Spacing.md },
  heading2: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: Spacing.md },
  heading3: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: Spacing.sm },
  image: { borderRadius: BorderRadius.card, marginVertical: Spacing.sm },
  paragraph: { marginTop: 0, marginBottom: Spacing.sm },
});
