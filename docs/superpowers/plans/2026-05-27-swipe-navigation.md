# Swipe Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add swipe-left-to-navigate on trip cards, replace the `+` icon button with a `+ New trip` text button, and add horizontal swipe navigation between the four main tabs using PagerView.

**Architecture:** Three native packages (`react-native-gesture-handler`, `react-native-reanimated`, `react-native-pager-view`) gate all three features; they require a native Expo dev-client rebuild after install. The TabNavigator is replaced in-place with a `PagerView`-based `TabPager` so `AppNavigator` and `MainStack` remain untouched. `TripCard` gains a `Gesture.Pan()` on top of its existing `Pressable`; the Pressable stays for tap + long-press, and the pan fires `onPress()` after the card animates off-screen.

**Tech Stack:** React Native 0.81 / Expo ~54, `react-native-gesture-handler` ≥2, `react-native-reanimated` ≥3, `react-native-pager-view` ≥6, React Native Testing Library (already configured via `jest-expo`).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `package.json` | Add 3 native deps |
| Modify | `babel.config.js` | Add reanimated plugin (must be last) |
| Modify | `jest.config.js` | Transform new native packages in jest |
| Modify | `App.tsx` | Import gesture-handler; wrap root with `GestureHandlerRootView` |
| Modify | `src/components/TripCard.tsx` | Add `GestureDetector` + pan gesture; export `SWIPE_THRESHOLD` |
| Modify | `src/screens/HomeScreen.tsx` | Replace circular `addButton` with text-only `+ New trip` Pressable |
| Modify | `src/navigation/TabNavigator.tsx` | Replace `createBottomTabNavigator` with PagerView-based `TabPager`; export `TAB_CONFIG` |
| Create | `src/components/__tests__/TripCard.test.ts` | Verify `SWIPE_THRESHOLD` constant |
| Create | `src/navigation/__tests__/TabNavigator.test.ts` | Verify `TAB_CONFIG` order and icon shape |

---

## Task 1: Install packages and configure toolchain

**Files:**
- Modify: `package.json`
- Modify: `babel.config.js`
- Modify: `jest.config.js`
- Modify: `App.tsx`

- [ ] **Step 1: Install the three native packages**

```bash
npm install react-native-gesture-handler react-native-reanimated react-native-pager-view
```

Expected: three new entries appear in `package.json` `dependencies`, `node_modules` has the packages.

- [ ] **Step 2: Add reanimated babel plugin — must be last**

Replace the entire content of `babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

- [ ] **Step 3: Update jest transformIgnorePatterns for new packages**

Replace the entire content of `jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@supabase/.*|react-native-gesture-handler|react-native-reanimated|react-native-pager-view))',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
```

- [ ] **Step 4: Wrap app root with GestureHandlerRootView**

`react-native-gesture-handler` requires `GestureHandlerRootView` at the outermost level. The `import 'react-native-gesture-handler'` line must appear before any other react-native imports.

Replace the entire content of `App.tsx`:

```tsx
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors } from './src/theme';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: Colors.border,
    primary: Colors.accent,
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer theme={navTheme}>
            <AppNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json babel.config.js jest.config.js App.tsx
git commit -m "feat: install gesture-handler, reanimated, pager-view; wrap root with GestureHandlerRootView"
```

---

## Task 2: Replace `+` icon button with `+ New trip` text button

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Replace the button JSX**

In `src/screens/HomeScreen.tsx`, find the Pressable in the top bar (around line 134) and replace it:

```tsx
// Remove this:
<Pressable style={styles.addButton} onPress={() => setSheetVisible(true)}>
  <Text style={styles.addButtonLabel}>＋</Text>
</Pressable>

// Replace with:
<Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
  <Text style={styles.newTripLabel}>＋ New trip</Text>
</Pressable>
```

- [ ] **Step 2: Update the StyleSheet**

In the `StyleSheet.create({...})` block, remove the `addButton` and `addButtonLabel` entries and add `newTripLabel`:

```ts
// Remove:
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonLabel: { color: '#FFFFFF', fontSize: 20, lineHeight: 22, fontWeight: '600' },

// Add:
  newTripLabel: { fontSize: 14, color: Colors.accent, fontWeight: '700' },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: replace + icon button with '+ New trip' text button"
```

---

## Task 3: Add swipe-left-to-navigate gesture to TripCard

**Files:**
- Modify: `src/components/TripCard.tsx`
- Create: `src/components/__tests__/TripCard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/TripCard.test.ts`:

```ts
jest.mock('react-native-reanimated', () => ({
  useSharedValue: jest.fn(() => ({ value: 0 })),
  useAnimatedStyle: jest.fn(() => ({})),
  withTiming: jest.fn(),
  withSpring: jest.fn(),
  runOnJS: jest.fn((fn: unknown) => fn),
  default: { View: 'View' },
}));
jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: jest.fn(() => ({
      activeOffsetX: jest.fn().mockReturnThis(),
      onUpdate: jest.fn().mockReturnThis(),
      onEnd: jest.fn().mockReturnThis(),
    })),
  },
  GestureDetector: jest.fn(({ children }: { children: unknown }) => children),
}));

import { SWIPE_THRESHOLD } from '../TripCard';

