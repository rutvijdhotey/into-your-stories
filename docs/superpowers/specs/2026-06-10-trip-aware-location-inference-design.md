# Trip-Aware Location Inference — Design

**Date:** 2026-06-10
**Status:** Approved
**Backlog item:** Priority 0a (re-prioritized 2026-06-10)

## Problem

When a note has no usable photo EXIF location, capture falls back to the device's *current* GPS position at save time. If the user captures or edits a note away from the trip (e.g. writing up a Paris trip from home), the note gets tagged with the device's location — "Mountain View" on a France trip — and its map pin lands on the wrong continent. The launch-time place-name backfill then compounds the error by reverse-geocoding the wrong coordinates into a confidently wrong `place_name`.

Two failure surfaces:

1. **Capture time** — new notes without EXIF location trust device GPS unconditionally.
2. **Existing data** — notes already saved with wrong device-GPS locations (known case: several notes on the France trip).

## Decisions (from brainstorm, 2026-06-10)

| Question | Decision |
|---|---|
| Scope | Capture time **and** a sweep over existing notes |
| Mismatch UX at capture | Silent fallback to the trip-level location; the editable location field remains the escape hatch |
| Trip location reference | `trips.destinations` (geocoded) **plus** the trip's trusted geolocated notes |
| Fallback value when GPS is rejected | Anchor coordinates + reverse-geocoded city/place_name — approximately right rather than precisely wrong |
| Existing-notes sweep UX | Silent, launch-time, modeled on `backfillPlaceNames` |
| Approach | Provenance column + trip anchors (Approach A) |

## Design

### 1. Data model — migration 011

New nullable column on `notes`:

```sql
alter table public.notes
  add column location_source text
  check (location_source in ('gps', 'exif', 'manual', 'inferred'));
```

Meaning:

- `'exif'` — coordinates from photo EXIF GPS (trusted: the photo was there)
- `'gps'` — device GPS, judged plausible for the trip
- `'inferred'` — device GPS rejected; location substituted from the trip anchor
- `'manual'` — typed by the user (capture sheet or edit sheet)
- `null` — legacy rows (all notes existing before this feature) and notes with no location

No `trips` migration — `trips.destinations text[]` (migration 003) already carries the needed signal. Regenerate `src/lib/database.types.ts`.

### 2. Anchor model — `tripAnchorHelpers.ts` (pure, TDD)

A trip's **anchors** are coordinate points the trip is known to be near:

- each entry of `trips.destinations`, forward-geocoded via the existing `geocodeLocation`
- the coordinates of the trip's **trusted** notes — `location_source` `'exif'` or `'manual'` only

Untrusted notes (`'gps'`, `null`) are deliberately excluded as anchors; otherwise existing wrong-location notes would vouch for future wrong GPS fixes at the same place.

Pure functions (no Supabase/native imports, `import type` only):

- `haversineKm(a, b)` — great-circle distance
- `isPlausible(point, anchors)` — true if within `ANCHOR_PLAUSIBLE_KM` of **any** anchor
- `nearestAnchor(point, anchors)` — the anchor used for substitution

`ANCHOR_PLAUSIBLE_KM = 200` — one named, tunable constant. Generous enough for day trips from a base city; tight enough to reject a different continent.

**No anchors → no judgment.** If destination geocoding fails (offline) and the trip has no trusted notes, the anchor list is empty and GPS passes through unchanged. Inference must never block or delay a save beyond the geocode calls already in the flow.

### 3. `tripAnchorService.ts`

`getTripAnchors(tripId): Promise<AnchorPoint[]>` — fetches the trip's `destinations` and trusted-note coordinates, geocodes destinations, returns the combined anchor list. Memoized per trip for the app session (destinations rarely change mid-session); the memo also avoids re-geocoding on every capture.

### 4. Capture flow — `NoteCaptureSheet`

The plausibility check runs **when the GPS fix and the selected trip are both known, not at save time**, so the location pill shows what will actually save:

