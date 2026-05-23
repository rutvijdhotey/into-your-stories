# Into Your Stories — UI Polish Phase Design Spec
**Date:** 2026-05-22  
**Status:** Approved for implementation planning  
**Branch:** `phase-ui-polish/design-system`  
**Inserts between:** Phase 3 (Note Capture) and Phase 4 (Voice + Intent)

---

## 1. Purpose

Phases 1–3 were functional-first. Every screen works but none match the mockup defined in `docs/superpowers/specs/travel-diary-ui-mockups.html`. This phase applies the full visual language across the entire app so all future phases inherit the right design system rather than continuing the barebones pattern.

---

## 2. Approach

**Design system first, then screens.** Shared tokens and components are built once, then each screen is updated to use them. No screen work begins until the foundation is stable.

---

## 3. New Dependency

**`expo-linear-gradient`** — used for TripCard gradient backgrounds and the FAB gradient. Zero configuration; already in the Expo ecosystem. Install with `npx expo install expo-linear-gradient -- --legacy-peer-deps`.

---

## 4. Design System Foundation

### 4.1 `src/theme/index.ts` additions

**`Colors` addition** — add `textTertiary: '#555555'` for very subdued elements (section labels, placeholders, hints). Distinct from `textSecondary` (`#8E8E93`) which is used for visible secondary content.

**`CategoryColors`** — bg tint + foreground text per category:

```ts
export const CategoryColors: Record<string, { bg: string; text: string }> = {
  food:       { bg: 'rgba(220,60,60,0.2)',    text: '#FF7878' },
  stay:       { bg: 'rgba(112,96,224,0.2)',   text: '#A898FF' },
  activity:   { bg: 'rgba(48,168,112,0.2)',   text: '#58D898' },
  shopping:   { bg: 'rgba(240,160,48,0.2)',   text: '#FFB060' },
  'to-visit': { bg: 'rgba(48,96,200,0.2)',    text: '#70A8FF' },
  general:    { bg: 'rgba(255,255,255,0.1)',  text: '#888888' },
};
```

**`TripGradients`** — 8 curated gradient pairs for trip card backgrounds. Deterministic: hash the trip name string → index 0–7 → always the same gradient for the same trip name.

```ts
export const TripGradients: [string, string][] = [
  ['#3D2B1F', '#6B3A2A'],  // warm amber-brown
  ['#1A2A3A', '#2A4A6A'],  // deep ocean blue
  ['#1A2E1A', '#2A5A2A'],  // forest green
  ['#2A1A3A', '#4A2A6A'],  // deep purple
  ['#2E2A1A', '#5A4A1A'],  // warm olive
  ['#1A2A2E', '#1A4A5A'],  // teal
  ['#2E1A1A', '#5A2A2A'],  // deep red
  ['#1E1E2E', '#2E2E5A'],  // midnight blue
];

export function getTripGradient(tripName: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < tripName.length; i++) {
    hash = (hash * 31 + tripName.charCodeAt(i)) & 0xffffffff;
  }
  return TripGradients[Math.abs(hash) % TripGradients.length];
}
```

**`Shadows`** — standard elevation tokens:

```ts
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
```

**`BorderRadius`** — standard radius tokens:

```ts
export const BorderRadius = {
  card: 16,
  sheet: 24,
  pill: 999,
  input: 12,
  button: 13,
} as const;
```

**`Typography` additions** — add `label` style for uppercase section headers:

```ts
label: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1, color: Colors.textSecondary },
```

---

## 5. Shared Component Upgrades

### 5.1 `CategoryBadge` (new component)

**File:** `src/components/CategoryBadge.tsx`

Standalone reusable badge. Takes `category: Category | null`. Looks up `CategoryColors` from theme. Renders a coloured pill with uppercase text (`fontSize: 9`, `fontWeight: 800`, `letterSpacing: 0.3`, `textTransform: uppercase`). Returns `null` when category is null.

Replaces ad-hoc badge rendering currently duplicated in `NoteCard` (ServerNoteCard + PendingNoteCard) and the shimmer badge slot. The shimmer for `tagging_status: 'pending'` remains a separate `ShimmerBadge` component in `NoteCard` — sized to match `CategoryBadge` dimensions.

### 5.2 Tab bar — Ionicons icons

**File:** `src/navigation/TabNavigator.tsx`

Add `tabBarIcon` to each screen's options using `@expo/vector-icons` Ionicons:

| Tab | Icon (active) | Icon (inactive) |
|---|---|---|
| Home | `home` | `home-outline` |
| Explore | `compass` | `compass-outline` |
| Search | `search` | `search-outline` |
| Blog | `document-text` | `document-text-outline` |

Active tint: `Colors.accent`. Inactive tint: `#555555`. Tab bar background: `rgba(17,17,17,0.97)`. Top border: `rgba(255,255,255,0.08)`.

### 5.3 FloatingCaptureButton — gradient + glow

**File:** `src/components/FloatingCaptureButton.tsx`

Replace flat `backgroundColor: Colors.accent` with `LinearGradient` (`colors: ['#E08040', '#C0581A']`, `start: {x:0,y:0}`, `end: {x:1,y:1}`). Apply `Shadows.fab` from theme. The `＋` icon, size, position, and press behaviour are unchanged.