describe('TripCard constants', () => {
  it('SWIPE_THRESHOLD is 80px per spec', () => {
    expect(SWIPE_THRESHOLD).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/components/__tests__/TripCard.test.ts --no-coverage
```

Expected: FAIL — module has no exported member `SWIPE_THRESHOLD`.

- [ ] **Step 3: Rewrite TripCard with gesture support**

Replace the entire content of `src/components/TripCard.tsx`:

```tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Shadows, BorderRadius, getTripGradient } from '../theme';
import TripStatusBadge from './TripStatusBadge';
import { formatDateRange, isOverdueActive, type Trip } from '../services/tripHelpers';

export const SWIPE_THRESHOLD = 80;

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

  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      // Clamp to [−SWIPE_THRESHOLD, 0]: card follows finger left but stops at threshold
      translateX.value = Math.max(-SWIPE_THRESHOLD, Math.min(0, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        // Crossed threshold: slide off-screen then fire navigation
        translateX.value = withTiming(-500, { duration: 150 }, (finished) => {
          if (finished) runOnJS(onPress)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Pressable
          style={({ pressed }) => [styles.inner, pressed && styles.cardPressed]}
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
      </Animated.View>
    </GestureDetector>
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
  inner: { flex: 1 },
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

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/components/__tests__/TripCard.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/TripCard.tsx src/components/__tests__/TripCard.test.ts
git commit -m "feat: add swipe-left-to-navigate gesture to TripCard"
```

---

## Task 4: Replace TabNavigator with PagerView-based TabPager

**Files:**
- Modify: `src/navigation/TabNavigator.tsx`
- Create: `src/navigation/__tests__/TabNavigator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/navigation/__tests__/TabNavigator.test.ts`:

```ts
jest.mock('react-native-pager-view', () => ({
  __esModule: true,
  default: 'PagerView',
}));
jest.mock('../../screens/HomeScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../../screens/ExploreScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../../screens/SearchScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../../screens/BlogScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

import { TAB_CONFIG } from '../TabNavigator';

describe('TabPager configuration', () => {
  it('has four tabs in the correct order per spec', () => {
    expect(TAB_CONFIG.map((t) => t.name)).toEqual(['Home', 'Explore', 'Search', 'Blog']);
  });

  it('each tab has distinct active and inactive icon names', () => {
    for (const tab of TAB_CONFIG) {
      expect(typeof tab.icons.active).toBe('string');
      expect(typeof tab.icons.inactive).toBe('string');
      expect(tab.icons.active).not.toBe(tab.icons.inactive);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/navigation/__tests__/TabNavigator.test.ts --no-coverage
```

Expected: FAIL — `TAB_CONFIG` is not exported from `TabNavigator`.

- [ ] **Step 3: Rewrite TabNavigator.tsx as TabPager**

Replace the entire content of `src/navigation/TabNavigator.tsx`:

```tsx
import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import SearchScreen from '../screens/SearchScreen';
import BlogScreen from '../screens/BlogScreen';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type TabEntry = {
  name: string;
  icons: { active: IoniconsName; inactive: IoniconsName };
  component: React.ComponentType;
};

export const TAB_CONFIG: TabEntry[] = [
  { name: 'Home',    icons: { active: 'home',          inactive: 'home-outline'          }, component: HomeScreen },
  { name: 'Explore', icons: { active: 'compass',       inactive: 'compass-outline'       }, component: ExploreScreen },
  { name: 'Search',  icons: { active: 'search',        inactive: 'search-outline'        }, component: SearchScreen },
  { name: 'Blog',    icons: { active: 'document-text', inactive: 'document-text-outline' }, component: BlogScreen },
];

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <View style={styles.root}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setActiveIndex(e.nativeEvent.position)}
      >
        {TAB_CONFIG.map((tab) => (
          <View key={tab.name} style={styles.page}>
            <tab.component />
          </View>
        ))}
      </PagerView>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
        {TAB_CONFIG.map((tab, index) => {
          const focused = index === activeIndex;
          const color = focused ? Colors.accent : '#555555';
          return (
            <Pressable
              key={tab.name}
              style={styles.tabItem}
              onPress={() => pagerRef.current?.setPage(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
            >
              <Ionicons
                name={focused ? tab.icons.active : tab.icons.inactive}
                size={24}
                color={color}
              />
              <Text style={[styles.tabLabel, { color }]}>{tab.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17,17,17,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/navigation/__tests__/TabNavigator.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/navigation/TabNavigator.tsx src/navigation/__tests__/TabNavigator.test.ts
git commit -m "feat: replace createBottomTabNavigator with PagerView-based TabPager"
```

---

## Task 5: Native rebuild and smoke test

After all code tasks are committed, the three new native packages require a native rebuild — they cannot be loaded by plain Expo Go.

- [ ] **Step 1: Rebuild the iOS dev client**

```bash
npx expo run:ios
```

Expected: app builds and launches on simulator/device without crash.

- [ ] **Step 2: Smoke test each feature**

Verify all three improvements work in the running app:

1. **Swipe-left on a trip card** — card should translate left, snap back if released early, navigate to `TripDetail` if swiped past 80px.
2. **"＋ New trip" button** — top-right of Home should show accent-colored text, no circle background; tapping opens `CreateTripSheet`.
3. **Tab swipe** — swiping horizontally between Home/Explore/Search/Blog should slide pages; tapping tab items should jump directly to that page.

- [ ] **Step 3: Verify gesture conflict does not occur**

On the Home tab: slowly swipe left starting on a trip card — the card should move (not the page). Swipe on empty space between cards — the page should switch tabs.

---

## Notes

- **`navigation.navigate('Tabs', { screen: 'Search' })`** in `MainStack.tsx` (line 45) currently calls `navigation.navigate('Tabs', { screen: 'Search' })`. After this change, the `screen` param is no longer meaningful because `TabNavigator` is no longer a React Navigation navigator — it's a plain component. The navigation to the Tabs screen still works; only the deep-link-to-tab part is lost. This was marked "wired in Phase 7" in the codebase and is out of scope for this plan.
- A native rebuild is mandatory after Task 1. The app will not launch without it.
