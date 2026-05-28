# Phase 5: Photo Import — Design Spec

**Date:** 2026-05-27  
**Branch:** `phase-5/photo-import`  
**Status:** Approved — ready for implementation plan

---

## Overview

Phase 5 wires the inert 📷 button in `NoteCaptureSheet` to the iOS photo library picker. Users can attach up to 5 photos to any note. Photos are uploaded to Supabase Storage, their URLs stored on the note row, and displayed as thumbnails in the feed and as a grid on the trip detail screen. Claude Vision analysis is deferred to the blog pipeline phase.

---

## Scope

**In:**
- `expo-image-picker` multi-select (up to 5 photos per note)
- EXIF GPS extraction → overrides live location when present
- City reverse-geocoded from EXIF GPS via `expo-location`
- Upload to Supabase Storage (sequential per note save)
- `photo_urls text[]` column on `notes` table
- `PhotoStrip` in `NoteCard` (thumbnails below text, "+N" overflow)
- `PhotoGrid` as `ListHeaderComponent` in `TripFeedScreen`
- Offline guard: disable Save when photos selected + no connectivity

**Out (later phases):**
- Claude Vision analysis / auto-captioning
- Full-screen photo viewer (tap on thumbnail)
- Offline-queued photo upload
- Photo deletion after save
- Photo reordering

---

## Data Model

### Migration 006

```sql
ALTER TABLE notes ADD COLUMN photo_urls text[] NOT NULL DEFAULT '{}';
```

Photos are stored as an ordered array of public Supabase Storage URLs. Bounded at 5 by the client. No join table needed.

### Supabase Storage

- **Bucket:** `photos` (public)
- **Path:** `{userId}/{noteOfflineId}/{index}.jpg`
- **URLs:** permanent public URLs stored directly in `photo_urls` — no signed URL expiry to manage
- Public bucket is acceptable because paths contain UUIDs, making them practically unguessable

---

## New Artifacts

| Artifact | Purpose |
|---|---|
| `supabase/migrations/006_photos.sql` | Add `photo_urls` column |
| `src/services/photoHelpers.ts` | Pure helpers: EXIF DMS → decimal degrees, validate photo count |
| `src/services/photoService.ts` | Upload photo URI → Storage URL; delete photos by URL |
| `src/hooks/usePhotoPicker.ts` | Wrap `expo-image-picker`: permissions, multi-select, EXIF extraction |
| `src/components/PhotoStrip.tsx` | Horizontal thumbnail row for `NoteCard` |
| `src/components/PhotoGrid.tsx` | 3-column photo grid for `TripFeedScreen` header |

---

## Capture Flow (`NoteCaptureSheet`)

1. User taps 📷 → `usePhotoPicker` requests photo library permission (first time only)
2. System multi-select picker opens, limited to 5 images
3. Selected photos render as a 60×60 thumbnail strip above the action row; each has an × to remove
4. **EXIF GPS override:** `photoHelpers` parses GPS DMS arrays from the first photo that has them → decimal degrees. `expo-location.reverseGeocodeAsync` resolves the city. This replaces the live-captured lat/lng/city on the note.
5. **Offline guard:** if `!isConnected && selectedPhotos.length > 0`, Save is disabled; inline message: _"Connect to save with photos"_
6. On Save:
   - Upload photos sequentially to Supabase Storage
   - Collect public URLs
   - If any upload fails: Alert with "Save without photos" / "Cancel" options
   - On success: pass `photo_urls` array to `createNote`, close sheet

---

## `photoHelpers.ts` (pure, TDD)

```
parseDMS(dms: number[], ref: 'N'|'S'|'E'|'W'): number
  – converts EXIF DMS array to signed decimal degrees

extractExifLocation(exif: Record<string, unknown>): { lat: number; lng: number } | null
  – reads GPS fields from expo-image-picker EXIF object; returns null if absent/invalid

validatePhotoCount(count: number): boolean
  – returns true if count <= 5
```

---

## `photoService.ts`

```
uploadPhoto(userId: string, noteOfflineId: string, index: number, uri: string): Promise<string>
  – uploads compressed JPEG to photos/{userId}/{noteOfflineId}/{index}.jpg
  – returns public URL

deletePhotos(urls: string[]): Promise<void>
  – deletes storage objects for given URLs (best-effort, no throw on partial failure)
```

---

## `usePhotoPicker` Hook

```
{
  photos: PickedPhoto[]       // uri, width, height, exifLocation
  pick: () => Promise<void>   // opens picker; handles permission denied gracefully
  remove: (index: number) => void
  clear: () => void
}
```

- Calls `ImagePicker.launchImageLibraryAsync` with `allowsMultipleSelection: true`, `selectionLimit: 5`, `exif: true`, `quality: 0.7`
- On permission denied: shows Alert ("Photo access required — go to Settings")
- Extracts EXIF GPS via `photoHelpers.extractExifLocation`

---

## Display

### `PhotoStrip` (in `NoteCard`)

- Renders when `note.photo_urls.length > 0`
- Horizontal `ScrollView`, thumbnails 72×72, `borderRadius: 8`, `resizeMode: cover`
- If `photo_urls.length > 3`: first 2 thumbnails shown normally, 3rd gets a dark overlay with "+N" label
- Sits below note text, above the card bottom edge

### `PhotoGrid` (in `TripFeedScreen`)

- `ListHeaderComponent` of the existing `FlatList`
- Collects all `photo_urls` from all notes in the trip (flattened array)
- 3-column grid, each cell = `(screenWidth - margins) / 3`, square, `resizeMode: cover`, 2px gap
- Hidden (null header) when no notes have photos
- No tap action in Phase 5

---

## `noteService` Changes

`createNote` gains an optional `photo_urls?: string[]` parameter (defaults to `[]`). The offline queue payload type (`PendingNote`) does not carry photos — offline notes are text-only.

---

## `NoteCard` / `useNotes` Changes

- `photo_urls` arrives automatically once `database.types.ts` is regenerated — no hook changes
- `NoteCard` checks `note.photo_urls.length > 0` → renders `<PhotoStrip urls={note.photo_urls} />`
- Pending notes (offline queue) never have photos; `PendingNoteCard` unchanged

---

## Testing Strategy

**Unit tests (TDD):**
- `photoHelpers` — DMS parsing (all quadrants), invalid EXIF returns null, count validation
- `photoService` — upload happy path, upload error, deletePhotos best-effort
- `usePhotoPicker` — permission denied, selection, EXIF extraction, remove, clear

**Manual verification:**
- Pick 1 photo → thumbnail appears in capture sheet; EXIF GPS overrides location pill
- Pick 5 photos → all 5 previews shown, picker won't allow 6th
- Remove a photo via × → strip updates
- Save → note appears in feed with PhotoStrip
- TripFeedScreen shows PhotoGrid header after at least one photo note exists
- Go offline → photo + connectivity banner → Save disabled

---

## Key Decisions

- **Public bucket with UUID paths** — no expiry management, simpler URL storage. Revisit if privacy requirements tighten.
- **Sequential upload** — simpler error handling on mobile; 5 photos at ~200KB each is fast enough.
- **EXIF overrides live GPS** — user took the photo at that location; it's more accurate than the GPS captured at tap time.
- **No tap-to-view in Phase 5** — full-screen viewer deferred; thumbnails are read-only.
- **Offline blocks photo save** — queuing photo uploads is a more complex problem deferred to a later phase.