---

## 6. TripCard

**File:** `src/components/TripCard.tsx`

Full rewrite of the visual layer. Behaviour (onPress, onLongPress, delayLongPress) unchanged.

**Structure:**
```
<Pressable height=160 borderRadius=16 overflow=hidden>
  <LinearGradient>          ← fills entire card, getTripGradient(trip.name)
    <View scrim>            ← bottom 60%, rgba(0,0,0,0.6)→transparent
      <StatusBadge>         ← top-right, absolute
      <TripInfo>            ← bottom-left: name + destination + dates
      <NoteCount>           ← bottom-right: "12 notes"
    </View>
  </LinearGradient>
</Pressable>
```

**Typography on card:**
- Trip name: `fontSize: 17`, `fontWeight: 800`, `color: white`, `letterSpacing: -0.3`
- Destination: `fontSize: 11`, `color: rgba(255,255,255,0.7)`
- Note count: `fontSize: 10`, `color: rgba(255,255,255,0.6)`, bottom-right absolute

**Status badge** (top-right, absolute, `top: 10`, `right: 10`):
- Active → `background: rgba(52,199,89,0.92)`, white text
- Completed → `background: rgba(255,255,255,0.2)`, white text
- Overdue → `background: rgba(255,69,58,0.9)`, white text

The separate `body` section below the cover is removed — all content lives on the card.

---

## 7. HomeScreen

**File:** `src/screens/HomeScreen.tsx`

**Header:**
- Amber uppercase eyebrow: `"INTO YOUR STORIES"`, `fontSize: 11`, `fontWeight: 700`, `letterSpacing: 2`
- Main heading: user's display name — `"Hey, {displayName}"`, `fontSize: 26`, `fontWeight: 800`
- Top-right: small amber circular `+` button (`width: 32`, `height: 32`) that opens `CreateTripSheet` — replaces the bottom CTA bar for users who already have trips
- Sign out: moves to a subtle icon button (person icon + "Sign out" text) — small, `color: #555`, so it doesn't compete with the header

**Section headers:**
- Style: `Typography.label` from theme — uppercase, `fontSize: 11`, `fontWeight: 800`, `letterSpacing: 1`, `color: #555`
- Format: `"ACTIVE"` / `"COMPLETED"` — no count in the label (count is on each card via note count)

**Bottom CTA bar:** removed — the `+` button in the header covers the action. Bottom padding on the list stays at 96pt to clear the FAB.

**Empty state:** `EmptyState` component restyled — larger emoji, bolder heading, full-width amber CTA button.

---

## 8. TripDetailScreen

**File:** `src/screens/trip/TripDetailScreen.tsx`

**Header:**
- `LinearGradient` background using the same `getTripGradient(trip.name)` pair — visual continuity from TripCard on Home
- Height: `~160pt`
- Trip name: `fontSize: 22`, `fontWeight: 800`, white, bottom-left over gradient scrim
- Destination + date range: `fontSize: 12`, `rgba(255,255,255,0.7)`, below name
- Status badge + End Trip / Generate Blog button: row at the bottom of the gradient header, same amber styling as before

**Feed / Map tab bar:**
- Active tab: amber 2pt underline + `fontWeight: 700` label (already mostly correct, tighten spacing)
- Inactive tab: `fontWeight: 500`, `color: #555`
- Background: `Colors.background` with hairline top border

**Navigation chrome:** unchanged — React Navigation header with `← Home` back button stays.

---

## 9. NoteCard

**File:** `src/components/NoteCard.tsx`

**Layout:**
```
<View card>
  <View headerRow>
    <CategoryBadge />           ← coloured, uses new component
    <Text meta>city · time</Text>
  </View>
  <Text content numberOfLines=3 />
  {/* photo thumbnail: reserved slot, hidden until Phase 5 */}
</View>
```

**Sizing:**
- Card: `borderRadius: 14`, `padding: 10 12`, `marginHorizontal: 16`, `marginBottom: 8`
- Content: `fontSize: 13`, `color: #E0E0E0`, `lineHeight: 1.45`, clamped to `numberOfLines={3}`
- Meta: `fontSize: 10`, `color: #555`, dot separator `2.5pt`

**Pending state:** `⏳ Syncing` replaces time in meta row. Category badge shown if user selected one.

**Shimmer badge:** remains for `tagging_status: 'pending'` but sized to match `CategoryBadge` height/width so the layout doesn't shift when the real badge arrives.

---

## 10. NoteCaptureSheet

**File:** `src/components/NoteCaptureSheet.tsx`

**Layout top-to-bottom:**

1. **Handle bar** — unchanged
2. **Trip selector** — card-style redesign:
   - Each active trip: `borderRadius: 10`, `background: rgba(255,255,255,0.07)`, trip name `fontWeight: 700 fontSize: 11`, destination `fontSize: 9 color: #555` below
   - Selected: amber border `1.5pt` + `background: rgba(200,112,58,0.15)`, name in `Colors.accent`
   - Single trip: one card, non-interactive
   - No trips: `"No active trips. Start one →"` unchanged
