# Into Your Stories — Project Progress

**Last updated:** 2026-05-22  
**GitHub:** https://github.com/rutvijdhotey/into-your-stories  
**Status:** Phase 3 merged ✅ — PR #3; manual sim verified 2026-05-22. Next: Phase 4 (Voice + Intent).

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

### Next session checklist (Phase 4)

1. Plan exists at `docs/superpowers/plans/plan-04-voice-intent.md` — same prep pattern: freshness-check + numbered execution plan + new branch `phase-4/voice-intent`.
2. Phase 3 left these stubs in `NoteCaptureSheet`: mic button (🎙️) + photo picker icon (📷). Phase 4 wires the mic to iOS Native STT + Claude intent detection.
3. Notes save with `tagging_status = 'pending'`; NoteCard shows a shimmer where the AI category badge will appear. AI smart tagging lands in Phase 6.
4. Supabase project `dcejrbyujfcxartywpis` — if auto-paused, restore via dashboard before starting Phase 4. MCP prefix: `mcp__7fbbe81e-73f2-44e8-81b3-e04e19180276__*`.

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
