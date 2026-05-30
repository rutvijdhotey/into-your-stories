# Trip cover photo (banner image) — Design

**Date:** 2026-05-30
**Status:** Approved, ready for implementation plan

## Problem

The trip detail banner (`TripDetailScreen.tsx`) renders only a deterministic
placeholder gradient via `getTripGradient(trip.name)`. The `trips.cover_photo_url`
column already exists in the schema but nothing reads or writes it. Users want to
set a real photo as the trip's banner.

## Decisions

- **Source:** the user picks a photo from their device library (a free pick — the
  photo need not already be attached to a trip note).
- **Trigger:** a small edit icon pinned to the banner (not a whole-banner tap,
  which would conflict with the existing End Trip / Generate Blog button).
- **Crop:** crop to the banner shape. See the iOS limitation below.
- **Manage:** tapping the icon opens an action menu — "Choose photo" / "Remove
  cover" (revert to gradient) / "Cancel". "Remove cover" only appears when a cover
  is set.
- **Trip status:** the edit icon is available on both active and completed trips.

### iOS crop limitation

`expo-image-picker`'s `allowsEditing: true` forces a **square** crop on iOS and
ignores a custom `aspect` ratio (aspect is Android-only). Since this app ships to
an iPhone, "crop to banner shape" in practice means: the user frames a square crop,
and we render it into the 160pt banner with `resizeMode="cover"` (the banner shows
the horizontal middle band of the square). True banner-ratio cropping would require
a custom crop UI (`expo-image-manipulator`), which is heavier than this item
warrants and is explicitly out of scope.

## Architecture (Approach A — `useCoverPhoto` hook)

A small hook owns the whole flow; `TripDetailScreen` stays thin.

```
TripDetailScreen (thin)
  ├─ edit icon (Pressable, top-right of banner, above scrim)
  │     └─ onPress → action menu (Alert):
  │            • "Choose photo"  → useCoverPhoto.setCover()
  │            • "Remove cover"  → useCoverPhoto.removeCover()   [only if cover set]
  │            • "Cancel"
  ├─ banner background:
  │     trip.cover_photo_url
  │        ? <Image source={{uri}} style={absoluteFill} resizeMode="cover" />
  │        : <LinearGradient ... />
  │     (dark scrim + text overlay unchanged in both cases)
  └─ busy ? <ActivityIndicator> overlay on banner (edit icon disabled)

useCoverPhoto(trip)  ── owns the flow ──
  setCover():    ensureMediaLibraryPermission → launchImageLibraryAsync(single, crop)
                 → uploadCoverPhoto → updateCoverPhoto(url)
  removeCover(): updateCoverPhoto(null) → best-effort deletePhotos([oldUrl])
  busy:          true during upload/save
```

Banner refresh is **free**: `useTripDetail` already subscribes to `trips` row
changes, so once `updateCoverPhoto` writes the column the `<Image>` re-renders
automatically. No manual state plumbing in the screen.

## Components & units

### `src/hooks/useCoverPhoto.ts` (new)

`useCoverPhoto(trip: Trip)` returns `{ setCover, removeCover, busy }`.

- `setCover()`:
  1. `ensureMediaLibraryPermission()` — on denial, Alert + return (no upload).
  2. `launchImageLibraryAsync({ allowsMultipleSelection: false, allowsEditing: true,
     quality: 0.7, mediaTypes: ['images'] })`. On `canceled`, no-op.
  3. `busy = true`; `uploadCoverPhoto(userId, trip.id, uri)` →
     `updateCoverPhoto(trip.id, url)`.
  4. On error: `Alert.alert('Could not update cover', message)`. Cover unchanged.
  5. `busy = false` in `finally`.
- `removeCover()`: `updateCoverPhoto(trip.id, null)`, then best-effort
  `deletePhotos([trip.cover_photo_url])` (fire-and-forget; DB-null is source of truth).

### `src/services/photoService.ts` (extend)

- Extract the existing fetch → arrayBuffer → upload → getPublicUrl body of
  `uploadPhoto` into a private `uploadToBucket(path, uri): Promise<string>` helper;
  `uploadPhoto` delegates to it (no behaviour change).
- `uploadCoverPhoto(userId, tripId, uri): Promise<string>`
  - Path: `${userId}/trip-covers/${tripId}.jpg`, `upsert: true`.
  - Returns the public URL with a `?v=${Date.now()}` cache-buster appended.
  - **Cache-busting rationale:** replacing reuses the same path, so the public URL
    is byte-identical and RN `<Image>` would show the stale cached image; the query
    param defeats the cache. Fixed path + upsert means no orphan files accumulate.
- `deletePhotos` — strip any `?...` query suffix before computing the storage path,
  so cache-busted cover URLs resolve to the correct object. Defensive fix; benefits
  all callers.

### `src/services/tripService.ts` (extend)

- `updateCoverPhoto(tripId: string, url: string | null): Promise<void>` —
  `supabase.from('trips').update({ cover_photo_url: url }).eq('id', tripId)`.
  No migration (column exists).

### `src/services/photoHelpers.ts` (extend)

- `ensureMediaLibraryPermission(): Promise<boolean>` — request permission; on
  denial, `Alert` pointing to Settings and return `false`. Both `usePhotoPicker`
  and `useCoverPhoto` use it (removes duplicated Alert logic).

### `src/screens/trip/TripDetailScreen.tsx` (modify)

- Render `<Image>` when `trip.cover_photo_url` is set, else the gradient (scrim +
  text overlay unchanged).
- Add the edit icon (small semi-transparent circular button, camera/pencil glyph,
  top-right of the banner, with hit-slop), wired to an `Alert` action menu.
- Show an `ActivityIndicator` overlay while `busy`; disable the icon while busy.

## Error & edge handling

- Permission denied → Alert, no upload/DB write.
- Picker cancelled → no-op.
- Upload or DB error → Alert; `busy` cleared; cover unchanged.
- Remove → DB set to null is authoritative; storage delete is best-effort.

## Testing

Follows existing Jest patterns (`src/**/__tests__`, mocked Supabase / ImagePicker).

- `uploadCoverPhoto` — builds `userId/trip-covers/tripId.jpg`, uploads with
  `upsert`, returns a URL with a `?v=` cache-buster.
- `deletePhotos` — a URL with a `?v=…` suffix resolves to the correct storage path
  (query stripped).
- `updateCoverPhoto` — writes `cover_photo_url` (and `null` on remove) filtered by
  trip id.
- `useCoverPhoto` — (a) denied permission → Alert, no upload/DB call; (b) success →
  upload → `updateCoverPhoto(url)`, `busy` true→false; (c) cancelled pick → no-op;
  (d) `removeCover` → `updateCoverPhoto(null)` + best-effort delete; (e) upload
  failure → Alert, cover unchanged.
- `TripDetailScreen` conditional render (Image vs gradient) is light glue — leans on
  existing screen-test conventions rather than over-testing JSX.

## Out of scope

- Custom banner-ratio crop UI (`expo-image-manipulator`).
- Auto-selecting the first trip-note photo as a default cover.
- Choosing the cover from photos already attached to trip notes (free library pick
  only).