3. **Large mic button stub** — `width: 68`, `height: 68`, `LinearGradient` amber, mic emoji centred, `opacity: 0.5`, tap shows nothing (Phase 4 wires it). Below: `"Hold to record"` hint `fontSize: 11 color: #555`
4. **OR divider** — horizontal hairline with `"OR"` centred, `color: #444 fontWeight: 700`
5. **Text input** — `flex: 1`, `background: rgba(255,255,255,0.07)`, `borderRadius: 12`, placeholder `"What's on your mind?"`
6. **Category picker** — compact horizontal pill row (unchanged from Phase 3 fix)
7. **Bottom action row** — photo icon stub left (inert), location pill centre, **Save** button right (`borderRadius: 13`, `fontWeight: 800`, amber)

---

## 11. Explore Screen

**File:** `src/screens/ExploreScreen.tsx`

**Shell (no real data yet):**
- Amber uppercase eyebrow: `"EXPLORE"`
- Heading: `"Discover Stories"`, `fontSize: 26 fontWeight: 800`
- Search bar: `background: rgba(255,255,255,0.1)`, `borderRadius: 13`, `🔍` left, placeholder `"Search destinations"`, `color: #555`
- Empty state below search: compass emoji large, `"No stories yet"` heading, `"Published trips will appear here"` caption — centred, styled with theme tokens

---

## 12. Search Screen

**File:** `src/screens/SearchScreen.tsx`

**Shell:**
- Search bar: same style as Explore, with amber mic icon (`🎙️`) right as inert stub
- Two section headers below: `"YOUR NOTES"` and `"COMMUNITY"` in `Typography.label` style
- Each section: subtle empty state — `"Search to find your notes"` / `"Search community stories"` in `color: #555`

---

## 13. Blog Screen

**File:** `src/screens/BlogScreen.tsx`

**Shell:**
- Amber uppercase eyebrow: `"BLOG"`
- Heading: `"Your Stories"`, `fontSize: 26 fontWeight: 800`
- Two sections: `"DRAFTS"` and `"PUBLISHED"` in `Typography.label` style
- Each: grey outline empty state card, `"No drafts yet"` / `"Nothing published yet"`
- Full-width amber `"Generate Blog"` button at the bottom (inert — shows alert `"Blog generation lands in Phase 9"`)

---

## 14. Login and Signup Screens

**Files:** `src/screens/auth/LoginScreen.tsx`, `src/screens/auth/SignupScreen.tsx`

**Shared layout:**
- Full `Colors.background` — no white or light assumptions
- Amber uppercase eyebrow: `"INTO YOUR STORIES"`, centred, `fontSize: 11 fontWeight: 700 letterSpacing: 2`
- Bold headline: `"Welcome back"` (Login) / `"Start your story"` (Signup), `fontSize: 28 fontWeight: 800`
- Tagline: `"Your travels, remembered."` / `"Capture every moment."`, `fontSize: 14 color: #555`
- Inputs: `background: rgba(255,255,255,0.07)`, `borderRadius: 12`, `padding: 14`, amber `1pt` border on focus
- Primary button: full-width amber, `borderRadius: 13`, `fontWeight: 800`, `fontSize: 16`
- Switch link: `"Don't have an account? Sign up →"` — `color: #555`, action word in `Colors.accent`

---

## 15. File Changes Summary

**Modify:**
- `src/theme/index.ts` — add `CategoryColors`, `TripGradients`, `getTripGradient`, `Shadows`, `BorderRadius`, `Typography.label`
- `src/navigation/TabNavigator.tsx` — add Ionicons tab icons
- `src/components/FloatingCaptureButton.tsx` — LinearGradient + glow
- `src/components/TripCard.tsx` — full gradient card rewrite
- `src/components/NoteCard.tsx` — use `CategoryBadge`, tighten layout
- `src/components/NoteCaptureSheet.tsx` — card trip selector, large mic stub, OR divider
- `src/components/TripSelector.tsx` — card-style redesign (redesign is described in Section 10 under NoteCaptureSheet; the component itself is what changes, consumed by NoteCaptureSheet)
- `src/screens/HomeScreen.tsx` — new header, label section headers, remove bottom CTA bar
- `src/screens/trip/TripDetailScreen.tsx` — gradient header
- `src/screens/ExploreScreen.tsx` — designed shell
- `src/screens/SearchScreen.tsx` — designed shell
- `src/screens/BlogScreen.tsx` — designed shell
- `src/screens/auth/LoginScreen.tsx` — full restyle
- `src/screens/auth/SignupScreen.tsx` — full restyle
- `package.json` / `app.json` — expo-linear-gradient install

**Create:**
- `src/components/CategoryBadge.tsx` — new reusable coloured badge component

---

## 16. Out of Scope

- Real cover photo upload — Phase 5
- Map pin styling — Phase 5 (map view)
- Explore destination pages with real data — Phase 10+
- Search results with real data — Phase 7
- Blog cards with real drafts — Phase 8
- Any new navigation routes or backend changes
- Animations beyond the existing shimmer
