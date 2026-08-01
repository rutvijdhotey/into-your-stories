# UI Polish — Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the full visual language defined in the UI-polish spec across the entire app so all future phases inherit the correct design system.

**Architecture:** Design system tokens first (`theme/index.ts`), then shared components, then screens. The gradient library (`expo-linear-gradient`) is installed before any component work. All screen behaviour, navigation, and data logic is untouched — only visual layer changes.

**Tech Stack:** React Native + Expo SDK 54, `expo-linear-gradient` (new), `@expo/vector-icons` Ionicons (bundled with Expo — no install needed), `react-native-safe-area-context` (already installed).

---

## File Map

**Create:**
- `src/components/CategoryBadge.tsx` — reusable coloured category pill using `CategoryColors`
- `src/theme/__tests__/theme.test.ts` — unit tests for `getTripGradient`

**Modify:**
- `src/theme/index.ts` — add `textTertiary`, `CategoryColors`, `TripGradients`, `getTripGradient`, `Shadows`, `BorderRadius`, `Typography.label`
- `src/navigation/TabNavigator.tsx` — hide nav headers, add Ionicons tab icons, restyle tab bar
- `src/components/FloatingCaptureButton.tsx` — replace flat bg with LinearGradient + `Shadows.fab`
- `src/components/TripStatusBadge.tsx` — 3-case colours (active green, overdue red, completed white-tint)
- `src/components/TripCard.tsx` — full gradient card rewrite using `LinearGradient` + `getTripGradient`
- `src/components/NoteCard.tsx` — use imported `CategoryBadge`, tighten sizing
- `src/components/TripSelector.tsx` — card-style redesign replacing pill chips
- `src/components/NoteCaptureSheet.tsx` — mic stub, OR divider, restyled input + action row
- `src/components/EmptyState.tsx` — add emoji prop, bolder heading, full-width CTA
- `src/screens/HomeScreen.tsx` — custom header, label section headers, remove bottom CTA bar
- `src/screens/trip/TripDetailScreen.tsx` — LinearGradient header with trip gradient
- `src/screens/ExploreScreen.tsx` — designed shell
- `src/screens/SearchScreen.tsx` — designed shell
- `src/screens/BlogScreen.tsx` — designed shell
- `src/screens/auth/LoginScreen.tsx` — full restyle
- `src/screens/auth/SignupScreen.tsx` — full restyle

---

## Task 1: Install expo-linear-gradient

**Files:**
- Modify: `package.json` (automatic via expo install)

- [ ] **Step 1: Run the install command**

```bash
cd "Notebound" && npx expo install expo-linear-gradient -- --legacy-peer-deps
```

Expected output: no errors, `expo-linear-gradient` appears in `package.json` under `dependencies`.

- [ ] **Step 2: Verify the install**

```bash
grep "expo-linear-gradient" "Notebound/package.json"
```

Expected: `"expo-linear-gradient": "<version>"`

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add package.json && git commit -m "feat: install expo-linear-gradient"
```

---

## Task 2: Extend theme/index.ts — write test first, then implement

**Files:**
- Create: `src/theme/__tests__/theme.test.ts`
- Modify: `src/theme/index.ts`

- [ ] **Step 1: Create the test file**

Create `src/theme/__tests__/theme.test.ts`:

```ts
import { getTripGradient, TripGradients } from '../index';

