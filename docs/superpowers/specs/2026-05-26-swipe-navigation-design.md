# Swipe Navigation UX Improvements

**Date:** 2026-05-26  
**Status:** Approved

## Overview

Three UX improvements to gesture and navigation interactions:

1. Swipe left on a trip card to open that trip
2. Replace the ambiguous `+` icon button in the home screen top bar with a labeled "+ New trip" text button
3. Add page-slide swipe navigation between the four main tabs (Home, Explore, Search, Blog)

## Dependencies to Add

- `react-native-gesture-handler` — gesture primitives (`GestureDetector`, `Pan`)
- `react-native-reanimated` — animation values used by gesture-handler
- `react-native-pager-view` — native horizontal pager for tab sliding

All three are available in the Expo ecosystem and require a native rebuild (Expo dev client, not bare Expo Go).

---

## 1. Trip Card Swipe-Left to Navigate

### Behaviour

Swiping left on a `TripCard` past an 80px threshold navigates to `TripDetail` for that trip — the same action as tapping the card.

- While dragging, the card translates left (capped at the threshold) to provide tactile feedback
- Releasing before the threshold snaps the card back to its original position
- Crossing the threshold triggers navigation and the card translates fully off-screen left before the route push fires
- The pan gesture sets `activeOffsetX: [-10, 10]` so it activates quickly on horizontal intent

### Gesture Conflict Resolution

`activeOffsetX: [-10, 10]` on the card's Pan gesture causes it to claim the touch before PagerView (Section 3) evaluates it. PagerView sees the gesture as already consumed and does not switch tabs. Vertical scrolling of the `FlatList` is unaffected because the pan gesture ignores movements with a dominant vertical component.

### Component Changes

- `TripCard` — wrapped in `GestureDetector` with a `Gesture.Pan()` that drives a Reanimated `useSharedValue` for `translateX` (via `useAnimatedStyle`) and fires `onPress` when threshold is exceeded

---

## 2. "+ New trip" Button in Home Top Bar

### Behaviour

The small circular `+` icon button (`addButton`) in the `HomeScreen` top-right is replaced with a plain text Pressable labelled **`+ New trip`** in the theme accent color. No border, no background circle.

- Same position: top-right, above "Sign out"
- Same action: opens `CreateTripSheet`
- Visually distinct from the orange note-capture FAB (`FloatingCaptureButton`)

### Component Changes

- `HomeScreen` — remove `addButton` / `addButtonLabel` styles and replace the Pressable with a text-only variant using a new `newTripButton` / `newTripLabel` style

---

## 3. Page-Slide Tab Navigation

### Architecture

The current `TabNavigator` (built on `createBottomTabNavigator`) is replaced by a new `TabPager` component that combines a native `PagerView` with a custom tab bar.

```
TabPager
├── PagerView (flex: 1)
│   ├── Page 0 → HomeScreen
│   ├── Page 1 → ExploreScreen
│   ├── Page 2 → SearchScreen
│   └── Page 3 → BlogScreen
└── CustomTabBar (fixed bottom)
    ├── Tab: Home   (icon: home / home-outline)
    ├── Tab: Explore (icon: compass / compass-outline)
    ├── Tab: Search  (icon: search / search-outline)
    └── Tab: Blog    (icon: document-text / document-text-outline)
```

### Behaviour

- Swiping horizontally on any non-card area slides between adjacent pages with a native page-flip animation
- Tapping a tab bar item calls `pagerRef.current.setPage(index)` to jump directly to that page
- PagerView fires `onPageSelected` to update the active tab indicator in the custom tab bar
- All 4 pages remain mounted (PagerView default) so screen state is preserved across swipes
- Tab bar appearance is identical to the current one: dark semi-transparent background (`rgba(17,17,17,0.97)`), border top, accent tint for active icon/label, `#555555` for inactive

### Component Changes

- `src/navigation/TabNavigator.tsx` — replaced in-place by the new `TabPager` implementation (same file, same default export, same usage in `AppNavigator`)
- No changes to `AppNavigator.tsx` — it continues to render `<TabNavigator />` which now resolves to `TabPager`

### Tab Order

| Index | Tab     |
|-------|---------|
| 0     | Home    |
| 1     | Explore |
| 2     | Search  |
| 3     | Blog    |

---

## Out of Scope

- Swipe-right reveal of delete/actions on trip cards (long-press still handles delete)
- Moving "Sign out" out of the top bar
- Any changes to the note-capture FAB
