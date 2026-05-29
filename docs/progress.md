# Into Your Stories — Project Progress

**Last updated:** 2026-05-28  
**GitHub:** https://github.com/rutvijdhotey/into-your-stories  
**Status:** Phase 8 (Trip Map tab) complete ✅ — merged to `main` 2026-05-28. 135 tests passing. Next: Phase 9 (Blog generation).

---

## ⚠️ Supabase Credentials Setup

> **DONE:** Credentials have been safely moved to `.env` file and `.env` is ignored by git.

---

## What This App Is

A voice-first travel memory and community app. Travelers capture notes, photos, and places on the go; when a trip ends, Claude drafts a polished blog post in their writing style. Published stories appear in a community discovery feed organized by destination — so anyone can learn about a place through other travelers' real experiences.

**Two jobs in one:** personal travel organizer on the go + community platform where finished stories help other travelers discover restaurants, spots, and experiences from people who were actually there.

---

## What's Been Built So Far

| Artifact | Location | Status |
|---|---|---|
| Original design spec | `docs/superpowers/specs/2026-05-05-travel-diary-app-design.md` | ✅ Superseded |
| **Updated design spec** | `docs/superpowers/specs/2026-05-06-into-your-stories-design.md` | ✅ **Current** |
| UI mockups (8 screens, dark mode) | `docs/superpowers/specs/travel-diary-ui-mockups.html` | ✅ Complete (needs update for new screens) |
| Phase overview | `docs/superpowers/plans/phases-overview.md` | ✅ Complete |
| Phase 1 plan | `docs/superpowers/plans/2026-05-06-phase-1-scaffold-auth.md` | ✅ Written |
| Expo project scaffold | repo root | ✅ Done (Task 1) |
| Dependencies installed | `package.json` | ✅ Done (Task 2) |
| Theme constants | `src/theme/index.ts` | ✅ Done (Task 3) |
| Supabase client | `src/lib/supabase.ts` | ✅ Done (Task 4) |
| Navigation types | `src/navigation/types.ts` | ✅ Done (Task 5) |
| AuthContext | `src/contexts/AuthContext.tsx` | ✅ Done (Task 6) |
| Placeholder screens (4) | `src/screens/` | ✅ Done (Task 7) |
| TabNavigator | `src/navigation/TabNavigator.tsx` | ✅ Done (Task 8) |
| Login + Signup screens | `src/screens/auth/` | ✅ Done (Tasks 9–10) |
| AppNavigator | `src/navigation/AppNavigator.tsx` | ✅ Done (Task 11) |
| App.tsx wired | `App.tsx` | ✅ Done (Task 12) |
| **Phase 2 plan** | `docs/superpowers/plans/2026-05-21-phase-2-trip-management.md` | ✅ Written + executed |
| Supabase schema (profiles + trips + pgvector) | `supabase/migrations/00{1,2,2a,3,3a}_*.sql` | ✅ Phase 2 |
| Trip service + pure helpers (TDD, 13 tests) | `src/services/` | ✅ Phase 2 |
| `useTrips` / `useTripDetail` realtime hooks | `src/hooks/` | ✅ Phase 2 |
| UI primitives (TripCard, TripStatusBadge, EmptyState, CreateTripSheet) | `src/components/` | ✅ Phase 2 |
| TripDetail screen + Feed/Map placeholders | `src/screens/trip/` | ✅ Phase 2 |
| MainStack navigation (TripDetail above tabs) | `src/navigation/MainStack.tsx` | ✅ Phase 2 |
| HomeScreen — trips list, create, optimistic delete, sections | `src/screens/HomeScreen.tsx` | ✅ Phase 2 |
| Database types | `src/lib/database.types.ts` | ✅ Phase 2 |
| Jest config + datetimepicker config plugin | `jest.config.js`, `app.json` | ✅ Phase 2 |
| **Phase 3 plan** | `docs/superpowers/plans/2026-05-22-phase-3-note-capture.md` | ✅ Written + executed |
| Phase 3 deps + iOS location permission | `package.json`, `app.json` | ✅ Phase 3 |
| Migration 004 — `notes` table (RLS, `offline_id unique`, realtime) | `supabase/migrations/004_notes.sql` | ✅ Phase 3 |
| Migration 005 — `trips.note_count` triggers | `supabase/migrations/005_trips_note_count.sql` | ✅ Phase 3 |
| `noteHelpers` + tests (categories, validation, relative time) | `src/services/noteHelpers.ts` | ✅ Phase 3 |
| `offlineQueue` + tests (AsyncStorage queue + subscriber) | `src/services/offlineQueue.ts` | ✅ Phase 3 |
| `noteService` (createNote, listNotes, drainQueue) | `src/services/noteService.ts` | ✅ Phase 3 |
| `locationService` (expo-location wrapper) | `src/services/locationService.ts` | ✅ Phase 3 |
| `useNotes` / `useConnectivity` / `useLocation` hooks | `src/hooks/` | ✅ Phase 3 |
| `CategoryPicker` / `TripSelector` / `NoteCard` / `NoteCaptureSheet` / `FloatingCaptureButton` | `src/components/` | ✅ Phase 3 |
| `TripFeedScreen` — real FlatList feed | `src/screens/trip/TripFeedScreen.tsx` | ✅ Phase 3 |
| `MainStack` overlay — FAB + capture sheet + drain triggers | `src/navigation/MainStack.tsx` | ✅ Phase 3 |
| **UI Polish plan** | `docs/superpowers/plans/2026-05-22-ui-polish-design.md` | ✅ UI Polish |
| **UI Polish spec** | `docs/superpowers/specs/2026-05-22-ui-polish-design.md` | ✅ UI Polish |
| Full design system tokens | `src/theme/index.ts` | ✅ UI Polish |
| `CategoryBadge` component | `src/components/CategoryBadge.tsx` | ✅ UI Polish |
| Theme unit tests | `src/theme/__tests__/theme.test.ts` | ✅ UI Polish |
| All screens + components restyled | `src/screens/`, `src/components/`, `src/navigation/` | ✅ UI Polish |

