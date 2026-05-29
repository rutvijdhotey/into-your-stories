# Phase 6 — Note Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can tap any saved note to edit its text, category, and photos — and delete notes entirely.

**Architecture:** A `NoteEditSheet` modal mirrors `NoteCaptureSheet` but pre-populates from an existing note. `NoteCard` gains a `Pressable` wrapper with an `onPress` prop. `TripFeedScreen` manages `editingNote` state and renders the sheet. Two new service functions (`updateNote`, `deleteNote`) handle Supabase writes.

**Tech Stack:** React Native, Expo, Supabase JS client, `usePhotoPicker` hook, `expo-image-picker`

---

## File Map

| Action | File |
|---|---|
| Create | `src/components/NoteEditSheet.tsx` |
| Modify | `src/components/NoteCard.tsx` |
| Modify | `src/screens/trip/TripFeedScreen.tsx` |
| Modify | `src/services/noteService.ts` |

---

### Task 1: Add `updateNote` and `deleteNote` to noteService

**Files:**
- Modify: `src/services/noteService.ts`

- [ ] **Step 1: Add `updateNote` function**

Open `src/services/noteService.ts` and append after the `drainQueue` function:

```typescript
export type UpdateNoteInput = {
  content: string;
  category: Category | null;
  photo_urls: string[];
};

export async function updateNote(id: string, patch: UpdateNoteInput): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({
      content: patch.content,
      category: patch.category,
      photo_urls: patch.photo_urls,
      tagging_status: 'pending',
    })
    .eq('id', id);

  if (error) throw error;
}
```

Also add `Category` to the import from `'./noteHelpers'` at the top of the file (it's already imported — verify it's present, add if missing).

- [ ] **Step 2: Add `deleteNote` function**

Append after `updateNote`:

```typescript
export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/noteService.ts
git commit -m "feat(phase-6): add updateNote and deleteNote to noteService"
```

---

### Task 2: Create `NoteEditSheet` component

**Files:**
- Create: `src/components/NoteEditSheet.tsx`

- [ ] **Step 1: Create the file**

```typescript
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
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { uploadPhoto, deletePhotos } from '../services/photoService';
import { updateNote, deleteNote } from '../services/noteService';
import { validateContent, type Category, type Note } from '../services/noteHelpers';
import { usePhotoPicker } from '../hooks/usePhotoPicker';
import CategoryPicker from './CategoryPicker';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  note: Note;
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

export default function NoteEditSheet({ note, visible, onClose, onDeleted }: Props) {
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState<Category | null>(note.category);
  // existingUrls: photos already on the note; removedUrls: staged for deletion on Save
  const [existingUrls, setExistingUrls] = useState<string[]>(note.photo_urls);
  const [removedUrls, setRemovedUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const photoPicker = usePhotoPicker();

  // Reset local state each time the sheet opens for a (potentially different) note
  const handleShow = () => {
    setContent(note.content);
    setCategory(note.category);
    setExistingUrls(note.photo_urls);
    setRemovedUrls([]);
    photoPicker.clear();
  };

  const handleRemoveExisting = (url: string) => {
    setExistingUrls((prev) => prev.filter((u) => u !== url));
    setRemovedUrls((prev) => [...prev, url]);
  };

  const canSave = !saving && validateContent(content).ok;

  const handleSave = async () => {
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
      // 1. Upload new photos
      const newUrls: string[] = [];
      const tempId = Crypto.randomUUID();
      for (let i = 0; i < photoPicker.photos.length; i++) {
        const url = await uploadPhoto(note.user_id, tempId, i, photoPicker.photos[i].uri);
        newUrls.push(url);
      }

      // 2. Delete removed photos from Storage
      if (removedUrls.length > 0) {
        await deletePhotos(removedUrls);
      }

      // 3. Update note record
      const finalUrls = [...existingUrls, ...newUrls];
      await updateNote(note.id, {
        content: validation.value,
        category,
        photo_urls: finalUrls,
      });

      photoPicker.clear();
      onClose();
    } catch (e) {
      Alert.alert('Could not save note', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete note?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Best-effort delete all photos from Storage
              const allUrls = [...existingUrls, ...removedUrls, ...note.photo_urls];
              const uniqueUrls = [...new Set(allUrls)];
              if (uniqueUrls.length > 0) await deletePhotos(uniqueUrls);
              await deleteNote(note.id);
              onDeleted();
            } catch (e) {
              Alert.alert('Could not delete note', (e as Error).message);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
      onShow={handleShow}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Edit Note</Text>
          <Pressable onPress={onClose} style={styles.cancelButton} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          autoFocus={false}
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        {/* Existing photos with delete badges */}
        {(existingUrls.length > 0 || photoPicker.photos.length > 0) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.previewStrip}
            contentContainerStyle={styles.previewStripContent}
          >
            {existingUrls.map((url) => (
              <View key={url} style={styles.thumbContainer}>
                <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => handleRemoveExisting(url)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))}
            {photoPicker.photos.map((photo, index) => (
              <View key={photo.uri} style={styles.thumbContainer}>
                <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => photoPicker.remove(index)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        <Pressable
          onPress={photoPicker.pick}
          accessibilityRole="button"
          accessibilityLabel="Add photos"
          style={styles.addPhotosButton}
        >
          <Text style={styles.addPhotosEmoji}>📷</Text>
          <Text style={styles.addPhotosLabel}>Add photos</Text>
        </Pressable>

        <View style={styles.actionRow}>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color={Colors.background} size="small" />
            ) : (
              <Text style={styles.saveLabel}>Save</Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={handleDelete} style={styles.deleteButton} accessibilityRole="button">
          <Text style={styles.deleteLabel}>Delete Note</Text>
        </Pressable>
      </KeyboardAvoidingView>
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
  input: {
    fontSize: 16,
    color: Colors.textPrimary,
    flex: 1,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
  },
  previewStrip: { maxHeight: 76 },
  previewStripContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    gap: 8,
  },
  thumbContainer: { position: 'relative' },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  removeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 14, lineHeight: 16, fontWeight: '700' },
  addPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: 8,
  },
  addPhotosEmoji: { fontSize: 18 },
  addPhotosLabel: { fontSize: 14, color: Colors.textSecondary },
  actionRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveLabel: { fontSize: 16, color: Colors.background, fontWeight: '800' },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  deleteLabel: { fontSize: 15, color: Colors.error },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NoteEditSheet.tsx
git commit -m "feat(phase-6): add NoteEditSheet component"
```