describe('getTripGradient', () => {
  it('returns a two-element array for any string', () => {
    const result = getTripGradient('Tokyo');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('is deterministic — same name always yields the same gradient', () => {
    expect(getTripGradient('Paris')).toEqual(getTripGradient('Paris'));
    expect(getTripGradient('')).toEqual(getTripGradient(''));
  });

  it('returns a tuple that exists in TripGradients', () => {
    const result = getTripGradient('Barcelona');
    expect(TripGradients).toContainEqual(result);
  });

  it('distributes across multiple gradients for varied names', () => {
    const results = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'Tokyo', 'Paris'].map(getTripGradient);
    const unique = new Set(results.map(JSON.stringify));
    expect(unique.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd "Notebound" && npx jest src/theme/__tests__/theme.test.ts --no-coverage
```

Expected: FAIL — `getTripGradient` is not exported from `../index`.

- [ ] **Step 3: Replace src/theme/index.ts with the full updated version**

```ts
export const Colors = {
  background: '#111111',
  surface: '#1C1C1E',
  accent: '#C8703A',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  textTertiary: '#555555',
  border: '#2C2C2E',
  error: '#FF453A',
  food: '#FF9F0A',
  stay: '#30D158',
  activity: '#0A84FF',
  shopping: '#FF375F',
} as const;

export const CategoryColors: Record<string, { bg: string; text: string }> = {
  food:       { bg: 'rgba(220,60,60,0.2)',   text: '#FF7878' },
  stay:       { bg: 'rgba(112,96,224,0.2)',  text: '#A898FF' },
  activity:   { bg: 'rgba(48,168,112,0.2)', text: '#58D898' },
  shopping:   { bg: 'rgba(240,160,48,0.2)', text: '#FFB060' },
  'to-visit': { bg: 'rgba(48,96,200,0.2)',  text: '#70A8FF' },
  general:    { bg: 'rgba(255,255,255,0.1)', text: '#888888' },
};

export const TripGradients: [string, string][] = [
  ['#3D2B1F', '#6B3A2A'],
  ['#1A2A3A', '#2A4A6A'],
  ['#1A2E1A', '#2A5A2A'],
  ['#2A1A3A', '#4A2A6A'],
  ['#2E2A1A', '#5A4A1A'],
  ['#1A2A2E', '#1A4A5A'],
  ['#2E1A1A', '#5A2A2A'],
  ['#1E1E2E', '#2E2E5A'],
];

export function getTripGradient(tripName: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < tripName.length; i++) {
    hash = (hash * 31 + tripName.charCodeAt(i)) & 0xffffffff;
  }
  return TripGradients[Math.abs(hash) % TripGradients.length];
}

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  fab: {
    shadowColor: '#C0581A',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
} as const;

export const BorderRadius = {
  card: 16,
  sheet: 24,
  pill: 999,
  input: 12,
  button: 13,
} as const;

export const Typography = {
  title:   { fontSize: 28, fontWeight: '700' as const, color: Colors.textPrimary },
  heading: { fontSize: 20, fontWeight: '600' as const, color: Colors.textPrimary },
  body:    { fontSize: 16, fontWeight: '400' as const, color: Colors.textPrimary },
  caption: { fontSize: 13, fontWeight: '400' as const, color: Colors.textSecondary },
  label:   { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1, color: Colors.textSecondary },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd "Notebound" && npx jest src/theme/__tests__/theme.test.ts --no-coverage
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Confirm existing tests still pass**

```bash
cd "Notebound" && npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd "Notebound" && git add src/theme/index.ts src/theme/__tests__/theme.test.ts && git commit -m "feat: extend theme with design system tokens"
```

---

## Task 3: Create CategoryBadge component

**Files:**
- Create: `src/components/CategoryBadge.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/CategoryBadge.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { CategoryColors } from '../theme';
import type { Category } from '../services/noteHelpers';

type Props = { category: Category | null };

export default function CategoryBadge({ category }: Props) {
  if (!category) return null;
  const colors = CategoryColors[category] ?? CategoryColors['general'];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]}>{category}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors referencing CategoryBadge.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/components/CategoryBadge.tsx && git commit -m "feat: add CategoryBadge component with per-category colours"
```

---

## Task 4: Update TripStatusBadge — 3-case colours

**Files:**
- Modify: `src/components/TripStatusBadge.tsx`

- [ ] **Step 1: Replace TripStatusBadge with the 3-case colour version**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import type { TripStatus } from '../services/tripHelpers';

type Props = {
  status: TripStatus;
  overdue?: boolean;
};

export default function TripStatusBadge({ status, overdue = false }: Props) {
  const label =
    status === 'completed' ? 'Completed' : overdue ? 'Overdue' : 'Active';
  const bgColor =
    status === 'completed'
      ? 'rgba(255,255,255,0.2)'
      : overdue
      ? 'rgba(255,69,58,0.9)'
      : 'rgba(52,199,89,0.92)';

  return (
    <View style={[styles.base, { backgroundColor: bgColor }]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/components/TripStatusBadge.tsx && git commit -m "feat: update TripStatusBadge with 3-case colour system"
```

---

## Task 5: Update TabNavigator — hide headers + Ionicons tab icons

**Files:**
- Modify: `src/navigation/TabNavigator.tsx`

- [ ] **Step 1: Replace TabNavigator.tsx**

```tsx
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TabParamList } from './types';
import { Colors } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import SearchScreen from '../screens/SearchScreen';
import BlogScreen from '../screens/BlogScreen';

const Tab = createBottomTabNavigator<TabParamList>();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof TabParamList, { active: IoniconsName; inactive: IoniconsName }> = {
  Home:    { active: 'home',          inactive: 'home-outline' },
  Explore: { active: 'compass',       inactive: 'compass-outline' },
  Search:  { active: 'search',        inactive: 'search-outline' },
  Blog:    { active: 'document-text', inactive: 'document-text-outline' },
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size }) => {
          const icons = TAB_ICONS[route.name as keyof TabParamList];
          const name = focused ? icons.active : icons.inactive;
          const color = focused ? Colors.accent : '#555555';
          return <Ionicons name={name} size={size} color={color} />;
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: '#555555',
        tabBarStyle: {
          backgroundColor: 'rgba(17,17,17,0.97)',
          borderTopColor: 'rgba(255,255,255,0.08)',
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Blog" component={BlogScreen} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/navigation/TabNavigator.tsx && git commit -m "feat: add Ionicons tab icons and hide nav headers"
```

---

## Task 6: Update FloatingCaptureButton — LinearGradient + glow

**Files:**
- Modify: `src/components/FloatingCaptureButton.tsx`

- [ ] **Step 1: Replace FloatingCaptureButton.tsx**

```tsx
import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shadows } from '../theme';

type Props = {
  onPress: () => void;
};

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56;
const FAB_GAP = 16;

export default function FloatingCaptureButton({ onPress }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom + TAB_BAR_HEIGHT + FAB_GAP;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Capture a note"
      style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.fabPressed]}
    >
      <LinearGradient
        colors={['#E08040', '#C0581A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={styles.icon}>＋</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    ...Shadows.fab,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: { opacity: 0.85 },
  icon: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '600' },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/components/FloatingCaptureButton.tsx && git commit -m "feat: add LinearGradient and glow shadow to FAB"
```

---

## Task 7: Rewrite TripCard — gradient card

**Files:**
- Modify: `src/components/TripCard.tsx`

- [ ] **Step 1: Replace TripCard.tsx**

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Shadows, BorderRadius, getTripGradient } from '../theme';
import TripStatusBadge from './TripStatusBadge';
import { formatDateRange, isOverdueActive, type Trip } from '../services/tripHelpers';

type Props = {
  trip: Trip;
  onPress: () => void;
  onLongPress: () => void;
};

export default function TripCard({ trip, onPress, onLongPress }: Props) {
  const overdue = isOverdueActive(trip);
  const destinations =
    trip.destinations.length > 0 ? trip.destinations.join(', ') : 'No destination yet';
  const noteCountLabel = `${trip.note_count} ${trip.note_count === 1 ? 'note' : 'notes'}`;
  const gradient = getTripGradient(trip.name);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.scrim}
      />
      <View style={styles.statusBadgeWrap}>
        <TripStatusBadge status={trip.status} overdue={overdue} />
      </View>
      <View style={styles.bottomLeft}>
        <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
        <Text style={styles.destination} numberOfLines={1}>{destinations}</Text>
        <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
      </View>
      <Text style={styles.noteCount}>{noteCountLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 160,
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  cardPressed: { opacity: 0.85 },
  scrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  statusBadgeWrap: { position: 'absolute', top: 10, right: 10 },
  bottomLeft: { position: 'absolute', bottom: 10, left: 12, right: 80 },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  destination: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  dates: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  noteCount: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/components/TripCard.tsx && git commit -m "feat: rewrite TripCard with gradient background and scrim overlay"
```

---

## Task 8: Update NoteCard — use CategoryBadge, tighten sizing

**Files:**
- Modify: `src/components/NoteCard.tsx`

- [ ] **Step 1: Replace NoteCard.tsx**

```tsx
import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import { Colors } from '../theme';
import CategoryBadge from './CategoryBadge';
import { formatRelativeTime, type Note } from '../services/noteHelpers';
import type { PendingNote } from '../services/offlineQueue';
import type { FeedItem } from '../hooks/useNotes';

type Props = { item: FeedItem };

export default function NoteCard({ item }: Props) {
  if (item.kind === 'note') return <ServerNoteCard note={item.note} />;
  return <PendingNoteCard pending={item.pending} />;
}

function ServerNoteCard({ note }: { note: Note }) {
  const showShimmer = note.tagging_status === 'pending' && !note.category;
  return (
    <View style={styles.card}>
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
    </View>
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

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
cd "Notebound" && npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd "Notebound" && git add src/components/NoteCard.tsx && git commit -m "feat: use CategoryBadge component and tighten NoteCard layout"
```

---

## Task 9: Redesign TripSelector — card style

**Files:**
- Modify: `src/components/TripSelector.tsx`

- [ ] **Step 1: Replace TripSelector.tsx**

```tsx
import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native';
import { Colors, Spacing } from '../theme';
import type { Trip } from '../services/tripHelpers';

type Props = {
  activeTrips: Trip[];
  selectedTripId: string | null;
  onSelect: (tripId: string) => void;
  onStartTrip: () => void;
};

export default function TripSelector({
  activeTrips,
  selectedTripId,
  onSelect,
  onStartTrip,
}: Props) {
  if (activeTrips.length === 0) {
    return (
      <View style={styles.emptyRow}>
        <Text style={styles.emptyLabel}>No active trips.</Text>
        <Pressable onPress={onStartTrip} accessibilityRole="button">
          <Text style={styles.link}>Start one →</Text>
        </Pressable>
      </View>
    );
  }

  if (activeTrips.length === 1) {
    const trip = activeTrips[0];
    const dest = trip.destinations.length > 0 ? trip.destinations[0] : null;
    return (
      <View style={styles.singleCard}>
        <Text style={styles.singleName}>{trip.name}</Text>
        {dest ? <Text style={styles.singleDest}>{dest}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.chips}
    >
      {activeTrips.map((trip) => {
        const selected = trip.id === selectedTripId;
        const dest = trip.destinations.length > 0 ? trip.destinations[0] : null;
        return (
          <Pressable
            key={trip.id}
            onPress={() => onSelect(trip.id)}
            style={[styles.card, selected && styles.cardSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.tripName, selected && styles.tripNameSelected]}>
              {trip.name}
            </Text>
            {dest ? <Text style={styles.tripDest}>{dest}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyLabel: { fontSize: 14, color: Colors.textSecondary },
  link: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  singleCard: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  singleName: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  singleDest: { fontSize: 9, color: '#555555', marginTop: 2 },
  scroll: { flexGrow: 0 },
  chips: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  card: {
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    minWidth: 110,
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: 'rgba(200,112,58,0.15)',
  },
  tripName: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  tripNameSelected: { color: Colors.accent },
  tripDest: { fontSize: 9, color: '#555555', marginTop: 2 },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/components/TripSelector.tsx && git commit -m "feat: redesign TripSelector to card-style layout"
```

---

## Task 10: Update NoteCaptureSheet — mic stub, OR divider, restyled input and action row

**Files:**
- Modify: `src/components/NoteCaptureSheet.tsx`

- [ ] **Step 1: Replace NoteCaptureSheet.tsx**

```tsx
import { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { useLocation } from '../hooks/useLocation';
import { createNote } from '../services/noteService';
import { validateContent, type Category } from '../services/noteHelpers';
import CategoryPicker from './CategoryPicker';
import TripSelector from './TripSelector';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onStartTrip: () => void;
};

export default function NoteCaptureSheet({ visible, onClose, onStartTrip }: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { trips } = useTrips(userId);
  const { fix, loading: locating, fetch: fetchLocation } = useLocation();

  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'active'), [trips]);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (activeTrips.length === 0) setSelectedTripId(null);
    else if (!selectedTripId || !activeTrips.some((t) => t.id === selectedTripId)) {
      setSelectedTripId(activeTrips[0].id);
    }
  }, [visible, activeTrips, selectedTripId]);

  useEffect(() => {
    if (!visible) return;
    setContent('');
    setCategory(null);
    void fetchLocation();
  }, [visible, fetchLocation]);

  const canSave = !saving && selectedTripId !== null && validateContent(content).ok;

  const handleSave = async () => {
    if (!userId || !selectedTripId) return;
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
      const latest = await fetchLocation();
      await createNote({
        userId,
        tripId: selectedTripId,
        content: validation.value,
        category,
        lat: latest?.lat ?? fix?.lat ?? null,
        lng: latest?.lng ?? fix?.lng ?? null,
        city: latest?.city ?? fix?.city ?? null,
      });
      onClose();
    } catch (e) {
      Alert.alert('Could not save note', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const locationLabel = locating
    ? '📍 Locating…'
    : fix?.city
    ? `📍 ${fix.city}`
    : '📍 No location';

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <TripSelector
          activeTrips={activeTrips}
          selectedTripId={selectedTripId}
          onSelect={setSelectedTripId}
          onStartTrip={() => {
            onClose();
            onStartTrip();
          }}
        />

        <View style={styles.micSection}>
          <Pressable
            style={styles.micButton}
            accessibilityLabel="Voice recording (coming in Phase 4)"
          >
            <LinearGradient
              colors={['#E08040', '#C0581A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.micGradient}
            >
              <Text style={styles.micEmoji}>🎙️</Text>
            </LinearGradient>
          </Pressable>
          <Text style={styles.micHint}>Hold to record</Text>
        </View>

        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          autoFocus
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        <View style={styles.actionRow}>
          <View
            accessibilityLabel="Photo (coming in Phase 5)"
            style={styles.inertIcon}
          >
            <Text style={styles.inertIconLabel}>📷</Text>
          </View>
          <View style={styles.locationPill}>
            <Text style={styles.locationPillText}>{locationLabel}</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            accessibilityRole="button"
          >
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  handleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  micSection: { alignItems: 'center', paddingVertical: Spacing.md },
  micButton: { width: 68, height: 68, borderRadius: 34, overflow: 'hidden', opacity: 0.5 },
  micGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  micEmoji: { fontSize: 28 },
  micHint: { marginTop: Spacing.sm, fontSize: 11, color: '#555555' },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#444444' },
  orText: { fontSize: 11, color: '#444444', fontWeight: '700' },
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  inertIcon: { opacity: 0.4, padding: Spacing.xs },
  inertIconLabel: { fontSize: 20 },
  locationPill: {
    flex: 1,
    marginHorizontal: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  locationPillText: { fontSize: 12, color: Colors.textSecondary },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.button,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveLabel: { fontSize: 16, color: Colors.background, fontWeight: '800' },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/components/NoteCaptureSheet.tsx && git commit -m "feat: add mic stub, OR divider, and polish NoteCaptureSheet layout"
```

---

## Task 11: Update EmptyState — emoji prop + bolder heading + full-width CTA

**Files:**
- Modify: `src/components/EmptyState.tsx`

- [ ] **Step 1: Replace EmptyState.tsx**

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';

type Props = {
  emoji?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
};

export default function EmptyState({ emoji, title, subtitle, ctaLabel, onCtaPress }: Props) {
  return (
    <View style={styles.container}>
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <Pressable style={styles.cta} onPress={onCtaPress}>
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  cta: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.input,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  ctaLabel: { ...Typography.body, fontWeight: '800' },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/components/EmptyState.tsx && git commit -m "feat: add emoji prop, bolder heading, full-width CTA to EmptyState"
```

---

## Task 12: Update HomeScreen — new header, section labels, remove bottom CTA bar

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

**Context:** `TabNavigator` now has `headerShown: false`, so HomeScreen owns its full header area including the safe area inset. `session.user.user_metadata.display_name` holds the display name set during signup.

- [ ] **Step 1: Replace HomeScreen.tsx**

```tsx
import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/types';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { splitByStatus, type Trip } from '../services/tripHelpers';
import { deleteTrip } from '../services/tripService';
import TripCard from '../components/TripCard';
import EmptyState from '../components/EmptyState';
import CreateTripSheet from '../components/CreateTripSheet';

type Nav = NativeStackNavigationProp<MainStackParamList, 'Tabs'>;

type Row =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'trip'; id: string; trip: Trip }
  | { kind: 'toggle'; id: string; expanded: boolean; hidden: number };

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { session, signOut } = useAuth();
  const { trips, loading, error, refresh, optimisticRemove } = useTrips(session?.user.id);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  const displayName =
    ((session?.user.user_metadata?.display_name ?? '') as string) || 'Traveler';

  const rows = useMemo<Row[]>(() => {
    const { active, completed } = splitByStatus(trips);
    const out: Row[] = [];
    if (active.length > 0) {
      out.push({ kind: 'header', id: 'h-active', label: 'Active' });
      for (const t of active) out.push({ kind: 'trip', id: t.id, trip: t });
    }
    if (completed.length > 0) {
      out.push({ kind: 'header', id: 'h-completed', label: 'Completed' });
      const collapsed = completed.length > 3 && !completedExpanded;
      const visible = collapsed ? completed.slice(0, 3) : completed;
      for (const t of visible) out.push({ kind: 'trip', id: t.id, trip: t });
      if (collapsed) {
        out.push({ kind: 'toggle', id: 'toggle-completed', expanded: false, hidden: completed.length - 3 });
      } else if (completed.length > 3) {
        out.push({ kind: 'toggle', id: 'toggle-completed', expanded: true, hidden: 0 });
      }
    }
    return out;
  }, [trips, completedExpanded]);

  const confirmDelete = (trip: Trip) => {
    Alert.alert(
      `Delete "${trip.name}"?`,
      'This will permanently delete the trip and all of its notes. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            optimisticRemove(trip.id);
            try {
              await deleteTrip(trip.id);
            } catch (e) {
              Alert.alert('Could not delete trip', (e as Error).message);
              void refresh();
            }
          },
        },
      ],
    );
  };

  const handleLongPressTrip = (trip: Trip) => {
    if (Platform.OS !== 'ios') {
      Alert.alert(trip.name, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Trip', style: 'destructive', onPress: () => confirmDelete(trip) },
      ]);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: trip.name,
        options: ['Cancel', 'Delete Trip'],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 1,
      },
      (idx) => {
        if (idx === 1) confirmDelete(trip);
      },
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Could not load trips.</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.topBarLeft}>
          <Text style={styles.eyebrow}>NOTEBOUND</Text>
          <Text style={styles.greeting}>Hey, {displayName}</Text>
        </View>
        <View style={styles.topBarRight}>
          <Pressable style={styles.addButton} onPress={() => setSheetVisible(true)}>
            <Text style={styles.addButtonLabel}>＋</Text>
          </Pressable>
          <Pressable onPress={signOut} hitSlop={8} style={styles.signOutButton}>
            <Text style={styles.signOutLabel}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {trips.length === 0 ? (
        <EmptyState
          emoji="✈️"
          title="No trips yet"
          subtitle="Start your first trip to begin capturing notes, photos, and places."
          ctaLabel="Start your first trip"
          onCtaPress={() => setSheetVisible(true)}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return <Text style={styles.sectionHeader}>{item.label}</Text>;
            }
            if (item.kind === 'toggle') {
              return (
                <Pressable
                  style={styles.toggleButton}
                  onPress={() => setCompletedExpanded((e) => !e)}
                >
                  <Text style={styles.toggleLabel}>
                    {item.expanded ? 'Show fewer' : `Show ${item.hidden} more`}
                  </Text>
                </Pressable>
              );
            }
            return (
              <TripCard
                trip={item.trip}
                onPress={() => navigation.getParent()?.navigate('TripDetail', { tripId: item.trip.id })}
                onLongPress={() => handleLongPressTrip(item.trip)}
              />
            );
          }}
        />
      )}

      <CreateTripSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  topBarLeft: { flex: 1 },
  topBarRight: { alignItems: 'flex-end', gap: Spacing.sm },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  greeting: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonLabel: { color: '#FFFFFF', fontSize: 20, lineHeight: 22, fontWeight: '600' },
  signOutButton: { paddingVertical: 2 },
  signOutLabel: { fontSize: 12, color: '#555555' },
  listContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  sectionHeader: {
    ...Typography.label,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  toggleButton: { paddingVertical: Spacing.sm, alignItems: 'center' },
  toggleLabel: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  errorText: { ...Typography.heading, marginBottom: Spacing.sm },
  errorDetail: { ...Typography.caption, textAlign: 'center' },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/screens/HomeScreen.tsx && git commit -m "feat: polish HomeScreen with amber header, section labels, remove bottom CTA"
```

---

## Task 13: Update TripDetailScreen — LinearGradient header

**Files:**
- Modify: `src/screens/trip/TripDetailScreen.tsx`

- [ ] **Step 1: Replace TripDetailScreen.tsx**

```tsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';
import { Colors, Spacing, getTripGradient } from '../../theme';
import { useTripDetail } from '../../hooks/useTripDetail';
import { endTrip } from '../../services/tripService';
import { formatDateRange, isOverdueActive } from '../../services/tripHelpers';
import TripStatusBadge from '../../components/TripStatusBadge';
import TripFeedScreen from './TripFeedScreen';
import TripMapScreen from './TripMapScreen';

type Props = NativeStackScreenProps<MainStackParamList, 'TripDetail'>;

type Tab = 'feed' | 'map';

export default function TripDetailScreen({ route }: Props) {
  const { tripId } = route.params;
  const { trip, loading } = useTripDetail(tripId);
  const [tab, setTab] = useState<Tab>('feed');
  const [ending, setEnding] = useState(false);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text style={styles.bodyText}>This trip is no longer available.</Text>
      </View>
    );
  }

  const overdue = isOverdueActive(trip);
  const destinations =
    trip.destinations.length > 0 ? trip.destinations.join(', ') : 'No destination yet';
  const gradient = getTripGradient(trip.name);

  const handleEndTrip = () => {
    Alert.alert(
      'End trip?',
      'You will not be able to add more notes to this trip once it is ended.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End trip',
          style: 'destructive',
          onPress: async () => {
            setEnding(true);
            try {
              await endTrip(trip.id);
            } catch (e) {
              Alert.alert('Could not end trip', (e as Error).message);
            } finally {
              setEnding(false);
            }
          },
        },
      ],
    );
  };

  const handleGenerateBlog = () => {
    Alert.alert('Generate Blog', 'Blog generation lands in Phase 9.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerScrim}
        />
        <View style={styles.headerContent}>
          <Text style={styles.name}>{trip.name}</Text>
          <Text style={styles.destinations}>{destinations}</Text>
          <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
          <View style={styles.headerActions}>
            <TripStatusBadge status={trip.status} overdue={overdue} />
            {trip.status === 'active' ? (
              <Pressable style={styles.endButton} onPress={handleEndTrip} disabled={ending}>
                <Text style={styles.endButtonLabel}>{ending ? 'Ending...' : 'End Trip'}</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.generateButton} onPress={handleGenerateBlog}>
                <Text style={styles.generateButtonLabel}>Generate Blog</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, tab === 'feed' && styles.tabActive]}
          onPress={() => setTab('feed')}
        >
          <Text style={[styles.tabLabel, tab === 'feed' && styles.tabLabelActive]}>Feed</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'map' && styles.tabActive]}
          onPress={() => setTab('map')}
        >
          <Text style={[styles.tabLabel, tab === 'map' && styles.tabLabelActive]}>Map</Text>
        </Pressable>
      </View>

      <View style={styles.tabBody}>
        {tab === 'feed' ? <TripFeedScreen tripId={tripId} /> : <TripMapScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  bodyText: { fontSize: 16, color: Colors.textSecondary },
  header: { height: 160, overflow: 'hidden' },
  headerScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
  },
  headerContent: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
  },
  name: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
  destinations: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  dates: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: Spacing.sm },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  endButton: {
    borderColor: Colors.error,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  endButtonLabel: { fontSize: 14, color: Colors.error, fontWeight: '600' },
  generateButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  generateButtonLabel: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  tabBar: {
    flexDirection: 'row',
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: Colors.background,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  tabActive: { borderBottomColor: Colors.accent, borderBottomWidth: 2 },
  tabLabel: { fontSize: 15, fontWeight: '500', color: '#555555' },
  tabLabelActive: { fontWeight: '700', color: Colors.textPrimary },
  tabBody: { flex: 1 },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/screens/trip/TripDetailScreen.tsx && git commit -m "feat: add gradient header to TripDetailScreen"
```

---

## Task 14: Update ExploreScreen — designed shell

**Files:**
- Modify: `src/screens/ExploreScreen.tsx`

- [ ] **Step 1: Replace ExploreScreen.tsx**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>EXPLORE</Text>
        <Text style={styles.heading}>Discover Stories</Text>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search destinations</Text>
        </View>
      </View>
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>🧭</Text>
        <Text style={styles.emptyHeading}>No stories yet</Text>
        <Text style={styles.emptyCaption}>Published trips will appear here</Text>
      </View>
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
  heading: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.button,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  searchIcon: { fontSize: 16 },
  searchPlaceholder: { fontSize: 15, color: '#555555', flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  emptyCaption: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/screens/ExploreScreen.tsx && git commit -m "feat: design ExploreScreen shell with search bar and empty state"
```

---

## Task 15: Update SearchScreen — designed shell

**Files:**
- Modify: `src/screens/SearchScreen.tsx`

- [ ] **Step 1: Replace SearchScreen.tsx**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search notes and stories</Text>
          <Text style={styles.micIcon}>🎙️</Text>
        </View>
      </View>
      <Text style={styles.sectionLabel}>YOUR NOTES</Text>
      <Text style={styles.emptyHint}>Search to find your notes</Text>
      <Text style={styles.sectionLabel}>COMMUNITY</Text>
      <Text style={styles.emptyHint}>Search community stories</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.button,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  searchIcon: { fontSize: 16 },
  searchPlaceholder: { fontSize: 15, color: '#555555', flex: 1 },
  micIcon: { fontSize: 16 },
  sectionLabel: {
    ...Typography.label,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyHint: { fontSize: 14, color: '#555555', paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/screens/SearchScreen.tsx && git commit -m "feat: design SearchScreen shell with search bar and section headers"
```

---

## Task 16: Update BlogScreen — designed shell

**Files:**
- Modify: `src/screens/BlogScreen.tsx`

- [ ] **Step 1: Replace BlogScreen.tsx**

```tsx
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';

export default function BlogScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>BLOG</Text>
        <Text style={styles.heading}>Your Stories</Text>
      </View>

      <Text style={styles.sectionLabel}>DRAFTS</Text>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyCardText}>No drafts yet</Text>
      </View>

      <Text style={styles.sectionLabel}>PUBLISHED</Text>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyCardText}>Nothing published yet</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={styles.generateButton}
          onPress={() => Alert.alert('Generate Blog', 'Blog generation lands in Phase 9.')}
        >
          <Text style={styles.generateButtonLabel}>Generate Blog</Text>
        </Pressable>
      </View>
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
  emptyCardText: { fontSize: 14, color: '#555555' },
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
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/screens/BlogScreen.tsx && git commit -m "feat: design BlogScreen shell with sections and Generate Blog stub"
```

---

## Task 17: Restyle LoginScreen

**Files:**
- Modify: `src/screens/auth/LoginScreen.tsx`

- [ ] **Step 1: Replace LoginScreen.tsx**

```tsx
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, BorderRadius } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) setError(signInError.message);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.eyebrow}>NOTEBOUND</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.tagline}>Your travels, remembered.</Text>

        <TextInput
          style={[styles.input, focusedField === 'email' && styles.inputFocused]}
          placeholder="Email"
          placeholderTextColor="#555555"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField(null)}
        />
        <TextInput
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
          placeholder="Password"
          placeholderTextColor="#555555"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (loading || !email || !password) && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={loading || !email || !password}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Signup')} style={styles.linkWrap}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkAccent}>Sign up →</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  tagline: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: Colors.textPrimary,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: { borderColor: Colors.accent },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.button,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  error: { color: Colors.error, marginBottom: Spacing.sm, fontSize: 14 },
  linkWrap: { alignItems: 'center', marginTop: Spacing.lg },
  linkText: { fontSize: 14, color: '#555555' },
  linkAccent: { color: Colors.accent, fontWeight: '600' },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "Notebound" && git add src/screens/auth/LoginScreen.tsx && git commit -m "feat: restyle LoginScreen with brand header and focused-input amber border"
