# Phase 8 — Trip Map Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Map tab in Trip Detail functional — show a trip's located notes as category-colored Apple Maps pins, filterable by category, each tapping through to edit the note.

**Architecture:** Three thin layers. (1) Pure, unit-tested helpers in `src/services/mapHelpers.ts` (projection, filtering, region math, pin color) that never touch the native map. (2) A rewritten `TripMapScreen` that takes `{ tripId }`, reads notes via the existing `useNotes` hook, and renders `react-native-maps` markers + callouts + banner + empty state. (3) One-line wiring in `TripDetailScreen` to pass `tripId`. No new tables — the map reads existing `notes` rows that already carry `lat`/`lng`/`category`/`place_name`.

**Tech Stack:** TypeScript, React Native (Expo), `react-native-maps` (Apple Maps via `PROVIDER_DEFAULT`), Jest + jest-expo. Reuses `useNotes`, `CategoryPicker`, `NoteEditSheet`, `CategoryColors`/`categoryLabel`.

**Design spec:** `docs/superpowers/specs/2026-05-28-phase-8-trip-map-design.md`

---

## File Structure

- **Create** `src/services/mapHelpers.ts` — pure functions: `toPins`, `countWithoutLocation`, `filterPins`, `regionForPins`, `pinColor`; types `MapPin`, `Region`. Imports only types from `useNotes`/`noteHelpers` and the `CategoryColors` map from `theme` — no React, no native modules, so it is fully unit-testable.
- **Create** `src/services/__tests__/mapHelpers.test.ts` — unit tests for every helper.
- **Rewrite** `src/screens/trip/TripMapScreen.tsx` — from placeholder to a `{ tripId }` screen rendering the map.
- **Modify** `src/screens/trip/TripDetailScreen.tsx:123` — pass `tripId` to `<TripMapScreen />`.
- **Modify** `package.json` / `ios/` — add `react-native-maps` dependency and rebuild.

`mapHelpers.ts` holds all logic that can run without a rendered map; `TripMapScreen.tsx` stays a thin view. This split is what makes region/filter/projection testable.

---

## Reference: existing shapes (do not redefine)

From `src/services/noteHelpers.ts`:
```ts
export type Category = 'food' | 'stay' | 'activity' | 'shopping' | 'to-visit' | 'general';
export type Note = /* notes Row, with category: Category | null, tagging_status: TaggingStatus */;
export function categoryLabel(category: Category | null): string; // '' when null
```

From `src/hooks/useNotes.ts`:
```ts
export type FeedItem =
  | { kind: 'note'; note: Note }
  | { kind: 'pending'; pending: PendingNote };
```

From `src/theme/index.ts`:
```ts
export const CategoryColors: Record<string, { bg: string; text: string }> = {
  food: { bg: '...', text: '#FF7878' },
  stay: { bg: '...', text: '#A898FF' },
  activity: { bg: '...', text: '#58D898' },
  shopping: { bg: '...', text: '#FFB060' },
  'to-visit': { bg: '...', text: '#70A8FF' },
  general: { bg: '...', text: '#888888' },
};
```
A map pin needs a single color string, so `pinColor` returns the vivid `text` value of the matching `CategoryColors` entry (falling back to `general`).

---

## Task 1: Scaffold `mapHelpers` with types + `pinColor`

**Files:**
- Create: `src/services/mapHelpers.ts`
- Test: `src/services/__tests__/mapHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/mapHelpers.test.ts`:

```ts
import { pinColor } from '../mapHelpers';
import { CategoryColors } from '../../theme';

describe('pinColor', () => {
  it('returns the vivid text color for a known category', () => {
    expect(pinColor('food')).toBe(CategoryColors.food.text);
    expect(pinColor('to-visit')).toBe(CategoryColors['to-visit'].text);
  });

  it('falls back to the general color for null', () => {
    expect(pinColor(null)).toBe(CategoryColors.general.text);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/mapHelpers.test.ts -t pinColor`
Expected: FAIL — `Cannot find module '../mapHelpers'` (or `pinColor is not a function`).

- [ ] **Step 3: Write minimal implementation**

Create `src/services/mapHelpers.ts`:

```ts
import type { Category, Note } from './noteHelpers';
import type { FeedItem } from '../hooks/useNotes';
import { CategoryColors } from '../theme';

export type MapPin = {
  id: string; // note id
  lat: number;
  lng: number;
  category: Category | null;
  place_name: string | null;
  content: string;
  note: Note; // full note, passed to NoteEditSheet on callout press
};

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export function pinColor(category: Category | null): string {
  const key = category ?? 'general';
  return (CategoryColors[key] ?? CategoryColors.general).text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/mapHelpers.test.ts -t pinColor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/mapHelpers.ts src/services/__tests__/mapHelpers.test.ts
git commit -m "feat(map): add mapHelpers scaffold with pinColor"
```

---

## Task 2: `toPins` + `countWithoutLocation`

**Files:**
- Modify: `src/services/mapHelpers.ts`
- Test: `src/services/__tests__/mapHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the top of `src/services/__tests__/mapHelpers.test.ts` (below existing imports) a `FeedItem` factory, then the tests:

```ts
import { toPins, countWithoutLocation } from '../mapHelpers';
import type { Note } from '../noteHelpers';
import type { FeedItem } from '../../hooks/useNotes';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1',
  user_id: 'u1',
  trip_id: 't1',
  content: 'Great ramen here',
  category: 'food',
  lat: 35.0,
  lng: 139.0,
  city: 'Tokyo',
  place_name: 'Ramen Shop',
  photo_urls: [],
  tagging_status: 'complete',
  offline_id: 'o1',
  captured_at: '2026-05-22T12:00:00Z',
  created_at: '2026-05-22T12:00:00Z',
  updated_at: '2026-05-22T12:00:00Z',
  ...overrides,
});

const noteItem = (overrides: Partial<Note> = {}): FeedItem => ({ kind: 'note', note: note(overrides) });
const pendingItem = (): FeedItem => ({
  kind: 'pending',
  // PendingNote shape is irrelevant here; toPins/countWithoutLocation ignore pending items.
  pending: { offline_id: 'p1', trip_id: 't1', captured_at: '2026-05-22T12:00:00Z' } as never,
});

describe('toPins', () => {
  it('keeps only note-items with both lat and lng, projecting the fields', () => {
    const items = [
      noteItem({ id: 'a', lat: 1, lng: 2 }),
      noteItem({ id: 'b', lat: null }),
      noteItem({ id: 'c', lng: null }),
      pendingItem(),
    ];
    const pins = toPins(items);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({
      id: 'a',
      lat: 1,
      lng: 2,
      category: 'food',
      place_name: 'Ramen Shop',
      content: 'Great ramen here',
    });
    expect(pins[0].note.id).toBe('a');
  });
});