Open `travel-diary-ui-mockups.html` in any browser to see all 8 screens.

---

## Key Decisions (Locked In — Updated 2026-05-06)

### Product
- **Community travel platform.** People document their travels and learn from others'. Monetization secondary.
- **Trip-centric structure.** Everything belongs to a Trip. Multiple trips can be active simultaneously.
- **Capture:** Global floating capture button (accessible from every screen). Push-to-talk + text input. No always-on listening.
- **Offline-first capture:** Save immediately; Claude tags when connectivity returns.
- **Blog generation:** Background job; Claude drafts in user's style; push notification when ready. Uneditable in V1.
- **Style onboarding:** Optional. Builds from user's own published posts over time.
- **Blog post is the atomic unit of public content.** Opt-in publish with strong nudge.
- **Published posts have a real web URL** — readable in any browser, no app required.
- **Multi-user from V1** — community requires multiple accounts.

### Navigation (Tab Bar)
Home · Explore · Search · Blog + Global floating capture button

### Community Features (V1)
- **Explore tab:** destination-first browsing of all published stories; sorted by recency
- **Destination page:** aggregated community map (top) + blog post list (below)
- **Community map:** all Places from all published stories, by destination, filterable by category
- **Published post:** narrative + structured places summary + mini-map + conditional itinerary tab
- **V1 social:** pure read-only. No follow, no profiles, no comments. Author display name on posts only.
- **V2 social:** follow + author profiles + social feed

### Tech Stack
| Layer | Choice |
|---|---|
| Frontend | React Native (Expo), iOS first |
| Web (public posts) | Server-side rendered web view for real web URLs |
| Backend / Auth | Supabase (Postgres, auth, file storage, pgvector, RLS) |
| Voice | iOS Native STT (SFSpeechRecognizer) — free, on-device |
| AI | Claude API only — claude-sonnet-4-6 |
| Image understanding | Claude Vision |
| Semantic search | Cohere Embeddings + pgvector (personal notes + community posts) |
| Maps | Apple Maps (react-native-maps) |

### Design
- **Dark mode only.**
- **Accent color:** Warm amber `#C8703A`
- **App background:** `#111111`
- **Surface (cards):** `#1C1C1E`

### AI Layer (6 jobs)
1. **Voice transcription + intent detection** — iOS STT transcribes; Claude detects save vs. search; defaults to save on ambiguity
2. **Smart tagging** — Claude assigns category, place name, city on save (or when connectivity returns)
3. **Semantic search** — Cohere embeddings; personal notes + community posts; similarity search at query time
4. **Image understanding** — Claude Vision analyzes imported photos; Claude auto-selects photos for blog
5. **Blog generation** — background job; Claude drafts in user's style with auto-selected photos; push notification on completion
6. **Community aggregated map** — Places from published posts indexed by destination; removed on unpublish

---

## Screens (Updated)

1. **Home** — trip cards (active first), personal Destinations link, "Start new trip" button
2. **Explore** — destination grid (recency-sorted) + "Recently Published" strip; → destination page → post view
3. **Destination page** — community map (top, filterable) + blog post list (below)
4. **Published post view** — hero image, narrative, places summary, mini-map, conditional itinerary tab, web-accessible
5. **Trip Detail: Feed** — chronological notes with category badges + photo thumbnails
6. **Trip Detail: Map** — Apple Maps, categorized pins per trip
7. **Note Capture Sheet** — global bottom sheet; mic + text + photo picker + trip selector (if multiple active)
8. **Search** — unified personal notes + community posts; voice + text
9. **Blog** — your drafts + published posts
10. **Personal Destinations** — your own city history, filterable by category

---

## V1 Scope

**In:** iOS app, multi-user auth (email + password + display name), trip management (multiple active), global floating capture, note capture (voice + text), photo import + EXIF, offline-first capture, AI smart tagging, voice intent detection, map view (per trip), personal destinations view, unified semantic search (personal + community), blog generation (background + push notification), photo auto-selection, optional style onboarding, read-only blog draft, opt-in publish with nudge, real web URL, structured places summary, mini-map on published posts, conditional itinerary tab, blog export (Markdown + HTML), Explore tab, community destination pages, community aggregated map, content moderation (AI pre-screen + user flagging), new user landing on Explore.

**Out (V2+):** Follow + author profiles, social feed, conversational blog editing, comments/likes, Notion integration, video, Android/web app, fact-checker.

---