```

---

## Task 18: Restyle SignupScreen

**Files:**
- Modify: `src/screens/auth/SignupScreen.tsx`

- [ ] **Step 1: Replace SignupScreen.tsx**

```tsx
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, BorderRadius } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export default function SignupScreen({ navigation }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) return;
    setInfo('Check your email to confirm your account, then sign in.');
  };

  const canSubmit = !!email && !!password && !!displayName && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.eyebrow}>NOTEBOUND</Text>
        <Text style={styles.title}>Start your story</Text>
        <Text style={styles.tagline}>Capture every moment.</Text>

        <TextInput
          style={[styles.input, focusedField === 'name' && styles.inputFocused]}
          placeholder="Display name"
          placeholderTextColor="#555555"
          autoCapitalize="words"
          value={displayName}
          onChangeText={setDisplayName}
          onFocus={() => setFocusedField('name')}
          onBlur={() => setFocusedField(null)}
        />
        <TextInput
          style={[styles.input, focusedField === 'email' && styles.inputFocused]}
          placeholder="Email"
          placeholderTextColor="#555555"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField(null)}
        />
        <TextInput
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
          placeholder="Password"
          placeholderTextColor="#555555"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
        />

        {error && <Text style={styles.error}>{error}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={styles.linkWrap}>
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkAccent}>Sign in →</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  tagline: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: Colors.textPrimary,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: { borderColor: Colors.accent },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.button,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  error: { color: Colors.error, marginBottom: Spacing.sm, fontSize: 14 },
  info: { color: Colors.stay, marginBottom: Spacing.sm, fontSize: 14 },
  linkWrap: { alignItems: 'center', marginTop: Spacing.lg },
  linkText: { fontSize: 14, color: '#555555' },
  linkAccent: { color: Colors.accent, fontWeight: '600' },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "Notebound" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests one final time**