- Fix arrives / trip changes → if no EXIF location, check `isPlausible(fix, anchors)`.
- Implausible → the *effective auto location* becomes `nearestAnchor` + `reverseGeocodePlace(anchor)`; the pill shows the anchor's city (e.g. "Paris"), and saving writes the anchor coords/city/place_name with `location_source: 'inferred'`.
- Plausible → unchanged behavior, `location_source: 'gps'`.

Untouched paths:

- **EXIF** (photo has GPS): overrides device GPS exactly as today, `location_source: 'exif'`. No plausibility check — the photo was there.
- **Manual edit**: `resolveLocationEdit` semantics unchanged; an edited field wins over everything, `location_source: 'manual'`. Cleared field → all-null location, `location_source: null`.

Plumbing: `location_source` threads through `CreateNoteInput` → `PendingNote` → `trySync`/`drainQueue`, mirroring how `place_name` was added. `NoteEditSheet`'s location edit sets `'manual'` via `UpdateNoteInput`/`updateNote`. AI re-tagging (`mergeTags`) does not touch coordinates and must not change `location_source`.

### 5. Sweep over existing notes — `locationSweepService.ts`

Launch-time service modeled on `backfillPlaceNames` (batches of 5, short delay, idempotent, naturally resumable). Runs from `MainStack` **before** `backfillPlaceNames`, so the backfill never wastes geocodes resolving place names for coordinates the sweep is about to rewrite.

Per trip of the current user:

1. Build anchors (destinations + trusted notes). **No anchors → skip the trip.**
2. Candidates: notes with coordinates and `location_source` `'gps'` or `null`.
3. Any candidate farther than `ANCHOR_PLAUSIBLE_KM` from **every** anchor is rewritten: nearest anchor's coords, reverse-geocoded `city`/`place_name`, `location_source: 'inferred'`.
4. Plausible candidates with `location_source: null` are upgraded to `'gps'` so they leave the candidate set (keeps the sweep cheap on later launches).

`'manual'` and `'exif'` notes are never candidates, by construction.

Idempotency: rewritten notes become `'inferred'` and upgraded notes become `'gps'`-plausible, so repeat launches find nothing to do (an `'inferred'` note sits at an anchor, and `'gps'` notes were already judged plausible at write time — the sweep only queries `'gps'`/`null`; `'gps'` rows are included so a later-added destination or trusted note can still correct them, but in the steady state they are all plausible).

### Accepted risk

A *legacy* (`null`-source) note genuinely captured far off-trip — a layover, a detour — is indistinguishable from a device-GPS mistake and will be "corrected" by the sweep. Recovery: edit the note's location, which marks it `'manual'` permanently. New notes don't have this problem: a deliberate off-trip location is either EXIF-backed or typed, both trusted.

### Error handling

- Geocode failures (offline, no result) degrade to fewer/no anchors → pass-through, never an error surfaced to the user.
- Sweep update failures leave the note untouched; it is retried on the next launch (same contract as the place-name backfill).
- Inference never blocks a save: any anchor-service failure falls back to today's behavior.

## Testing

- **TDD pure helpers** (`tripAnchorHelpers`): haversine known distances, plausibility threshold edges, nearest-anchor selection, empty-anchor pass-through.
- **`tripAnchorService`** (supabase + locationService mocked): destination geocoding, trusted-note filtering, memoization, empty results.
- **`locationSweepService`** (mocked): outlier rewrite, plausible-null upgrade to `'gps'`, manual/exif exclusion, no-anchor trip skip, update-error retry semantics.
- **Capture wiring**: source assignment per path (exif/gps/inferred/manual/cleared), pill shows inferred city before save.
- **On-device QA**: capture on the France trip from home → infers a France anchor, not Mountain View; EXIF photo capture unchanged; manual edit wins and sticks; launch sweep corrects the known wrong France-trip notes.

## Out of scope

- Prompting the user about mismatches (silent by decision; revisit if silent inference misfires in practice)
- A trip-level "home location" column (Approach C, rejected)
- Any change to the EXIF or manual-edit paths beyond recording provenance