## Backlog — Self-Contained Future Phases

Small, independently-shippable features noticed during other work. Each is its own phase/branch.

| Feature | Why | Notes |
|---|---|---|
| **Trip cover photo (banner image)** | The trip detail banner currently renders only a deterministic placeholder gradient (`getTripGradient(trip.name)` in `TripDetailScreen.tsx`). The `trips.cover_photo_url` column already exists (`database.types.ts`) but nothing reads or writes it. | **Render:** when `trip.cover_photo_url` is set, show `<Image source={{ uri }} style={StyleSheet.absoluteFill}>` behind the existing dark scrim; fall back to the gradient when null. **Set:** decide the source — (a) auto-use the first photo from the trip's notes (zero new UI), (b) tap banner → `expo-image-picker` → upload to the existing Supabase `photos` bucket → save URL to `cover_photo_url`, or (c) pick from photos already on that trip's notes. Reuse `photoService.uploadPhoto` from Phase 5. No migration needed. |

---

## What's Next

**Phase 1 is complete.** All 12 tasks done; `npx tsc --noEmit` passes clean. Branch: `phase-1/auth-nav`.

| Task | What | Status |
|---|---|---|
| 1 | Expo project scaffold | ✅ |
| 2 | Dependencies installed | ✅ |
| 3 | Theme constants (`src/theme/index.ts`) | ✅ |
| 4 | Supabase client (`src/lib/supabase.ts`) — reads from `.env` | ✅ |
| 5 | Navigation types (`src/navigation/types.ts`) | ✅ |
| 6 | AuthContext (`src/contexts/AuthContext.tsx`) | ✅ |
| 7 | Placeholder screens — Home, Explore, Search, Blog | ✅ |
| 8 | TabNavigator (`src/navigation/TabNavigator.tsx`) | ✅ |
| 9 | Login screen (`src/screens/auth/LoginScreen.tsx`) | ✅ |
| 10 | Signup screen — email + password + display name | ✅ |
| 11 | AppNavigator (`src/navigation/AppNavigator.tsx`) — auth gate | ✅ |
| 12 | App.tsx wired (NavigationContainer + AuthProvider + SafeAreaProvider) | ✅ |

## Phase 2 task summary

| Task | What | Status |
|---|---|---|
| 1 | Supabase migrations dir + README | ✅ |
| 2 | Migration 001 — enable pgvector | ✅ |
| 3 | Migration 002 + 002a — profiles, RLS, trigger, secure-trigger | ✅ |
| 4 | Migration 003 + 003a — trips, RLS, realtime, secure-trigger | ✅ |
| 5 | Generated `database.types.ts` + typed supabase client | ✅ |
| 6 | Jest configured (jest-expo preset) | ✅ |
| 7 | `tripHelpers` (pure, TDD, 13 tests) | ✅ |
| 8 | `tripService` CRUD wrappers | ✅ |
| 9 | `useTrips` realtime hook + optimistic delete | ✅ |
| 10 | `useTripDetail` realtime hook | ✅ |
| 11 | `@react-native-community/datetimepicker` installed | ✅ |
| 12 | `TripStatusBadge` | ✅ |
| 13 | `EmptyState` | ✅ |
| 14 | `TripCard` (long-press hook) | ✅ |
| 15 | `CreateTripSheet` (pageSheet modal + inline date pickers) | ✅ |
| 16+17 | `MainStack` + `TripDetailScreen` + Feed/Map placeholders | ✅ |
| 18 | Functional `HomeScreen` with sections + delete + CTA | ✅ |
| 19 | Manual sim verification (delete-instant fix applied) | ✅ |
| 20 | progress.md + PR | ✅ |

### Phase 2 follow-ups noticed during execution

These got fixed inline; flagging here so future phases keep the muscle memory:
- Supabase advisors flagged `handle_new_user` and `set_updated_at` as security-definer functions exposed via REST. Fixed with `revoke execute` migrations and `set search_path = ''`. New trigger functions in future phases should be locked down the same way from the start.
- `pgvector` extension installed in `public` schema (advisor warns). Move to `extensions` schema in Phase 7 when actually using it.
- `expo install` registered the datetimepicker config plugin in `app.json` — easy to forget to stage. When adding native deps, also `git status` after the install.

## Phase 3 task summary

| Task | What | Status |
|---|---|---|
| 1 | Branch `phase-3/note-capture` + install `expo-location`, `expo-crypto`, `@react-native-community/netinfo` + iOS `NSLocationWhenInUseUsageDescription` | ✅ |
| 2 | Migration 004 — `notes` table (RLS, `offline_id unique`, realtime) | ✅ |
| 3 | Migration 005 — `trips.note_count` insert/delete triggers (hardened search_path + revokes) | ✅ |
| 4 | Regenerate `src/lib/database.types.ts` | ✅ |
| 5 | `noteHelpers` + tests (CATEGORIES, validateContent, formatRelativeTime) | ✅ |
| 6 | `offlineQueue` + tests (AsyncStorage queue + subscriber) | ✅ |
| 7 | `noteService` (createNote, listNotes, drainQueue) | ✅ |
| 8 | `locationService` (expo-location wrapper) | ✅ |
| 9 | `useConnectivity` + `useOnReconnect` hooks | ✅ |
| 10 | `useLocation` hook | ✅ |
| 11 | `useNotes` hook (server + queue merge + realtime) | ✅ |
| 12 | `CategoryPicker` component | ✅ |
| 13 | `TripSelector` component (0/1/many states) | ✅ |
| 14 | `NoteCard` component (shimmer + sync indicator) | ✅ |
| 15 | `NoteCaptureSheet` (pageSheet modal) | ✅ |
| 16 | `FloatingCaptureButton` (FAB) | ✅ |
| 17 | Wire `TripFeedScreen` to `useNotes` (FlatList of NoteCards) + pass `tripId` from TripDetail | ✅ |
| 18 | `MainStack` overlay (FAB + sheet + drain on mount / reconnect / foreground) | ✅ |
| 19 | DB smoke-test via MCP (insert/delete + note_count trigger) | ✅ |
| 20 | Manual iOS simulator verification | ✅ |
| 21 | Update `docs/progress.md` | ✅ |
| 22 | Push branch + open PR into main | ✅ |