```bash
cd "Notebound" && npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd "Notebound" && git add src/screens/auth/SignupScreen.tsx && git commit -m "feat: restyle SignupScreen with brand header and focused-input amber border"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §4.1 Theme additions (`textTertiary`, `CategoryColors`, `TripGradients`, `getTripGradient`, `Shadows`, `BorderRadius`, `Typography.label`) | Task 2 |
| §5.1 `CategoryBadge` | Task 3 |
| §5.2 Tab bar Ionicons | Task 5 |
| §5.3 FAB gradient + glow | Task 6 |
| §6 TripCard gradient rewrite | Task 7 |
| §7 HomeScreen header, section headers, remove CTA bar, EmptyState | Tasks 11 + 12 |
| §8 TripDetailScreen gradient header | Task 13 |
| §9 NoteCard with CategoryBadge, tighter sizing | Task 8 |
| §10 NoteCaptureSheet mic stub, OR divider, card trip selector, action row | Tasks 9 + 10 |
| §11 ExploreScreen shell | Task 14 |
| §12 SearchScreen shell | Task 15 |
| §13 BlogScreen shell | Task 16 |
| §14 Login + Signup restyle | Tasks 17 + 18 |
| §3 expo-linear-gradient install | Task 1 |

**TripStatusBadge:** Spec §6 specifies 3 badge colours for TripCard. `TripStatusBadge` is also used in `TripDetailScreen` (§8 says "same status badge"). Updating `TripStatusBadge` globally (Task 4) applies the correct colours consistently. ✓

**Placeholder scan:** No TBD, TODO, or "similar to task N" references. Every step has actual code or a concrete shell command. ✓

**Type consistency check:**
- `getTripGradient` returns `[string, string]` — used identically as `gradient` in TripCard (Task 7) and TripDetailScreen (Task 13). ✓
- `CategoryBadge` takes `category: Category | null` — used in NoteCard as `<CategoryBadge category={note.category} />` where `note.category: Category | null`. ✓
- `BorderRadius.input` (12) and `BorderRadius.button` (13) used in multiple screens — all referencing the same export from theme. ✓
- `Shadows.fab` and `Shadows.card` are `as const` — spread safely into StyleSheet objects. ✓
- `displayName` in HomeScreen reads `session?.user.user_metadata?.display_name` — Supabase stores this as `user_metadata.display_name` (set during signup in SignupScreen). ✓
