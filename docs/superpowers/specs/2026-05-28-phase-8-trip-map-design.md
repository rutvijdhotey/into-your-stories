# Phase 8 — Trip Map Tab — Design

**App:** Into Your Stories
**Date:** 2026-05-28
**Status:** Implemented ✅ — automated tests + type-check green, on-device QA passed 2026-05-28
**Branch:** `phase-8/trip-map`

> Supersedes the stale `docs/superpowers/plans/plan-07-maps-places.md`, which assumed a
> separate `places` table from a vision pipeline that was never built and bundled a Personal
> Destinations screen. The real data source is `notes` rows that carry `lat`/`lng`/`category`/
> `place_name`/`city` (written directly by Phase 7 smart tagging). Personal Destinations is
> deferred to its own later phase.

---

## Goal

Make the **Map tab** in Trip Detail functional: show a trip's located notes as
category-colored pins on Apple Maps, filterable by category, with a tap-through to edit each
note. No new tables — the map reads existing `notes`.

After this phase: a user can open a trip, switch to the Map tab, and spatially review every
note they captured with a location.

---

## Scope

**In:** Trip Detail Map tab only.

**Out (YAGNI):**
- Personal Destinations screen (own later phase)
- Community aggregated map (belongs to the Explore phase)
- Custom marker artwork (use standard tinted pins)
- Trip-city geocoding / centering fallback when no notes have coordinates

---

## Data Reality

Notes already carry everything the map needs (`src/lib/database.types.ts`):

| Column | Use |
|---|---|
| `lat`, `lng` (`number \| null`) | pin coordinates; null → note has no location |
| `category` (`string \| null`) | pin color + filter |
| `place_name` (`string \| null`) | callout title |
| `content` (`string`) | callout snippet (first ~80 chars) |

Most notes will **not** have coordinates (text-only capture, no GPS/EXIF). Only located notes
become pins; the rest are surfaced via a count banner so the map is never silently incomplete.

---

## Architecture — Three Thin Layers

### 1. Pure helpers — `src/services/mapHelpers.ts` (TDD, the testable core)

All map logic that does not require the native `MapView` lives here as plain functions so it
can be unit-tested without rendering a map.

```ts
export type MapPin = {
  id: string;            // note id
  lat: number;
  lng: number;
  category: Category | null;
  place_name: string | null;
  content: string;
  note: Note;            // full note, passed to NoteEditSheet on callout press
};

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};
```

Functions:

- `toPins(items: FeedItem[]): MapPin[]`
  Keep `kind === 'note'` items whose `lat` **and** `lng` are non-null; project to `MapPin`.
  (`FeedItem` is the union already exported by `useNotes`. `pending` items are skipped — they
  have no server coordinates yet.)

- `countWithoutLocation(items: FeedItem[]): number`
  Count `kind === 'note'` items missing `lat` or `lng`. Drives the banner text.

- `filterPins(pins: MapPin[], category: Category | null): MapPin[]`
  `null` → return all (the "All" state). Otherwise keep pins whose `category` matches.

- `regionForPins(pins: MapPin[]): Region | null`
  - `[]` → `null` (caller shows the empty state).
  - 1 pin → center on it with a sensible default delta (e.g. `0.02`).
  - many → bounding box of min/max lat/lng, center at the midpoint, deltas = span × padding
    factor (e.g. `1.4`), clamped to a minimum delta so two near-identical points aren't
    over-zoomed.

- `pinColor(category: Category | null): string`
  Read the existing `CategoryColors` map from `src/theme` so pins match the category badges
  used everywhere else. Null/unknown category → the `general` color.

### 2. `TripMapScreen` — rewrite, now takes `{ tripId }`

```tsx
type Props = { tripId: string };
```