### Phase 3 follow-ups noticed during execution

- **`useTrips` channel name collision:** when `NoteCaptureSheet` (always mounted in `MainStack`) and `HomeScreen` both called `useTrips(userId)`, Supabase realtime threw "cannot add postgres_changes callbacks after subscribe()" because both instances shared the same static channel name `trips:${userId}`. Fixed by adding a per-instance `useRef` random suffix. Future hooks that may have multiple consumers should follow this pattern.
- **Horizontal `ScrollView` stretches full height in flex column:** `CategoryPicker` and `TripSelector` chip rows both used a horizontal `ScrollView` without `flexGrow: 0`, causing them to fill the entire remaining height of the capture sheet. Fixed with `style={{ flexGrow: 0 }}` and `alignItems: 'center'` on the content container. Any future horizontal scroll row inside a flex column needs the same guard.
- **Offline airplane-mode test skipped:** Expo Go in the iOS simulator does not allow toggling Airplane Mode from within the app. The queue logic is covered by unit tests and the DB smoke test; a full offline round-trip test requires a device build.
- **Smoke-test trip left in DB:** the MCP smoke test inserted a trip (`87f61a93-7c4d-4ffd-9c50-17e1ef0fae6a`) since no active trips existed. It has no notes and is harmless as dev seed data. Delete with `delete from public.trips where id='87f61a93-7c4d-4ffd-9c50-17e1ef0fae6a'` if it clutters the Home screen.

## Swipe Navigation — Summary (COMPLETE ✅)

**Branch:** `feature/swipe-navigation` → merged to `main` 2026-05-27  
**Plan:** `docs/superpowers/plans/2026-05-27-swipe-navigation.md`  
**Tests:** 64 passed (58 baseline + 6 new)

### What shipped

| Task | What | Status |
|---|---|---|
| 1 | Replace `createBottomTabNavigator` with `PagerView`-based `TabNavigator` — swipe between tabs | ✅ |
| 2 | Add swipe-left-to-navigate gesture to `TripCard` (pan gesture, 80px threshold, slide-off animation) | ✅ |
| 3 | Replace `+` icon button with `＋ New trip` text button in HomeScreen header | ✅ |
| 4 | Fix `npm run ios` — always run pods + patch before build, pass `--no-install` to skip expo's pod install (which wiped patches) | ✅ |
| 5 | Fix `HomeScreen` navigation — drop `getParent()` since `TabNavigator` is now a plain component, not a RN navigator | ✅ |
| 6 | Fix `TripCard` — reset `translateX` to 0 before firing `onPress` so card is in place on back navigation | ✅ |

### Bugs fixed during testing

- **Cards disappearing after swipe:** `translateX` was set to `-500` and never reset. React Navigation keeps HomeScreen mounted; card stayed off-screen on return. Fixed by resetting `translateX.value = 0` before `runOnJS(onPress)()`.
- **Swipe opened nothing:** `navigation.getParent()?.navigate('TripDetail', ...)` silently failed — `getParent()` now points above `MainStack` (no `TripDetail` there) since `TabNavigator` is a plain component. Fixed by calling `navigation.navigate('TripDetail', ...)` directly.
- **`expo run:ios` re-ran pod install, wiping patches:** Added `--no-install` flag and always run `npm run pods` first in the `ios` script.
- **ExpoFont / native module not found:** Worktree `ios/Pods/` was a leftover shell with empty `Manifest.lock`. Fixed by running `npm run pods` in the correct directory.

### `npm run ios` script (permanent fix)

```json
"ios": "npm run pods && LANG=en_US.UTF-8 expo run:ios --no-install"
```

---

### Next session checklist (Phase 6 — AI Smart Tagging)