describe('countWithoutLocation', () => {
  it('counts note-items missing lat or lng and ignores pending', () => {
    const items = [
      noteItem({ lat: 1, lng: 2 }),
      noteItem({ lat: null }),
      noteItem({ lng: null }),
      pendingItem(),
    ];
    expect(countWithoutLocation(items)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/mapHelpers.test.ts -t "toPins|countWithoutLocation"`
Expected: FAIL — `toPins is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/mapHelpers.ts`:

```ts
export function toPins(items: FeedItem[]): MapPin[] {
  const pins: MapPin[] = [];
  for (const item of items) {
    if (item.kind !== 'note') continue;
    const { note } = item;
    if (note.lat == null || note.lng == null) continue;
    pins.push({
      id: note.id,
      lat: note.lat,
      lng: note.lng,
      category: note.category,
      place_name: note.place_name,
      content: note.content,
      note,
    });
  }
  return pins;
}

export function countWithoutLocation(items: FeedItem[]): number {
  return items.filter(
    (item) => item.kind === 'note' && (item.note.lat == null || item.note.lng == null),
  ).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/mapHelpers.test.ts -t "toPins|countWithoutLocation"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/mapHelpers.ts src/services/__tests__/mapHelpers.test.ts
git commit -m "feat(map): toPins and countWithoutLocation helpers"
```

---

## Task 3: `filterPins`

**Files:**
- Modify: `src/services/mapHelpers.ts`
- Test: `src/services/__tests__/mapHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/services/__tests__/mapHelpers.test.ts`:

```ts
import { filterPins, type MapPin } from '../mapHelpers';

const pin = (id: string, category: MapPin['category']): MapPin => ({
  id,
  lat: 1,
  lng: 2,
  category,
  place_name: null,
  content: '',
  note: note({ id, category }),
});

describe('filterPins', () => {
  const pins = [pin('a', 'food'), pin('b', 'stay'), pin('c', 'food')];

  it('returns all pins when category is null (the All state)', () => {
    expect(filterPins(pins, null)).toHaveLength(3);
  });

  it('returns only pins matching the given category', () => {
    expect(filterPins(pins, 'food').map((p) => p.id)).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/mapHelpers.test.ts -t filterPins`
Expected: FAIL — `filterPins is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/mapHelpers.ts`:

```ts
export function filterPins(pins: MapPin[], category: Category | null): MapPin[] {
  if (category == null) return pins;
  return pins.filter((p) => p.category === category);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/mapHelpers.test.ts -t filterPins`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/mapHelpers.ts src/services/__tests__/mapHelpers.test.ts
git commit -m "feat(map): filterPins helper"
```

---

## Task 4: `regionForPins`

**Files:**
- Modify: `src/services/mapHelpers.ts`
- Test: `src/services/__tests__/mapHelpers.test.ts`

Constants: `DEFAULT_DELTA = 0.02` (single-pin zoom), `MIN_DELTA = 0.01` (clamp so near-identical points aren't over-zoomed), `PADDING = 1.4` (breathing room around the bounding box).

- [ ] **Step 1: Write the failing test**

Add to `src/services/__tests__/mapHelpers.test.ts`:

```ts
import { regionForPins } from '../mapHelpers';

describe('regionForPins', () => {
  it('returns null for no pins', () => {
    expect(regionForPins([])).toBeNull();
  });

  it('centers on a single pin with the default delta', () => {
    const region = regionForPins([pin('a', 'food')]); // pin() puts it at lat 1, lng 2
    expect(region).toEqual({
      latitude: 1,
      longitude: 2,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    });
  });

  it('returns the padded bounding box for multiple pins', () => {
    const pins = [
      { ...pin('a', 'food'), lat: 10, lng: 20 },
      { ...pin('b', 'stay'), lat: 12, lng: 26 },
    ];
    const region = regionForPins(pins)!;
    expect(region.latitude).toBeCloseTo(11, 5); // midpoint of 10..12
    expect(region.longitude).toBeCloseTo(23, 5); // midpoint of 20..26
    expect(region.latitudeDelta).toBeCloseTo(2 * 1.4, 5); // span 2 * padding
    expect(region.longitudeDelta).toBeCloseTo(6 * 1.4, 5); // span 6 * padding
  });

  it('clamps tiny spans to the minimum delta', () => {
    const pins = [
      { ...pin('a', 'food'), lat: 10, lng: 20 },
      { ...pin('b', 'stay'), lat: 10.0001, lng: 20.0001 },
    ];
    const region = regionForPins(pins)!;
    expect(region.latitudeDelta).toBe(0.01);
    expect(region.longitudeDelta).toBe(0.01);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/mapHelpers.test.ts -t regionForPins`
Expected: FAIL — `regionForPins is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/mapHelpers.ts`:

```ts
const DEFAULT_DELTA = 0.02;
const MIN_DELTA = 0.01;
const PADDING = 1.4;

export function regionForPins(pins: MapPin[]): Region | null {
  if (pins.length === 0) return null;

  if (pins.length === 1) {
    return {
      latitude: pins[0].lat,
      longitude: pins[0].lng,
      latitudeDelta: DEFAULT_DELTA,
      longitudeDelta: DEFAULT_DELTA,
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of pins) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING, MIN_DELTA),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/mapHelpers.test.ts`
Expected: PASS — all `mapHelpers` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/mapHelpers.ts src/services/__tests__/mapHelpers.test.ts
git commit -m "feat(map): regionForPins with padding and min-delta clamp"
```

---

## Task 5: Install `react-native-maps` and rebuild iOS

**Files:**
- Modify: `package.json`, `package-lock.json`, `ios/` (generated)

This is a native dependency task — no unit test. Verification is a clean build + the existing patch script running.

- [ ] **Step 1: Install the dependency**

Run: `npx expo install react-native-maps`
If npm errors on a peer-dependency conflict (as in prior phases), run:
`npx expo install react-native-maps -- --legacy-peer-deps`
Expected: `react-native-maps` appears in `package.json` dependencies.

- [ ] **Step 2: Check whether a config plugin is required**

Apple Maps needs **no API key**. Inspect the package's Expo config — if `npx expo install` printed guidance to add `react-native-maps` to `app.json` `plugins`, add it; otherwise leave `app.json` unchanged. Do NOT add any Google Maps API key.

- [ ] **Step 3: Rebuild with the patched pods flow**

Run: `npm run ios`
(`npm run ios` runs `npm run pods` first, which runs `pod install` then re-applies the 5 pbxproj patches via `scripts/patch-ios-pbxproj.js`.)
**Never** run raw `pod install` or `expo prebuild --clean`. iOS deployment target stays 16.4.
Expected: app builds and launches in the simulator/device without the map screen yet wired (Map tab still shows old placeholder until Task 6).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json ios
git commit -m "build(map): add react-native-maps dependency and rebuild iOS"
```

---

## Task 6: Rewrite `TripMapScreen`

**Files:**
- Rewrite: `src/screens/trip/TripMapScreen.tsx`

No automated test (renders the native `MapView`); verified via the manual checklist in Task 8. Mirror `TripFeedScreen`'s loading/error patterns exactly.

- [ ] **Step 1: Replace the placeholder with the full screen**

Overwrite `src/screens/trip/TripMapScreen.tsx` with:

```tsx
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { useNotes } from '../../hooks/useNotes';
import CategoryPicker from '../../components/CategoryPicker';
import NoteEditSheet from '../../components/NoteEditSheet';
import { categoryLabel, type Category, type Note } from '../../services/noteHelpers';
import {
  toPins,
  filterPins,
  regionForPins,
  countWithoutLocation,
  pinColor,
} from '../../services/mapHelpers';
import { CategoryColors, Colors, Spacing, Typography } from '../../theme';

type Props = { tripId: string };

export default function TripMapScreen({ tripId }: Props) {
  const { items, loading, error } = useNotes(tripId);
  const [filter, setFilter] = useState<Category | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const pins = useMemo(() => toPins(items), [items]);
  const filtered = useMemo(() => filterPins(pins, filter), [pins, filter]);
  const region = useMemo(() => regionForPins(filtered), [filtered]);
  const noLocationCount = useMemo(() => countWithoutLocation(items), [items]);

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

  return (
    <View style={styles.container}>
      <CategoryPicker value={filter} onChange={setFilter} />

      <View style={styles.mapWrap}>
        {region ? (
          <MapView
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_DEFAULT}
            userInterfaceStyle="dark"
            region={region}
          >
            {filtered.map((p) => {
              const colors = CategoryColors[p.category ?? 'general'] ?? CategoryColors.general;
              const title = p.place_name ?? categoryLabel(p.category) || 'Note';
              return (
                <Marker
                  key={p.id}
                  coordinate={{ latitude: p.lat, longitude: p.lng }}
                  pinColor={pinColor(p.category)}
                >
                  <Callout onPress={() => setEditingNote(p.note)}>
                    <View style={styles.callout}>
                      <Text style={styles.calloutTitle}>{title}</Text>
                      {p.category && (
                        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                          <Text style={[styles.badgeLabel, { color: colors.text }]}>
                            {p.category}
                          </Text>
                        </View>
                      )}
                      {p.content.length > 0 && (
                        <Text style={styles.calloutSnippet} numberOfLines={2}>
                          {p.content.slice(0, 80)}
                        </Text>
                      )}
                    </View>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>
        ) : (
          <View style={styles.center}>
            <Text style={styles.emptyBody}>
              Places appear here as you capture notes with locations.
            </Text>
          </View>
        )}

        {noLocationCount > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {noLocationCount} {noLocationCount === 1 ? 'note' : 'notes'} without a location
            </Text>
          </View>
        )}
      </View>

      {editingNote && (
        <NoteEditSheet
          note={editingNote}
          visible={true}
          onClose={() => setEditingNote(null)}
          onDeleted={() => setEditingNote(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  mapWrap: { flex: 1 },
  error: { ...Typography.body, color: Colors.error, textAlign: 'center' },
  emptyBody: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  banner: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(28,28,30,0.9)',
    borderRadius: 999,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  bannerText: { ...Typography.caption, color: Colors.textSecondary },
  // Callout renders in a native (light) bubble, so use dark text here.
  callout: { maxWidth: 220, padding: Spacing.xs, gap: 4 },
  calloutTitle: { fontSize: 15, fontWeight: '700', color: '#111111' },
  calloutSnippet: { fontSize: 13, color: '#333333' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  badgeLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
});
```

- [ ] **Step 2: Type-check the screen**

Run: `npx tsc --noEmit`
Expected: no errors. (`react-native-maps` types are now installed from Task 5.)

- [ ] **Step 3: Run the full unit suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — `mapHelpers` and all existing suites green. (No test imports `TripMapScreen`, so jest never loads the native `react-native-maps` module.)

- [ ] **Step 4: Commit**

```bash
git add src/screens/trip/TripMapScreen.tsx
git commit -m "feat(map): functional TripMapScreen with pins, callouts, filter, banner"
```

---

## Task 7: Wire `tripId` into `TripMapScreen`

**Files:**
- Modify: `src/screens/trip/TripDetailScreen.tsx:123`

- [ ] **Step 1: Pass the trip id**

In `src/screens/trip/TripDetailScreen.tsx`, change the tab body line:

```tsx
{tab === 'feed' ? <TripFeedScreen tripId={tripId} /> : <TripMapScreen />}
```

to:

```tsx
{tab === 'feed' ? <TripFeedScreen tripId={tripId} /> : <TripMapScreen tripId={tripId} />}
```

The Map tab is only mounted when `tab === 'map'`, so `MapView` is created on demand.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the old call without `tripId` would now fail type-checking; the new one satisfies the `{ tripId }` prop).

- [ ] **Step 3: Commit**

```bash
git add src/screens/trip/TripDetailScreen.tsx
git commit -m "feat(map): pass tripId from TripDetailScreen to TripMapScreen"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Automated gate**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass, no type errors.

- [ ] **Step 2: Manual device checklist**

Build/run on device or simulator (`npm run ios`) and verify against the spec's manual section:
- [ ] Map renders with dark style, centered on the trip's located notes.
- [ ] Pins are colored per category; tapping a pin shows a callout (place name + category badge + content snippet).
- [ ] Tapping a callout opens `NoteEditSheet` for that note; an edit or delete reflects live on the map (Realtime UPDATE/DELETE).
- [ ] Filter row hides/shows pins by category; tapping the selected pill again clears back to All (all pins).
- [ ] No-location banner shows the correct count of notes missing coordinates (singular/plural correct).
- [ ] Empty state ("Places appear here as you capture notes with locations.") shows when the trip has no located notes, with the banner still shown if applicable.

- [ ] **Step 3: Update spec status**

In `docs/superpowers/specs/2026-05-28-phase-8-trip-map-design.md`, change the `Status:` line to `Implemented`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-05-28-phase-8-trip-map-design.md
git commit -m "docs: mark Phase 8 (Trip Map tab) implemented"
```

---

## Self-Review Notes

- **Spec coverage:** `toPins`/`countWithoutLocation`/`filterPins`/`regionForPins`/`pinColor` → Tasks 1–4. `TripMapScreen` rewrite (filter row, MapView, markers+callouts, banner, empty state, NoteEditSheet, loading/error) → Task 6. Wiring → Task 7. Dependency/native build → Task 5. Testing (automated + manual) → Tasks 1–4 and Task 8.
- **Out-of-scope confirmed absent:** no Personal Destinations screen, no community map, no custom marker artwork, no trip-city geocoding fallback.
- **Type consistency:** `MapPin`/`Region` defined once in Task 1 and imported thereafter; `pinColor` returns `string` (the `CategoryColors[...].text` value) consistently; `filter: Category | null` matches `CategoryPicker`'s `value`/`onChange` API; `NoteEditSheet` props (`note`, `visible`, `onClose`, `onDeleted`) match `TripFeedScreen`'s usage exactly.