- `const { items, loading, error } = useNotes(tripId)` — same hook the feed uses, so the map
  updates live (Realtime UPDATE swaps a note's coordinates/category in place).
- Local state: `filter: Category | null` (default `null` = All), `editingNote: Note | null`.
- Derive (memoized): `pins = toPins(items)`, `filtered = filterPins(pins, filter)`,
  `region = regionForPins(filtered)`, `noLocationCount = countWithoutLocation(items)`.

Render, top → bottom:

1. **Filter row** — reuse `CategoryPicker` **as-is**. Its `value: Category | null` /
   `onChange` API maps exactly onto filtering: `null` shows all pins; selecting a category
   filters to it; tapping the selected pill again clears back to All. No new component, no
   explicit "All" pill.

2. **Map** — `MapView` from `react-native-maps`:
   - `provider={PROVIDER_DEFAULT}` → Apple Maps on iOS (free, no API key).
   - `userInterfaceStyle="dark"` to match the `#111111` app aesthetic.
   - `region` from `regionForPins(filtered)`.
   - One `<Marker>` per `filtered` pin: `coordinate={{ latitude, longitude }}`,
     `pinColor={pinColor(category)}`.
   - Each marker wraps a `<Callout>` showing **place name** (bold; fall back to category
     label or "Note" when null), a colored **category badge**, and a **content snippet**
     (first ~80 chars). `onCalloutPress={() => setEditingNote(pin.note)}`.

3. **No-location banner** — when `noLocationCount > 0`, a subtle banner:
   `"{n} note(s) without a location"`. Honest signal that the map isn't the full picture.

4. **Empty state** — when `region === null` (no located notes): a centered friendly message
   instead of a blank map, e.g. "Places appear here as you capture notes with locations."
   (Still show the no-location banner if applicable.)

5. **`NoteEditSheet`** — reused exactly as `TripFeedScreen` wires it:
   ```tsx
   {editingNote && (
     <NoteEditSheet
       note={editingNote}
       visible
       onClose={() => setEditingNote(null)}
       onDeleted={() => setEditingNote(null)}
     />
   )}
   ```

Loading / error states mirror `TripFeedScreen` (spinner / error text).

### 3. Wiring

- `src/screens/trip/TripDetailScreen.tsx` (~line 123): pass the trip id —
  `{tab === 'feed' ? <TripFeedScreen tripId={tripId} /> : <TripMapScreen tripId={tripId} />}`.
  The Map tab is mounted only when active, so `MapView` is created only on demand.

---

## Dependency / Native Build

- `npx expo install react-native-maps` (use `--legacy-peer-deps` if npm peer-dep conflict
  recurs, per prior phases).
- Add the `react-native-maps` Expo config plugin to `app.json` **only if** the install
  requires it. Apple Maps needs **no API key**.
- Rebuild with `npm run ios` — uses the existing `scripts/patch-ios-pbxproj.js` patches.
  **Never** run raw `pod install` or `expo prebuild --clean`; use `npm run pods` /
  `npm run prebuild:clean` if needed (they re-apply the 5 pbxproj patches).
- iOS deployment target stays 16.4.

---

## Testing

**Automated (TDD):** unit tests for every `mapHelpers` function:
- `toPins` — filters out pending items and notes without coordinates; projects fields.
- `countWithoutLocation` — counts note-items missing `lat`/`lng`; ignores pending.
- `filterPins` — `null` returns all; category returns only matches.
- `regionForPins` — `[]` → null; single pin → centered default delta; multi → bounding box
  with padding and a minimum-delta clamp.
- `pinColor` — known categories map to `CategoryColors`; null → general.

**Manual (device):**
- Map renders with dark style, centered on the trip's located notes.
- Pins colored per category; tapping shows callout (name + badge + snippet).
- Tapping a callout opens `NoteEditSheet` for that note; edits/deletes reflect live.
- Filter row hides/shows pins; clearing returns to all.
- No-location banner shows the correct count.
- Empty state shows when a trip has no located notes.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Scope | Trip Map tab only | Tightest shippable unit; Destinations is independent |
| Data source | Existing `notes` (`lat`/`lng`) | No `places` table exists; Phase 7 tags notes directly |
| Map provider | Apple Maps (`PROVIDER_DEFAULT`) | Free, no API key, native iOS look |
| Map style | Dark (`userInterfaceStyle="dark"`) | Matches app aesthetic |
| Filter component | Reuse `CategoryPicker`, `null` = All | Existing API fits filtering exactly; no new code |
| Pin colors | Standard tinted pins via `CategoryColors` | Matches badges; avoids custom marker artwork |
| Notes without location | Count banner | Honest about an incomplete map without clutter |
| Pin tap | Callout → open `NoteEditSheet` | Reuses Phase 6; map isn't a dead end |
| Map logic | Pure `mapHelpers` + thin view | Region/filter/projection unit-testable without native maps |