1. **Branch from `main`** — Phase 5 is merged. Create `phase-6/ai-smart-tagging` from main.
2. Phase 6 wires Claude to auto-assign `category` + `place_name` + `city` to notes when connectivity is available.
3. **iOS pbxproj patches are now automated** — use `npm run pods` (instead of `pod install` directly) and `npm run prebuild:clean` (instead of `expo prebuild --clean`). Script: `scripts/patch-ios-pbxproj.js`. Never run `pod install` or `expo prebuild --clean` naked — always use the npm scripts.
4. **iOS deployment target is 16.4** — set in `app.json` and patched into `project.pbxproj` by the postinstall script.
5. Always build the dev build with `npm run ios` or `npm run ios -- --device` — never `npx expo start` (Expo Go won't have native modules).
6. Supabase project `dcejrbyujfcxartywpis` — if auto-paused, restore via dashboard before starting. MCP prefix: `mcp__7fbbe81e-73f2-44e8-81b3-e04e19180276__*`.
7. `detect-intent` edge function is live; ANTHROPIC_API_KEY secret is set. Model: `claude-haiku-4-5-20251001`.

## Phase 8 — Trip Map Tab (COMPLETE ✅)

**Branch:** `phase-8/trip-map` → merged to `main` 2026-05-28
**Spec:** `docs/superpowers/specs/2026-05-28-phase-8-trip-map-design.md`
**Plan:** `docs/superpowers/plans/2026-05-28-phase-8-trip-map.md`
**Tests:** 135 passed (125 baseline + 10 new `mapHelpers`)

> Supersedes the stale `plan-07-maps-places.md` (assumed a `places` table from a vision pipeline that was never built + a Personal Destinations screen). The real data source is `notes` rows carrying `lat`/`lng`/`category`/`place_name` (written by Phase 7 smart tagging). Personal Destinations remains deferred to its own later phase.

### Architecture — three thin layers

Pure helpers (`src/services/mapHelpers.ts`) hold all map logic that doesn't need a rendered map, so region/filter/projection are unit-tested without native maps. `TripMapScreen` is a thin view that reads notes via the existing `useNotes(tripId)` hook (so the map updates live on Realtime UPDATE), derives pins, and renders Apple Maps. Wiring is a one-line `tripId` pass-through in `TripDetailScreen`. No new tables.

### What shipped

| Task | What | Status |
|---|---|---|
| 1–4 | `mapHelpers` (pure, TDD, 10 tests) — `pinColor`, `toPins`, `countWithoutLocation`, `filterPins`, `regionForPins` (bounding box + 1.4× padding + 0.01 min-delta clamp) | ✅ |
| 5 | `react-native-maps@1.20.1` installed — Apple Maps via `PROVIDER_DEFAULT`, no API key / no config plugin | ✅ |
| 6 | `TripMapScreen` rewrite — dark `MapView`, category-colored `Marker`s, `Callout` (place name + badge + ≤80-char snippet) → `NoteEditSheet`, `CategoryPicker` filter (null = All), no-location count banner, empty state, loading/error mirroring `TripFeedScreen` | ✅ |
| 7 | `TripDetailScreen` passes `tripId` to the Map tab (mounted only when active) | ✅ |
| 8 | Full verification — suite + tsc green, on-device QA passed | ✅ |

### Key decisions

- **Pin color:** `CategoryColors[category].text` (the vivid foreground per the badges); null/unknown → `general`. `Marker.pinColor` takes one color string.
- **Callout text is dark** (`#111111`/`#333333`) — Apple Maps renders callouts in a light bubble, so the app's white-on-dark theme tokens would be invisible there.
- **`region` derived from `filtered`** (not all pins), so filtering reframes the map; when a filter has no matches, the empty state shows.

### Improvements folded in during review

- **`hasLocation` type-predicate** extracted in `mapHelpers` — DRY'd the `lat/lng` null-check shared by `toPins` and `countWithoutLocation` and narrows the type for the projection.
- **Category-aware empty state** — filtering to a category with zero pins now shows `"No {Category} places on the map."` instead of the misleading "capture notes with locations" copy (which is reserved for trips that genuinely have no located notes). Empty-state padding keeps the no-location banner from overlapping the text.

### Gotchas

- **`??` / `||` cannot be mixed without parentheses** (TS5076). The callout title fallback is `place_name ?? (categoryLabel(category) || 'Note')` — the parens are required and also make the precedence explicit.
- **Pure helpers import `FeedItem`/`Note`/`Category` as `import type`** so Jest never loads `supabase` or the native `react-native-maps` module while unit-testing the helpers. No test imports `TripMapScreen`, so the suite never touches native maps.

---

## Phase 7 — AI Smart Tagging (COMPLETE ✅)

**Branch:** `phase-7/ai-smart-tagging` → merged + pushed to `main` 2026-05-28
**Spec:** `docs/superpowers/specs/2026-05-28-phase-7-ai-smart-tagging-design.md`
**Plan:** `docs/superpowers/plans/2026-05-28-phase-7-ai-smart-tagging.md`
**Tests:** 125 passed (111 baseline + 14 new: 9 `taggingHelpers`, 5 `taggingService`)

> Note: numbered "Phase 7" but it implements the **AI Smart Tagging** capability the older docs called "Phase 6". The stale `plan-06-ai-smart-tagging.md` (assumed a vision pipeline / `places` table / `tagging_status='done'`) was superseded by the spec above.

### Architecture

Client-orchestrated, stateless edge function — mirrors `detect-intent`. Every note already saves with `tagging_status='pending'`; nothing drained it before. Now `drainTagging()` queries pending notes, calls the `tag-note` function (Claude Haiku → `{category, place_name, city}` JSON), merges without overriding user/GPS values, writes the row back under the user's RLS auth, and flips status to `complete`. The `useNotes` Realtime `UPDATE` subscription (already present) swaps the `NoteCard` shimmer for the real badge — no new subscription.

### What shipped

| Task | What | Status |
|---|---|---|
| 1 | `taggingHelpers` (pure, TDD) — `validateCategory`, `normalizeSuggestion`, `mergeTags` | ✅ |
| 2 | `tag-note` edge function — Claude `claude-haiku-4-5-20251001` classifier, fence-strip + JSON parse, non-200 on failure; **deployed** to `dcejrbyujfcxartywpis` | ✅ |
| 3 | `taggingService` — `tagNote(note)` + `drainTagging()` (supabase mocked, TDD) | ✅ |
| 4 | `noteService` — `trySync` returns `boolean`; `createNote` kicks a tag pass on successful online sync | ✅ |
| 5 | `MainStack` — `drainTagging()` after `drainQueue()` at all 3 lifecycle triggers (mount / reconnect / foreground) | ✅ |
| 6 | `NoteCard` — renders `📍 place_name` under content when set | ✅ |
| 7 | Full verification — suite + tsc green | ✅ |

### Merge rules (`mergeTags`)

- **category:** keep the user's pick if set; else use AI's (validated to the 6-enum, junk → `general`)
- **city:** keep the GPS-resolved city if set; else use AI's (may be null)
- **place_name:** always take AI's value (no manual source to protect)
- **failure:** non-200 → note stays `pending`, retried next drain — never silently mislabels during an outage

### Fixes found during testing

- **AI categorization was dead on arrival:** the capture sheet pre-selected `category='activity'`, so every note arrived non-null → `mergeTags` always kept it and discarded the AI's category, and the shimmer never showed (`pending && !category`). Fixed: capture sheet defaults (and post-save reset) to `null`; user picks still win. `CategoryBadge`/`CategoryPicker` already handle null.
- **Keyboard couldn't be dismissed:** the multiline note input made Return insert newlines with no dismiss gesture and no scroll wrapper. Wrapped the sheet body in `TouchableWithoutFeedback` → tap any empty area calls `Keyboard.dismiss`; interactive controls keep their own touches.

### Gotchas

- **Jest mock hoisting:** `jest.mock` is hoisted above `const mock* = jest.fn()`, so the factory must reference mocks **lazily through closures** (`invoke: (...a) => (mockInvoke as jest.Mock)(...a)`), not directly — a direct `invoke: mockInvoke` reads the const before init → "is not a function". Cast at the call site to keep `mockResolvedValue` loosely typed (avoids the `never` problem an explicit impl causes).
- **Refinement vs spec:** fence-stripping/`JSON.parse` lives in the edge function (where the raw text is, like `detect-intent`); the client helper is `normalizeSuggestion(data)` validating the already-structured response.
- **Offline note "delay":** notes saved offline reappear after reconnect via the queue-drain + Realtime round-trip — a short delay, working as designed (not a data-loss bug).

---

## Phase 5 — Photo Import (COMPLETE ✅)

**Branch:** `phase-5/photo-import` → merged to `main` 2026-05-28  
**Plan:** `docs/superpowers/plans/2026-05-27-phase-5-photo-import.md`  
**Tests:** 94 passed (64 baseline + 30 new)

### What shipped

| Task | What | Status |
|---|---|---|
| 1 | `expo-image-picker` installed; `NSPhotoLibraryUsageDescription` + `NSCameraUsageDescription` added to `Info.plist` | ✅ |
| 2 | `usePhotoPicker` hook — permissions, multi-select (max 5), EXIF extraction | ✅ |
| 3 | `photoHelpers` — `extractExifLocation` (DMS array + iOS decimal), `parseDMS`, `validatePhotoCount` | ✅ |
| 4 | `photoService` — `uploadPhoto` (fetch → arrayBuffer → Supabase storage), `deletePhotos` (best-effort cleanup) | ✅ |
| 5 | Migration 006 — `photo_urls text[]` column on `notes` | ✅ |
| 6 | Migration 007 — Supabase storage RLS policies for `photos` bucket (INSERT/UPDATE/SELECT/DELETE scoped to `{userId}/**`) | ✅ |
| 7 | `NoteCaptureSheet` — 📷 button wired; preview strip with × remove; EXIF GPS overrides live location; offline guard blocks save with photos; real upload error exposed in alert | ✅ |
| 8 | `PhotoStrip` — horizontal strip capped at 3 thumbnails; 3rd tile shows `+N` overflow; tapping opens full-screen paged gallery modal | ✅ |
| 9 | `NoteCard` renders `PhotoStrip` per note | ✅ |
| 10 | `TripFeedScreen` — replaced unbounded `PhotoGrid` header with `PhotoStrip` (same 3-cap + gallery) | ✅ |
| 11 | Default note category set to `activity` | ✅ |

### Bugs fixed during testing

- **iOS crash on picker open:** `NSPhotoLibraryUsageDescription` missing from `Info.plist`. The `photosPermission` in `app.json` plugin config is only applied by `expo prebuild` — bare native files need it added directly.
- **Upload failed (blob):** React Native's `fetch().blob()` cannot be serialised by the Supabase JS storage client. Fixed: `blob()` → `arrayBuffer()`.
- **StorageApiError RLS:** `photos` bucket had no RLS policies (default = fully restricted). Added migration 007 with all four required policies.
- **EXIF GPS ignored on iOS:** iOS converts DMS → decimal before handing EXIF to `expo-image-picker`, so `GPSLatitude` arrives as a `number`. The old code only handled DMS arrays and returned `null`. Fixed: `extractExifLocation` now handles both decimal and DMS.
- **Feed showed all photos:** `TripFeedScreen` used `PhotoGrid` as `ListHeaderComponent` which rendered every photo from every note with no cap. Replaced with `PhotoStrip`.

### Follow-ups / gotchas

- **`expo-file-system` not needed:** `fetch().arrayBuffer()` works in React Native 0.81+ for local `file://` URIs.
- **Supabase migration history out of sync:** local files use sequential names (`006_`, `007_`); remote uses timestamps. Use `npx supabase db query --file <migration> --linked` to apply individual migrations directly when `db push` fails on history mismatch.
- **`upsert` requires both INSERT and UPDATE policies:** Supabase storage `upsert: true` tries INSERT first, then UPDATE on conflict — both policies must exist for the operation to succeed.
- **`PhotoGrid` component is now dead code** — superseded by `PhotoStrip`. Safe to delete.

---

## Phase 4 task summary — Voice + Intent Detection (COMPLETE ✅)

**Branch:** `phase-4/voice-intent` → merged to `main` 2026-05-26  
**Plan:** `docs/superpowers/plans/2026-05-23-phase-4-voice-intent.md`  
**Tests:** 58 passed (38 baseline + 20 new)

| Task | What | Status |
|---|---|---|
| 1 | Install `expo-speech-recognition`, add iOS mic + speech permissions, migrate to dev build | ✅ |
| 2 | `useVoiceRecording` hook — `idle → recording → done/error` state machine, 11 TDD tests, state guards on `start()`/`stop()` | ✅ |
| 3 | `detect-intent` Supabase Edge Function — Claude `claude-haiku-4-5-20251001` binary classifier, markdown-strip fix, deployed to `dcejrbyujfcxartywpis` | ✅ |
| 4 | `voiceService.detectIntent()` — client wrapper with save fallback, 5 TDD tests | ✅ |
| 5 | Wire mic button in `NoteCaptureSheet` — pulsing red ring, partial transcript display, intent routing; `MainStack` `handleSearchIntent` navigates to Search tab | ✅ |

### Phase 4 follow-ups / gotchas

- **iOS pbxproj patches are now automated via `scripts/patch-ios-pbxproj.js`.** Use these npm scripts instead of raw commands:
  - `npm run pods` — replaces `cd ios && pod install`
  - `npm run prebuild:clean` — replaces `npx expo prebuild --clean && pod install`
  - `npm run patch-ios` — one-off re-patch if needed
  - The script applies 5 patches: A (expo-configure-project bash -l -c→bash -l), B (IPHONEOS_DEPLOYMENT_TARGET→16.4), C (LIBRARY_SEARCH_PATHS single-string→list), D (bundler $() substitution), E (EXConstants bash -l -c→bash -l in Pods.xcodeproj). Idempotent — safe to run multiple times.
- **iOS deployment target bumped to 16.4** in `app.json` — required by `expo-speech-recognition` podspec. The patch script keeps `project.pbxproj` in sync.
- **`LANG=en_US.UTF-8` required** for CocoaPods to work on this machine.
- **Edge function model ID:** correct ID is `claude-haiku-4-5-20251001`.
- **Claude returns markdown-wrapped JSON** despite the prompt saying "no markdown". Regex strip added before `JSON.parse` in the edge function.
- **`isFinal` fix:** `expo-speech-recognition` puts `isFinal` on the event object, not the result item.
- **Supabase CLI token:** stored only for the current shell session when run non-interactively. For future deployments, run `npx supabase login` in your own terminal (browser flow) so the session persists.

### Bugs fixed during device testing (2026-05-26)

- **Lag on mic ring:** `requestPermissionsAsync()` was awaited before `setStatus('recording')`, delaying the animation. Fixed by setting status to `'recording'` immediately on tap, then checking permissions.
- **Stuck in "Listening…":** no `end` event handler in `useVoiceRecording` — if recognition ended without a final result (silence, early stop), status stayed `'recording'` forever. Fixed: `end` event resets to `'idle'` if no final result received.
- **`nomatch` event unhandled:** added handler to reset to `'idle'` silently.
- **`interimResults` not set:** added `interimResults: true` so partial transcript shows live while speaking.
- **Stuck in "Thinking…" forever (root cause):** `voice.reset()` was called at the *start* of the intent detection effect, changing `voice.status` and `voice.finalTranscript` (both deps). This triggered the effect cleanup, setting `cancelled = true` before `detectIntent` resolved — so `setIntentLoading(false)` was never called. Fixed: move `voice.reset()` to *inside* `.then()/.catch()` so deps don't change until async work completes.
- **`detectIntent` no timeout:** `supabase.functions.invoke` has no built-in timeout. Added 6-second `Promise.race` deadline with save-intent fallback.
- **Long-press FAB:** added `onLongPress` (350ms) to `FloatingCaptureButton` — opens the sheet and auto-starts recording via `autoRecord` prop on `NoteCaptureSheet`.

### Phase 4 — Merge verification checklist (ALL COMPLETE ✅)

**Automated**
- [x] 58 unit tests pass (`npx jest`) — 20 new tests: 14 for `useVoiceRecording`, 6 for `voiceService`
- [x] TypeScript compiles clean (`npx tsc --noEmit`)
- [x] `npm run ios` builds and installs without errors

**Manual — mic button UX (tested on physical device)**
- [x] Open `NoteCaptureSheet` — mic button visible in the action row
- [x] Tap mic → button transitions to recording state (pulsing red ring animation — instant, no lag)
- [x] Speak any phrase → partial transcript text appears live while recording
- [x] Tap mic again to stop → recording stops, intent detection runs, button returns to idle
- [x] Transcript fills text input field (save intent) or sheet closes + Search tab opens (search intent)
- [x] Long-press `+` FAB → sheet opens and recording starts immediately

**Edge function smoke test**
- [x] `detect-intent` returns `{ "intent": "save" }` for save-style inputs
- [x] `detect-intent` returns `{ "intent": "search" }` for search-style inputs

---

## UI Polish Phase — Summary (COMPLETE ✅)

**Merged:** directly to `main` 2026-05-23 (21 files, 3187 insertions). No PR — merged locally after manual sim verification.  
**Plan:** `docs/superpowers/plans/2026-05-22-ui-polish-design.md`  
**Spec:** `docs/superpowers/specs/2026-05-22-ui-polish-design.md`

### What shipped

| Task | What | Status |
|---|---|---|
| 1 | Install `expo-linear-gradient` | ✅ |
| 2 | Extend `src/theme/index.ts` — TDD (CategoryColors, TripGradients, getTripGradient, Shadows, BorderRadius, Typography.label) | ✅ |
| 3 | `CategoryBadge` component | ✅ |
| 4 | `TripStatusBadge` — 3-case colours (active green, overdue red, completed white-tint) | ✅ |
| 5 | `TabNavigator` — Ionicons tab icons, headerShown: false | ✅ |
| 6 | `FloatingCaptureButton` — LinearGradient + amber glow shadow | ✅ |
| 7 | `TripCard` — full gradient card (getTripGradient + scrim overlay) | ✅ |
| 8 | `NoteCard` — uses CategoryBadge, tightened sizing | ✅ |
| 9 | `TripSelector` — card-style redesign (single card / multi-scroll) | ✅ |
| 10 | `NoteCaptureSheet` — mic stub, OR divider, restyled input + action row | ✅ |
| 11 | `EmptyState` — emoji prop, bolder heading, full-width CTA | ✅ |
| 12 | `HomeScreen` — amber eyebrow header, section labels, removed bottom CTA bar | ✅ |
| 13 | `TripDetailScreen` — LinearGradient header with trip gradient | ✅ |
| 14 | `ExploreScreen` — designed shell (search bar + empty state) | ✅ |
| 15 | `SearchScreen` — designed shell (search bar + section headers) | ✅ |
| 16 | `BlogScreen` — designed shell (Drafts + Published + Generate Blog stub) | ✅ |
| 17 | `LoginScreen` — full restyle (brand header, amber focus borders) | ✅ |
| 18 | `SignupScreen` — full restyle (brand header, amber focus borders) | ✅ |

### Design system additions (`src/theme/index.ts`)

- **`CategoryColors`** — bg tint + foreground text per category (food, stay, activity, shopping, to-visit, general)
- **`TripGradients`** — 8 dark gradient pairs; `getTripGradient(name)` deterministically picks one from trip name hash
- **`Shadows`** — `card` + `fab` presets
- **`BorderRadius`** — `card: 16`, `sheet: 24`, `pill: 999`, `input: 12`, `button: 13`
- **`Typography.label`** — uppercase label style (11px, 800 weight, letterSpacing 1)
- **`Colors.textTertiary`** — `#555555`
- **New dep:** `expo-linear-gradient`, `@expo/vector-icons` (explicit)

## Setup gotchas hit on 2026-05-21 (record so we don't re-hit)

- **Xcode 17 needed an iOS simulator runtime download** — fresh installs don't ship with one. Settings → Platforms (or Components on older Xcode) → download iOS runtime.
- **`babel-preset-expo` was missing from devDependencies** in the scaffold. Fixed via `npx expo install --fix`, which also aligned `jest`, `jest-expo`, `@types/jest` to SDK-54-compatible versions.
- **peer-dep conflict** between `react@19.1.0` (Expo SDK 54) and `react-test-renderer@19.2.0` (pulled by `@testing-library/react-native`). Workaround: `npm install --legacy-peer-deps` whenever installing new deps. Proper fix later: pin `react-test-renderer` to `19.1.0`.
- **Supabase free tier auto-pauses** after ~7 days of inactivity. Restore via dashboard before resuming dev.

**Note:** UI mockups and phase plans were written before the community features design session. They'll need a pass before Phase 3+ but Phase 1 scope (scaffold + auth) is unaffected.

---

## Out-of-Scope Context

This app is part of a broader travel passive income project. Other products in the pipeline:
- ✅ Notion Packing List Template (complete, pending Gumroad publish)
- Photography Presets Pack (not started)
- Destination Itinerary PDFs (not started)
