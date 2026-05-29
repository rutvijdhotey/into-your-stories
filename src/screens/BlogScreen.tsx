import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/types';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { useTrips } from '../hooks/useTrips';
import { splitByStatus, formatDateRange } from '../services/tripHelpers';
import { generateBlog } from '../services/blogService';
import BlogPostCard from '../components/BlogPostCard';

type Nav = NativeStackNavigationProp<MainStackParamList, 'Tabs'>;

export default function BlogScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const userId = session?.user.id;

  const { posts, loading } = useBlogPosts(userId);
  const { trips } = useTrips(userId);
  const completed = splitByStatus(trips).completed;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const drafts = posts.filter((p) => p.status !== 'published');
  const published = posts.filter((p) => p.status === 'published');

  const openPost = (postId: string) => navigation.navigate('BlogPost', { postId });

  const handlePickTrip = async (tripId: string) => {
    if (!userId) return;
    setPickerOpen(false);
    setGenerating(true);
    try {
      const id = await generateBlog(tripId, userId);
      if (id) {
        openPost(id);
      } else {
        Alert.alert('Could not start generation', 'Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePress = () => {
    if (completed.length === 0) {
      Alert.alert('No completed trips', 'End a trip first, then generate its blog.');
      return;
    }
    setPickerOpen(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>BLOG</Text>
        <Text style={styles.heading}>Your Stories</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>DRAFTS</Text>
            {drafts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No drafts yet</Text>
              </View>
            ) : (
              drafts.map((p) => <BlogPostCard key={p.id} post={p} onPress={() => openPost(p.id)} />)
            )}

            <Text style={styles.sectionLabel}>PUBLISHED</Text>
            {published.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>Nothing published yet</Text>
              </View>
            ) : (
              published.map((p) => (
                <BlogPostCard key={p.id} post={p} onPress={() => openPost(p.id)} />
              ))
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={[styles.generateButton, generating && styles.disabled]}
          onPress={handleGeneratePress}
          disabled={generating}
        >
          <Text style={styles.generateButtonLabel}>
            {generating ? 'Starting…' : 'Generate Blog'}
          </Text>
        </Pressable>
      </View>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Choose a completed trip</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {completed.map((t) => (
                <Pressable key={t.id} style={styles.tripRow} onPress={() => handlePickTrip(t.id)}>
                  <Text style={styles.tripName}>{t.name}</Text>
                  <Text style={styles.tripDates}>{formatDateRange(t.start_date, t.end_date)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heading: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  sectionLabel: {
    ...Typography.label,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  emptyCardText: { fontSize: 14, color: Colors.textTertiary },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  generateButton: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  generateButtonLabel: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  disabled: { opacity: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.sheet,
    borderTopRightRadius: BorderRadius.sheet,
    padding: Spacing.lg,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  tripRow: {
    paddingVertical: Spacing.md,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tripName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  tripDates: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