---

### Task 3: Make `NoteCard` tappable

**Files:**
- Modify: `src/components/NoteCard.tsx`

- [ ] **Step 1: Add `onPress` prop to `NoteCard` and wrap `ServerNoteCard` in `Pressable`**

Replace the entire contents of `src/components/NoteCard.tsx` with:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NoteCard.tsx
git commit -m "feat(phase-6): make NoteCard tappable with onPressNote prop"
```

---

### Task 4: Wire `NoteEditSheet` into `TripFeedScreen`

**Files:**
- Modify: `src/screens/trip/TripFeedScreen.tsx`

- [ ] **Step 1: Replace the entire file contents**

```typescript
import { useState } from 'react';
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNotes } from '../../hooks/useNotes';
import NoteCard from '../../components/NoteCard';
import NoteEditSheet from '../../components/NoteEditSheet';
import PhotoStrip from '../../components/PhotoStrip';
import { Colors, Spacing, Typography } from '../../theme';
import type { Note } from '../../services/noteHelpers';

type Props = { tripId: string };

export default function TripFeedScreen({ tripId }: Props) {
  const { items, loading, error } = useNotes(tripId);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

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
    <>
      <FlatList
        data={items}
        keyExtractor={(item) =>
          item.kind === 'note' ? `note:${item.note.id}` : `pending:${item.pending.offline_id}`
        }
        renderItem={({ item }) => (
          <NoteCard
            item={item}
            onPressNote={(note) => setEditingNote(note)}
          />
        )}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<PhotoStrip urls={allPhotoUrls} />}
      />

      {editingNote && (
        <NoteEditSheet
          note={editingNote}
          visible={true}
          onClose={() => setEditingNote(null)}
          onDeleted={() => setEditingNote(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  list: { paddingTop: Spacing.md, paddingBottom: 96 },
  emptyTitle: { ...Typography.heading, color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyBody: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  error: { ...Typography.body, color: Colors.error, textAlign: 'center' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/trip/TripFeedScreen.tsx
git commit -m "feat(phase-6): wire NoteEditSheet into TripFeedScreen"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the app**

```bash
npx expo start
```

Open in Expo Go (iOS simulator or device).

- [ ] **Step 2: Verify edit flow**

1. Open a trip with at least one note.
2. Tap the note — the edit sheet should slide up pre-populated with the note's text, category, and photos.
3. Change the text, tap Save — the feed should update immediately with the new content.
4. Tap a note again — change the category, tap Save — category badge should reflect the change.

- [ ] **Step 3: Verify photo deletion**

1. Tap a note that has photos.
2. Tap × on a photo — it should disappear from the thumbnail strip.
3. Tap Save — the photo should be gone from the note card in the feed.

- [ ] **Step 4: Verify photo addition**

1. Tap a note, tap "Add photos", pick a photo from the camera roll.
2. The thumbnail should appear in the strip.
3. Tap Save — the new photo should appear in the note card's photo strip.

- [ ] **Step 5: Verify note deletion**

1. Tap a note, tap "Delete Note".
2. Confirm the alert — the sheet should dismiss and the note should be gone from the feed.

- [ ] **Step 6: Verify cancel**

1. Tap a note, make changes (including removing a photo).
2. Tap Cancel — the feed should be unchanged; the photo should still be there.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat(phase-6): note editing complete — edit text, category, photos; delete notes"
```
