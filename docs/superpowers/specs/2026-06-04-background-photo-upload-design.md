# Background Photo Upload + Offline Photo Capture

**Date:** 2026-06-04  
**Status:** Approved for implementation

## Problem

Photos upload synchronously before the note row saves in `NoteCaptureSheet.handleSave`, blocking the UI until all uploads finish. If the user is offline, `photosBlockSave` prevents saving at all. Notes with photos cannot be captured offline.

## Approach

Two parallel queues: the existing `offlineQueue` (notes) and a new `photoUploadQueue` (photo uploads). Notes save instantly; photos drain in the background. Mirrors the `drainQueue` / `drainTagging` pattern already in use.

---

## Data Model

### `PendingNote` (offlineQueue.ts)

Add `photo_uris: string[]` — local `file://` paths from the device. Enables `PendingNoteCard` to display real images before the note syncs to Supabase.

### `PendingPhotoUpload` (new: photoUploadQueue.ts)

```typescript
type PendingPhotoUpload = {
  id: string;               // queue item UUID
  offline_note_id?: string; // new notes: match by notes.offline_id after sync
  note_db_id?: string;      // edits: match by notes.id
  user_id: string;
  index: number;
  local_uri: string;
  attempts: number;         // capped at 5
  status: 'pending' | 'failed';
};
```

`notes.photo_urls` already exists as `string[]` — no DB migration. Notes sync with `photo_urls: []`; the photo drain patches CDN URLs in, which Supabase realtime pushes back to the feed.

`photoUploadQueue.ts` exports: `enqueuePhotos`, `peekAllPhotos`, `removePhotosByKey`, `updatePhotoAttempt`, `subscribe` — same shape as `offlineQueue.ts`.

---

## Background Drain Lifecycle

All drain call sites switch to a single `drainAll()` helper in `noteService.ts`:

```
drainQueue() → drainPhotoUploads() → drainTagging()
```

Order is required: note rows must exist in Supabase before the photo drain patches them.

**Three triggers:**

1. **On reconnect** — `useOnReconnect` (existing) calls `drainAll()`
2. **App foreground** — `AppState` `'active'` event calls `drainAll()` (catches interrupted uploads after phone lock)
3. **After immediate `trySync`** — on the happy path (online capture), chain into `drainAll()` inline

**`drainPhotoUploads` logic:**
1. Read all `pending` items from photo upload queue
2. For each item: attempt `uploadPhoto(userId, noteKey, index, localUri)`
3. On success: mark item resolved (remove from queue)
4. On failure: increment `attempts`; if `attempts >= 5` mark `status: 'failed'`
5. After processing all items, group by note key — for any note where all items are now resolved or `failed`, patch the note: `UPDATE notes SET photo_urls = [succeededCdnUrls] WHERE offline_id = X` (or `WHERE id = X`). Failed items contribute no URL; their photos are silently absent from the note.
6. `photoStatus` on a note is `'uploading'` while any item for that note is `pending`; `'failed'` once all items are resolved and at least one is `failed` with zero `pending` remaining; `null` once all are resolved successfully.

---

## Capture Flow (`NoteCaptureSheet`)

`handleSave` loses ~40 lines. Removed entirely:
- Photo upload loop
- `Alert.alert('Upload failed')` + partial cleanup
- `photosBlockSave` state + "Connect to save with photos" warning
- The offline guard on Save button

New `handleSave`:
1. Validate content
2. `createNote({ ..., photo_uris: photos.map(p => p.uri) })`
3. Close sheet

`createNote` enqueues the note (with `photo_uris`), enqueues photo uploads, fires `void drainAll()`.

---

## Edit Flow (`NoteEditSheet`)

- `deletePhotos(removedUrls)` stays synchronous (storage delete, not a UI bottleneck)
- New photos are enqueued to `photoUploadQueue` with `note_db_id: note.id`
- `updateNote` is called with `existingUrls` only (new ones patched in after upload)
- Sheet closes after `updateNote` returns — no waiting on uploads

---

## Feed Display

`FeedItem` extended:

```typescript
type FeedItem =
  | { kind: 'note'; note: Note; photoStatus: 'uploading' | 'failed' | null }
  | { kind: 'pending'; pending: PendingNote }
```

`useNotes` subscribes to `photoUploadQueue` (new `subscribe` export) and derives `photoStatus` per note by matching `offline_id` / `id` against queue items.

`NoteCard` rendering:

| State | Display |
|-------|---------|
| `kind: 'pending'` with `photo_uris` | `PhotoStrip` with local `file://` URIs — real images, no placeholder |
| `kind: 'note'`, `photoStatus: 'uploading'` | Shimmer strip (reuses `ShimmerBadge` animation style) |
| `kind: 'note'`, `photoStatus: 'failed'` | `⚠ 1 photo failed` in meta row, `Colors.error` style |
| `kind: 'note'`, `photoStatus: null` | Unchanged — `PhotoStrip` with CDN URLs as today |

---

## Files Changed

| File | Change |
|------|--------|
| `src/services/offlineQueue.ts` | Add `photo_uris: string[]` to `PendingNote` |
| `src/services/photoUploadQueue.ts` | **New** — queue CRUD + subscribe |
| `src/services/photoUploadService.ts` | **New** — `drainPhotoUploads()` |
| `src/services/noteService.ts` | Accept `photo_uris`, call `enqueuePhotos`, expose `drainAll()` |
| `src/hooks/useNotes.ts` | Subscribe to photo queue, derive `photoStatus`, extend `FeedItem` |
| `src/hooks/useAppDrainer.ts` | **New** — `AppState` listener calling `drainAll()`; mounted once in `AppNavigator.tsx` |
| `src/components/NoteCard.tsx` | Render shimmer strip and failure indicator |
| `src/components/NoteCaptureSheet.tsx` | Remove upload logic, remove offline guard |
| `src/components/NoteEditSheet.tsx` | Enqueue uploads, close after `updateNote` |

---

## Out of Scope

- Retry UI / manual re-trigger for failed uploads (user can re-edit the note)
- Progress percentage per photo
- Upload cancellation
