# Into Your Stories — Project Progress

**Last updated:** 2026-06-22  
**GitHub:** https://github.com/rutvijdhotey/into-your-stories  
**Status:** Itinerary mini-map + stale-generation sweep (0c follow-ups) **implemented on `feature/itinerary-map-and-sweep`** 2026-06-22 — device QA pending. tsc clean, 289 tests passing. Itinerary view now shows an overview map above the day cards (`ItineraryMap`, category-colored pins + callouts; reuses `mapHelpers` via a generalized `regionForPins(LatLng[])` + a type-narrowing `stopsWithCoords` helper). Server-side reliability backstop: migration `015_blog_posts_stale_sweep.sql` enables `pg_cron` and schedules `sweep-stale-blog-posts` (every 5 min) to mark any `generating` post older than 5 min as `error` (verified live: job active, predicate dry-run empty). Spec/plan: `docs/superpowers/{specs,plans}/2026-06-22-itinerary-map-and-sweep*`. Prior: Itinerary creation from blog (0c) **merged to `main`** (PR #11) 2026-06-22 — **on-device QA passed** (France: 5-day itinerary generated in ~54s, Story/Itinerary toggle confirmed). tsc clean, 289 tests passing; migration `014_blog_posts_itinerary.sql` applied to Supabase (`itinerary jsonb` verified live); `generate-blog` redeployed **v9** (ACTIVE). Includes a perf+reliability fix folded in during QA: photo-heavy generation was exceeding the edge wall-clock and silently dying — fixed by batching vision-photo download/resize (concurrency 5) + lowering `MAX_VISION_PHOTOS` 30→15, plus `isStaleGenerating` so a stalled run falls back to a retry path instead of an infinite spinner. Spec `docs/superpowers/specs/2026-06-21-itinerary-from-blog-design.md`, plan `docs/superpowers/plans/2026-06-21-itinerary-from-blog.md`. See feature summary below. Prior: Move notes between trips (0b) **merged + pushed to `main`** (merge `c7cec36`) 2026-06-21 — on-device QA passed; branch deleted. tsc clean, 275 tests passing; migration `013_notes_move_between_trips.sql` applied to Supabase + `note_count` integrity verified live. Prior: UI updates + vision photo editor + editor-brain **merged to `main`** (merge `0287fd3`) 2026-06-21 — on-device QA passed; tsc clean, 269 tests; `generate-blog` redeployed v7. Prior: Trip-aware location inference **merged to `main`** (PR #10, merge `5999f8b`) 2026-06-20. Prior: Note card location display fix + smarter `place_name` resolution + backfill **merged to `main`** 2026-06-09. Prior: Note date from photo EXIF **merged to `main`** (6-task plan). Prior: Blog generation reliability fixes merged 2026-06-10 (commit `fab6e91`). Prior: "View Blog" button merged 2026-06-09 (commit `fdcf2c8`). Prior: Background photo upload + offline photo capture merged 2026-06-05.

**Roadmap re-scoped 2026-06-21 (grill-me session — V1/V2 split; see `memory/backlog_priority.md`).** V1 build order: (1) ~~Move notes between trips (0b)~~ ✅ DONE, (2) ~~Itinerary creation from blog (0c)~~ ✅ IMPLEMENTED (on `feature/itinerary-from-blog`, device QA pending), **(3) Ratings (#8) — NEXT** — `rating` on `notes`, star UI on food/stay/activity/shopping, feeds the public aggregate, (3.5) Venue-name resolution fix — precursor to the public layer (see backlog row), (4) Public layer (#3 Explore + #4 privacy together) — anonymized-aggregate `public_places` table (`visit_count`/`avg_rating`/`rating_count`), category-gated, global opt-out, trip-end only, metadata-only Explore grid + community map. **V2:** public blog reader + real web URLs, semantic search, style onboarding, personalize blog voice (#6), editable blog draft (#7), cover-photo polish (#9), Siri hands-free (#10), content moderation.

**UI updates + vision photo editor + editor-brain (DONE ✅ — merged to `main` 2026-06-21, merge `0287fd3`, on-device QA passed; branch deleted):** Spec `docs/superpowers/specs/2026-06-20-ui-updates-and-vision-editor-design.md`. Brainstormed → spec → implemented one item at a time. tsc clean, 269 tests passing (was 265). Four items:

1. *Completed badge contrast (commit `d237721`):* the `completed` `TripStatusBadge` used a translucent white pill (`rgba(255,255,255,0.2)`) with white text — invisible over light photos. Changed to an opaque dark slate (`rgba(28,28,30,0.92)`); white text now reads on any background. Only the `completed` branch of `bgColor` changed.

2. *Photo limit 5 → 3 (commit `3294eeb`):* `MAX_PHOTOS_PER_NOTE` (the single source of truth in `usePhotoPicker.ts`, drives both capture + edit sheets and the "limit reached" alerts) lowered to 3. Updated three tests that hardcoded 5 (picker `selectionLimit`, the two NoteEditSheet cap scenarios). Also acts as the cost ceiling for the vision pass below.

3. *Vision-based photo editor in `generate-blog` (commit `759bf3a`):* the function previously sent photo **URLs as text** and asked Claude to pick "the strongest" blindly. Now upgraded to **`claude-opus-4-8`** (was `claude-sonnet-4-6`) with **multimodal input** — `buildUserContent` interleaves each note's text with its actual photos as base64 image blocks, each labeled with its exact original URL, so Claude judges photos **by sight** (best-per-note, a handful overall, cover from those). Output JSON shape unchanged. **Downsize-for-vision-only:** `fetchResizedImageBlock` downloads each photo, resizes to ~1536px (`imagescript`), JPEG-encodes (q80), base64s it — purely the model's "eyes"; the blog always embeds the **original full-res URLs** (Claude only emits URL strings, never image data). Bounded by `MAX_VISION_PHOTOS = 30`, processed sequentially for edge-function memory safety; undecodable formats (e.g. HEIC) or fetch failures fall back to a text-only URL reference so the photo stays selectable. Photo URLs are public (`getPublicUrl`), so Claude could otherwise fetch them — but free-tier has no Supabase image transforms, hence the in-function resize. Est. cost ~$0.12–0.65/blog (image-token dominated), once per generation in the background.

4. *Editor brain — readiness gate + flexible length (commit `7c86f56`):* two-tier "not enough info" handling plus soft length. **Local gate (app, free, instant):** `checkBlogReadiness` (`blogHelpers.ts`, `MIN_NOTES_FOR_BLOG = 3`, `MIN_NOTE_TEXT_CHARS = 80`) blocks generation before invoking the function — wired into **both** call sites (`TripDetailScreen.handleGenerateBlog` + `BlogScreen`), alerting "Add at least 3 notes…" / "Your notes are a little thin…". **Server gate (LLM fallback):** if notes clear the floor but are still too thin to write a genuine post, the model returns `{"insufficient": true, "reason": …}`; the function writes a new **`status: 'insufficient'`** row (reason in `error_message`) — distinct from `error` (nothing failed). New migration **`blog_posts_insufficient_status`** widens the `blog_posts_status_check` CHECK to include `insufficient` (**applied to Supabase + verified** via `pg_get_constraintdef`). Client: `BlogStatus` union + `statusLabel('insufficient') → 'Not enough notes'`, and `BlogPostScreen` renders the `insufficient` status as a calm message (not the red error treatment). **Flexible length:** `SYSTEM_PROMPT` now guides ~600–1200 words for a typical trip, up to ~2000 for rich trips, one section per city/day, never padding thin material — no hard cap (`max_tokens` 16000 stays a ceiling).

**Deploy (done via Supabase MCP, project `dcejrbyujfcxartywpis`):** migration applied + constraint verified; `generate-blog` redeployed **v6 → v7** (ACTIVE, `verify_jwt: true`). The successful Deno build doubles as the type-check for the new `imagescript`/`base64` imports (Deno isn't installed locally). **On-device QA passed (2026-06-21)** — exercised normal-trip generation (curated full-quality photos), the local note-count block, the sparse-trip `insufficient` screen (round-trips via realtime), and a photo-heavy trip (completes inside the 140s window). Merged to `main`.

**Trip-aware location inference (DONE ✅ — merged to `main` 2026-06-20, PR #10 / merge `5999f8b`, on-device QA passed):** Spec `docs/superpowers/specs/2026-06-10-trip-aware-location-inference-design.md`, plan `docs/superpowers/plans/2026-06-10-trip-aware-location-inference.md`, executed task-by-task via subagent-driven-development (spec + quality review per task + final whole-branch review). New `notes.location_source` provenance column (`'gps' | 'exif' | 'manual' | 'inferred'`, migration `011_notes_location_source.sql`, **applied to Supabase**). A trip's *anchors* = forward-geocoded `trips.destinations` + coords of trusted (`exif`/`manual`) notes; a GPS fix is plausible within 200 km of any anchor (`ANCHOR_PLAUSIBLE_KM`, `tripAnchorHelpers.ts`). `NoteCaptureSheet` checks the live fix against anchors as soon as fix + trip are known — the location pill shows the inferred anchor city, and save substitutes the nearest anchor (`location_source: 'inferred'`) when GPS is implausible; EXIF and manual paths untouched. `tripAnchorService` memoizes anchors per session (empty results not cached; cache invalidated for a trip after a manual location edit). `locationSweepService.sweepNoteLocations` runs on launch *before* `backfillPlaceNames`: rewrites outlier `gps`/legacy notes to the nearest anchor, upgrades plausible legacy notes to `'gps'`, never touches `exif`/`manual`. Known accepted limitation (documented in code): an `'inferred'` rewrite is one-way; recovery is a manual edit. 265 tests (31 new), tsc clean. **QA note:** corrected pins may visibly move on first launch after install — that's the sweep working, not a bug.

**Note date from photo EXIF (DONE ✅ — merged to `main`):** Plan at `docs/superpowers/plans/2026-06-05-note-exif-date.md`, executed task-by-task via subagent-driven-development with spec + code-quality review on each task. `extractExifDate` (photoHelpers.ts) parses EXIF `DateTimeOriginal` to ISO 8601; `PickedPhoto.exifDate` surfaces it from `usePhotoPicker`; new nullable `notes.occurred_at` column (migration `010_notes_occurred_at.sql`, applied); threaded through `PendingNote` → `createNote` → `drainQueue`; `NoteCaptureSheet` derives `earliestExifDate` from picked photos and passes it as `occurred_at`; `useNotes`' `mergeFeed` sorts by `occurred_at ?? captured_at`. All 6 tasks reviewed and approved, 223/223 tests passing, tsc clean.

**Note card location display + smarter `place_name` resolution (DONE ✅ — merged to `main`):**

1. *Duplicate location display fix:* `NoteCard.tsx` showed location twice — `note.city` top-right next to the timestamp, and `note.place_name` below the note text with 📍. Removed `city` (and `pending.city`) from the header meta line; header now shows only the relative time. `place_name` remains the single location indicator below the text.
2. *Smarter `place_name` resolution:* `reverseGeocodePlace(lat, lng)` (`locationService.ts`) does one `reverseGeocodeAsync` call returning `{ city, placeName }`, where `city = city ?? subregion ?? region` and `placeName = name ?? street ?? city ?? subregion ?? region` (always at least as specific as city, often a POI/street). `LocationFix` (from `getCurrentLocation`) now carries `placeName`. `NoteCaptureSheet`'s EXIF-coords reverse-geocode effect now captures `placeName` alongside `city`; in `handleSave`, the `auto` patch passed to `resolveLocationEdit` sets `place_name` from the resolved value (was hardcoded `null`), falling back EXIF → live GPS like `city`/`lat`/`lng` already do. Manual edits are unchanged — typed text still wins.
3. *Backfill (existing notes):* `backfillPlaceNames(userId)` (`placeBackfillService.ts`) queries the current user's notes where `place_name IS NULL AND lat/lng IS NOT NULL`, resolves each via `reverseGeocodePlace` in batches of 5 with a short delay, and writes back `place_name` (and `city` if it was null). Runs once on app launch from `MainStack`, gated on `userId`. No new UI, no new API keys, no DB migration (`place_name` already existed). Naturally resumable/idempotent — already-backfilled notes drop out of the query.

tsc clean, full suite passing (234 tests).

**Itinerary creation from blog (0c) (IMPLEMENTED ✅ — on `feature/itinerary-from-blog`, on-device QA pending, not yet merged):** Spec `docs/superpowers/specs/2026-06-21-itinerary-from-blog-design.md`, plan `docs/superpowers/plans/2026-06-21-itinerary-from-blog.md`. Executed task-by-task via subagent-driven-development. 283 tests passing (was 275; +8 across `parseItinerary` and `ItineraryView`), tsc clean. `generate-blog` redeployed **v8** (ACTIVE), migration `014_blog_posts_itinerary.sql` applied + column verified live.

A day-by-day itinerary derived from a trip's notes, produced by Claude in the **same generation call** as the narrative and stored in a new nullable **`itinerary jsonb`** column on `blog_posts`.

1. *Data model (migration `014`):* `itinerary jsonb` (nullable; `null` = no itinerary). Shape = `ItineraryDay[]`, each day `{ day, date, title, stops[] }`, each stop `{ time_of_day: 'morning'|'afternoon'|'evening'|null, place_name, category, description, lat, lng }`. Coords are stored for a future mini-map (not rendered in this slice).

2. *Generation + deterministic gate (`generate-blog/index.ts`):* the function selects `occurred_at`, then counts distinct calendar days (by `occurred_at ?? created_at`) that contain a **located + named** note; if `≥ MIN_ITINERARY_DAYS` (3) it instructs Claude to produce the itinerary, otherwise it tells Claude to set `itinerary: null` and forces `null` defensively. `SYSTEM_PROMPT` gained the `itinerary` field + rules (coarse part-of-day buckets, never invent stops). **Itinerary is supplementary, never fatal** — a malformed/missing itinerary stores `null` but the narrative still saves as `draft`.

3. *Client parse + render:* new TDD-tested `parseItinerary` helper in `blogHelpers.ts` (narrows the jsonb, drops malformed days/stops, returns `null` if nothing valid remains) + `Itinerary`/`ItineraryDay`/`ItineraryStop`/`TimeOfDay` types. New `ItineraryView` component renders day cards (day · date · title, stops grouped by Morning/Afternoon/Evening with `CategoryBadge` + place + description). `BlogPostScreen` shows a **Story / Itinerary segmented toggle** at the top — only when a valid itinerary exists and status is `draft`/`published`; default view is Story.

**Deferred (noted, not built):** itinerary mini-map, itinerary in export, editing the itinerary. **Next:** on-device QA (multi-day located trip → toggle + day cards; sparse trip → no toggle), then merge.

**Blog generation reliability fixes (DONE ✅ — merged to `main` 2026-06-10):** Two related bugs found via on-device QA on the "View Blog" feature.
1. *Stuck on "View Blog" after a failed generation:* if `generate-blog` set a post to `status: 'error'`, `getBlogPostByTrip` still returned that row, so `TripDetailScreen` showed "View Blog" pointing at a dead post — and the user could no longer find "Generate Blog" to retry. Fixed in `TripDetailScreen.tsx`: `existingPostId` is now `null` when the latest post's `status === 'error'`, so "Generate Blog" reappears.
2. *Generation aborted/truncated on longer trips:* `error_message` showed "The signal has been aborted" (90s `AbortController` timeout hit before Claude finished) and, after raising the timeout, "Unterminated string in JSON at position …" (response truncated at the old `max_tokens: 8192`). Fixed in `supabase/functions/generate-blog/index.ts`: abort timeout raised to 140s, `max_tokens` raised to 16000, deployed as v6.
3. *Photo curation:* clarified `SYSTEM_PROMPT` so Claude picks only a handful of the strongest photos overall — even if every note has a photo — rather than one per note.

No DB migration. Edge function `generate-blog` redeployed (now v6).

**View Blog button after generation (DONE ✅ — merged to `main` 2026-06-09):** Once a blog post exists for a completed/ended trip, `TripDetailScreen` no longer offers "Generate Blog" again — it shows a "View Blog" button that navigates straight to the existing post. New `getBlogPostByTrip(tripId)` in `blogService.ts` queries `blog_posts` by `trip_id` (most recent, ordered by `created_at`). `TripDetailScreen` fetches this on mount for non-active trips and tracks `existingPostId: string | null | undefined` (undefined = loading, null = none, string = post id); `handleGenerateBlog` also sets it after a fresh generation. No DB migration.

**Background photo upload + offline photo capture (DONE ✅ — merged to `main` 2026-06-05):** Notes now save instantly with no upload blocking. `photoUploadQueue.ts` (AsyncStorage-backed, same shape as `offlineQueue`) holds `PendingPhotoUpload` items. `photoUploadService.drainPhotoUploads()` uploads each item, patches `notes.photo_urls` via Supabase after all items for a note are resolved, and increments `attempts` on failure (max 5 → `status: 'failed'`). `noteService.drainAll()` sequences `drainQueue → drainPhotoUploads → drainTagging` so note rows always exist before photo drain runs. `PendingNote` gains `photo_uris: string[]` so pending cards show real local images. `useNotes` subscribes to both queues and derives `photoStatus` per note (`'uploading' | 'failed' | null`). `NoteCard` shows a shimmer strip while uploading, `⚠ N photo failed` on failure. `NoteEditSheet` enqueues new photos and closes immediately after `updateNote`. `NoteCaptureSheet` drops the upload loop, photo-offline guard, and `photosBlockSave` state (~40 lines removed). `MainStack` wires the AppState foreground drain. 17 new tests (214 total). No DB migration.

**Trip cover photo (DONE ✅ — merged to `main` 2026-06-04):** User picks + crops a photo from the device library to set the trip banner; tap the camera icon for a Choose/Remove menu. New units: `useCoverPhoto` hook (pick→upload→save / remove + busy), `photoService.uploadCoverPhoto` (stores at `userId/trip-covers/tripId.jpg` with a `?v=` cache-buster), `tripService.updateCoverPhoto`, shared `photoHelpers.ensureMediaLibraryPermission`. Banner refresh is free via `useTripDetail`'s realtime subscription. The cover also renders on the **Home `TripCard`** (photo replaces the gradient, scrim preserved; gradient stays the fallback) — `listTrips` already selects `cover_photo_url`, so `useTrips`' realtime subscription refreshes the home card live too (`TripCard.render.test.tsx`). **Known constraint:** iOS `expo-image-picker` `allowsEditing` only crops square (ignores custom aspect), so the user frames a square and the banner center-crops it via `resizeMode="cover"`; true banner-ratio crop would need `expo-image-manipulator` (out of scope). **Follow-up idea:** on iOS, swap the `Alert.alert` cover menu for `ActionSheetIOS` (matches HomeScreen's idiom) — non-blocking polish.

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
| ~~**Trip cover photo (banner image)**~~ ✅ **DONE 2026-05-30** | The trip detail banner only rendered a placeholder gradient; `trips.cover_photo_url` existed but was unused. | Shipped option (b)+crop on `feature/trip-cover-photo`: camera icon → `expo-image-picker` (single, `allowsEditing`) → `uploadCoverPhoto` (path `userId/trip-covers/tripId.jpg`, `?v=` cache-buster) → `updateCoverPhoto` writes the column; banner renders `<Image resizeMode="cover">` over the scrim, gradient fallback. Action menu adds Remove. New: `useCoverPhoto` hook, `ensureMediaLibraryPermission`. iOS square-crop constraint accepted (see Status). **Follow-up fix (2026-06-04):** the Home `TripCard` ignored `cover_photo_url` and only drew the gradient, so a set cover showed in the detail banner but not on Home; `TripCard` now renders the cover image (photo replaces gradient, scrim preserved, gradient fallback) + `TripCard.render.test.tsx`. Spec/plan: `docs/superpowers/{specs,plans}/2026-05-30-trip-cover-photo*`. 197 tests, tsc clean. |
| ~~**Remove dead `PhotoGrid` component**~~ ✅ **DONE 2026-05-30** | `src/components/PhotoGrid.tsx` was superseded by `PhotoStrip` in Phase 5. | Deleted on `backlog/remove-dead-photogrid` after confirming no references via `grep -r PhotoGrid src`. tsc clean, 180 tests still pass. |
| **Personalize blog voice from the user's own writing style** | Phase 9's `generate-blog` edge function uses a generic "clear, warm, first-person travel-writing voice"; style onboarding was explicitly out of scope. The user's actual travel voice is documented (first-person, warm/sincere, "perhaps… perhaps…" repetition, subject-named-last sentences — see their site https://intoyourstories.wixsite.com/home). | Feed a style profile into the `SYSTEM_PROMPT` of `supabase/functions/generate-blog/index.ts` so drafts sound like the author. Source options: (a) seed from the user's published posts (the spec's `style_profiles` idea), or (b) a short hand-written style guide. Likely its own spec → plan cycle alongside the broader "style onboarding" feature the Phase 9 spec defers. No migration strictly required for a single default profile. |
| ~~**Editable location on note capture** (QA #2, 2026-05-29)~~ ✅ **DONE 2026-05-30** | Capture auto-filled location from GPS/EXIF but the user could not correct it (e.g. an edited photo with wrong EXIF dropped the note in the wrong city + wrong map pin). | Shipped on `backlog/editable-note-location`. See "Editable Note Location (COMPLETE ✅)" section below. |
| **Editable + croppable blog & cover image** (QA #4, 2026-05-29) | Phase 9 ships the draft as **fully read-only** by explicit design decision; the spec defers the photo-override screen and conversational editing. Users want light edits — tweak the draft text and crop/replace the cover. | Its own spec → plan cycle. Likely: (a) an editable markdown/title editor writing back to `blog_posts.content_markdown`/`title`; (b) cover crop/replace via `expo-image-picker` (`allowsEditing`) or `expo-image-manipulator`, choosing from the trip's existing photos or a new upload, saving to `cover_photo_url`. Reverses the read-only stance, so treat as a deliberate scope expansion, not a patch. |
| **Trip cover photo polish** (deferred 2026-06-04) | Two non-blocking nits left after the cover-photo feature shipped. (1) The cover action menu uses `Alert.alert` in `TripDetailScreen.handleEditCover`; HomeScreen's idiom is `ActionSheetIOS` — inconsistent. (2) iOS `expo-image-picker` `allowsEditing` only crops square, so a banner-shaped cover is achieved by center-cropping a square via `resizeMode="cover"` — not a true banner-ratio crop. | (1) Swap the `Alert.alert` cover menu for `ActionSheetIOS` to match HomeScreen. (2) For a true banner crop, run the picked image through `expo-image-manipulator` (already a transitive dep candidate) to crop to the banner aspect before `uploadCoverPhoto`, or add a lightweight crop step. Both are independent and small; can ship together or separately. Touches `TripDetailScreen`, `useCoverPhoto`/`photoService`. |
| ~~**Offline photo note capture**~~ → **combined into Priority 2 below** | `NoteCaptureSheet` blocked saving photo notes while offline because photos uploaded synchronously before the note row was created. | Merged into the Background photo upload item — both fix the same root cause. See Priority 2 below. |
| ~~**Voice dictation appends instead of overwrites**~~ ✅ **DONE 2026-06-04** | Second voice dictation replaced the entire content field instead of appending. `NoteCaptureSheet` intent handler called `setContent(transcript)` (clobbers). | Changed to `setContent(prev => prev ? prev + ' ' + transcript : transcript)` in both `.then` and `.catch` branches. Merged on `backlog/voice-dictation-autocorrect`. 197 tests, tsc clean. |
| ~~**Autocorrect spelling in notes**~~ ✅ **DONE 2026-06-04** | `NoteCaptureSheet` and `NoteEditSheet` `TextInput`s had no `autoCorrect` prop, leaving iOS autocorrect off. | Added `autoCorrect` + `autoCapitalize="sentences"` to both inputs. Merged on `backlog/voice-dictation-autocorrect`. |
| ~~**Background photo upload + offline photo capture**~~ ✅ **DONE 2026-06-05** | Photos upload synchronously before the note row saves, blocking the UI. Offline capture with photos is impossible. | Merged to `main` 2026-06-05. Two-queue approach: `photoUploadQueue` + `photoUploadService` alongside `offlineQueue`; notes save instantly with `photo_uris`, photos drain in background via `drainAll()`. `NoteCaptureSheet` loses ~40 lines of upload logic + offline guard. `useNotes` derives `photoStatus` per note; `NoteCard` shows shimmer strip while uploading, `⚠ N photo failed` on failure, local `file://` images on pending cards. Three drain triggers: mount, reconnect, AppState foreground. Spec: `docs/superpowers/specs/2026-06-04-background-photo-upload-design.md`. 214 tests, tsc clean. |
| ~~**Move notes between trips**~~ ✅ **DONE 2026-06-21** | No way to re-assign a note to a different trip if captured under the wrong one. | Shipped on `backlog/move-notes-between-trips`. New `MoveToTripSheet` modal (lists all the user's other trips, confirm-then-move) opened from a "Move to trip…" button in `NoteEditSheet`; thin `moveNote(noteId, newTripId)` service (touches only `trip_id`, NOT via `updateNote` so no tagging re-run); migration `013_notes_move_between_trips.sql` adds an UPDATE branch to `bump_trip_note_count()` (keeps both trips' counts correct) and tightens `notes_update_own` RLS to require the target trip belong to the user. Feed removal via `useNotes.refresh()`. tsc clean, 275 tests; migration applied + note_count integrity verified live. Spec/plan: `docs/superpowers/{specs,plans}/2026-06-21-move-notes-between-trips*`. |
| **Venue-name resolution fix** (precursor to public layer, noticed 2026-06-21) | `note.place_name` is set at capture by the device reverse-geocoder (`reverseGeocodePlace` → `r.name ?? r.street ?? city`), usually a street/area not the venue. Claude's `tag-note` *does* extract the real venue from the note text, but `mergeTags` (`existing.place_name ?? suggestion.place_name`) lets the geocoder's address pre-empt it, so Claude's venue name is discarded — e.g. "dinner at Restaurant A" shows the street "XYZ". | Add a precedence rule **manual > AI-inferred venue > geocoder area**, ideally only overriding when the geocoder returned a weak (street-level) label, not a real POI. Gates the public layer: `place_name` is the `public_places` dedupe key + only public field, so street labels won't dedupe and look useless on the community map. Small brainstorm on precedence rules first. |
| **Note date from photo EXIF** | Notes record `created_at` (server insert time), but photos carry `DateTimeOriginal` and users may mention dates in text. | Extract `DateTimeOriginal` from EXIF (already parsed in `usePhotoPicker`), write to new `occurred_at` column, sort feed by it. |
| **Personalize blog voice** | `generate-blog` uses a generic voice; user's actual travel voice is documented. | Feed a style profile into the edge function `SYSTEM_PROMPT`. Source: user's published posts or a hand-written style guide. Its own spec → plan cycle. |
| **Editable blog draft** | Phase 9 blog draft is read-only by design. | Spec + plan cycle needed. Natural follow-on to blog voice personalization. |
| **Restaurant / place ratings** | No structured way to capture a 1–5 star rating on food/stay notes. | Optional `rating` column on `notes` (migration); star picker in capture/edit for food/stay categories. |
| **Trip cover photo polish** | Two nits: `Alert.alert` instead of `ActionSheetIOS` for cover menu; square-only crop instead of true banner ratio. | (1) Swap to `ActionSheetIOS`. (2) Add `expo-image-manipulator` crop step before upload. Small; can ship together or separately. |
| **Editable + croppable blog cover** | Phase 9 blog cover is read-only. Users want to swap/crop the cover image. | Its own spec → plan cycle. `expo-image-picker` + `expo-image-manipulator`; writes to `blog_posts.cover_photo_url`. |
| **Siri integration** | No hands-free capture via Siri. | Swift `AppIntent` + provisioning capability + Expo config plugin. Full phase on its own. |
| ~~**Trip-aware location inference**~~ ✅ **IMPLEMENTED 2026-06-10 (PR open, QA pending)** | When a note has no usable photo EXIF location, capture falls back to the device's *current* GPS position at save time — which can be wrong for the trip (e.g. a Paris trip note gets tagged "Mountain View" because that's where the device actually was when editing/testing). `place_name`/`city`/`lat`/`lng` then reflect the device, not the story. | Detect notes whose auto-resolved coordinates are inconsistent with the trip's other notes (e.g. far from the trip's centroid) and fall back to a trip-level "home" location instead of raw device GPS — either a `trips` column set at creation, or derived from the median/mode of the trip's other geolocated notes. Consider surfacing a manual-correction prompt for outliers rather than silently substituting. Touches capture flow (`NoteCaptureSheet`), backfill (`placeBackfillService`), possibly a `trips` migration. Needs its own spec → plan cycle (brainstorm first). |

---

## Editable Note Location (COMPLETE ✅)

**Branch:** `backlog/editable-note-location` → merged to `main` (PR #8, merge `aa84425`) 2026-05-30; branch deleted. On-device QA passed.
**Spec:** `docs/superpowers/specs/2026-05-29-editable-note-location-design.md`
**Plan:** `docs/superpowers/plans/2026-05-29-editable-note-location.md`
**Tests:** 180 passed (177 baseline at branch point + 3 new wiring tests; plus new helper/service unit tests folded in along the way). `npx tsc --noEmit` clean.

> First backlog item (QA #2). The user could not fix a note's location when GPS/EXIF was wrong — e.g. an *edited* photo carrying Mountain View EXIF on a Paris trip showed "Mountain View" and dropped its pin in California, with no way to correct it (and `NoteEditSheet` had no location field at all).

### What shipped

| Task | What | Status |
|---|---|---|
| 1 | `resolveLocationEdit` pure helper (`locationHelpers.ts`) — owns all save-time branching (not-edited passthrough / edited-success / geocode-fail drop-pin / cleared→null), 5 TDD tests | ✅ |
| 2 | `geocodeLocation` + `reverseCity` wrappers on `locationService.ts` (mocked `expo-location`, 6 tests) | ✅ |
| 3 | `mergeTags` preserves a manually-set `place_name` (optional `place_name` on `ExistingTags`; call site passes `note.place_name`) so AI re-tagging can't clobber a manual correction | ✅ |
| 4 | `place_name` plumbing through `CreateNoteInput`/`PendingNote`/`trySync`/`drainQueue`; `UpdateNoteInput`+`updateNote` now patch `lat`/`lng`/`city`/`place_name` | ✅ |
| 5 | Shared `LocationField` component (editable pill, "Locating…" affordance) | ✅ |
| 6 | Wired into `NoteEditSheet` — pre-fills `place_name ?? city`, resolves on save (+3 integration tests) | ✅ |
| 7 | Wired into `NoteCaptureSheet` — replaced the read-only pill; auto-fill syncs until the user types; resolves on save; EXIF-over-GPS auto path unchanged when untouched | ✅ |
| 8 | Full verification (tsc + 180 tests green) + final whole-branch code review | ✅ |

### Behavior

Type a location → on save the app forward-geocodes it (coords), reverse-geocodes those coords (clean city), and sets `place_name` to the typed text, so label + map pin + destination grouping all stay consistent. Geocode fail/offline → keep the typed label, drop the bad pin (null coords/city). Untouched → identical to the previous auto GPS/EXIF behavior. Works in both capture and edit-an-existing-note.

### Consciously deferred (from code review)

- Three slightly different "reverse-geocode to city" helpers now coexist (`reverseGeocodeCity` city→subregion→region, `reverseCity` city→district, plus the inline EXIF reverse in `NoteCaptureSheet`). The spec suggested consolidating; left as-is to avoid touching the EXIF path. Low-priority cleanup.

### On-device QA — PASSED ✅ (2026-05-30)

Automated suite + tsc green; manual device checklist passed (capture untouched, edited-photo correction → Paris pin, offline typed label, edit-saved-note correction, clear field, AI-retag preserves manual place). Merged after QA.

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

## Phase 9 — Blog Generation (COMPLETE ✅)

**Branch:** `phase-9/blog-generation` → merged to `main` (no-ff `23ebb92`) + pushed to `origin` 2026-05-29; branch deleted
**Spec:** `docs/superpowers/specs/2026-05-28-phase-9-blog-generation-design.md`
**Plan:** `docs/superpowers/plans/2026-05-29-phase-9-blog-generation.md`
**Tests:** 165 passed (135 baseline + 30 new across `blogHelpers` + `blogService`)
**Supabase:** project `dcejrbyujfcxartywpis` — migrations `008_blog_posts` + `009_realtime_replica_identity` applied; `generate-blog` edge function deployed (v2, JWT + trip-ownership authorized).

> Turns a **completed** trip into a polished, read-only blog draft: Generate → Review → Export. "Publish" is a local status marker only (no public web URL — that waits for the web-layer phase). Re-scopes the stale `plan-09-blog-generation.md`, which assumed tables/pipelines that were never built.

### Architecture — three thin layers

Pure helpers (`src/services/blogHelpers.ts`, `import type` only) hold all logic that needs no Supabase/native modules — `collectPlaces`, `validateBlogResult`, `markdownToHtml`, formatters — so they're unit-tested in isolation. `blogService.ts` is a thin Supabase wrapper (generate/list/get/publish/unpublish/discard). The `generate-blog` edge function (Deno, **service role**) inserts a `generating` row, returns its id immediately, and finishes the ~60s Claude generation via `EdgeRuntime.waitUntil`; Realtime flips the card `generating → draft` with no push infra.

### What shipped

| Task | What | Status |
|---|---|---|
| 1 | Migration `008_blog_posts` — owner-scoped RLS, partial unique index (one active post per trip), `set_updated_at` trigger, Realtime; matching `database.types.ts` entry | ✅ |
| 2–5 | `blogHelpers` (pure, TDD) — `collectPlaces`, `validateBlogResult`, `markdownToHtml` (escapes alt-text), `statusLabel`, `formatBlogDate` | ✅ |
| 6 | `blogService` (Supabase mocked, error paths) — `generateBlog`, `listBlogPosts`, `getBlogPost`, `publishPost`, `unpublish`, `discardDraft` | ✅ |
| 7 | `generate-blog` edge function — `claude-sonnet-4-6`, JWT-derived identity + trip-ownership check, abort timeout (140s as of 2026-06-10, was 90s), no-notes guard, fence-strip+parse, draft/error lifecycle | ✅ |
| 8 | Deps (`react-native-markdown-display`, `expo-sharing`, `expo-file-system`) + `BlogPost` route on `MainStack` | ✅ |
| 9 | `useBlogPosts` Realtime hook (per-instance channel suffix) | ✅ |
| 10–11 | `BlogPostCard` + `BlogPostScreen` (status-driven, read-only, publish/unpublish/discard/export) | ✅ |
| 12 | `BlogScreen` rewrite — Drafts/Published lists + completed-trip picker | ✅ |
| 13 | `TripDetailScreen` — Generate Blog button (completed trips) → generate + navigate | ✅ |
| 14 | Full verification — suite + tsc green; edge fn deployed; on-device QA passed | ✅ |

### Security fix folded in during review

- **Cross-tenant authorization:** the edge function uses the service-role client (bypasses RLS), so it now verifies the requested `trip_id` belongs to the JWT-authenticated user before reading notes or writing a post (returns 403 otherwise). Identity is derived from the verified JWT, never a client-supplied `user_id` (which was dropped from the `generateBlog` client call). Without this, any authenticated user could generate a blog from another user's private trip.

### Gotchas

- **Edge functions use the modern `expo-file-system` API** in `BlogPostScreen` HTML export: `new File(Paths.cache, name)` + `file.create({overwrite:true})` + `file.write(html)` + `Sharing.shareAsync(file.uri, ...)` (synchronous writes, wrapped in try/catch).
- **`tsconfig` excludes `supabase/`** — the Deno edge function (URL imports, `EdgeRuntime` global) never enters the project `tsc --noEmit`.
- **One active post per trip** is enforced by a partial unique index (`where status <> 'published'`); the edge function deletes the prior non-published row before inserting the fresh `generating` row.

### QA fixes folded in (on-device, 2026-05-29)

- **Realtime DELETE propagation (`009_realtime_replica_identity`):** default replica identity puts only the PK in a DELETE payload, so subscriptions filtered on `user_id` (`useTrips`, `useBlogPosts`) never received deletes — a deleted trip lingered in the note-capture picker and a discarded draft lingered in the Blog tab. Set `REPLICA IDENTITY FULL` on `blog_posts`/`trips`/`notes` so the full old row ships and filtered DELETE events arrive.
- **Markdown image renderer:** a custom `image` rule in `BlogPostScreen` replaces the library's default `FitImage` (which spread `key` into JSX — a React 19 warning) and sizes inline photos to their natural aspect ratio.
- **Gradient primary CTAs:** new `GradientButton` (subtle `#C8703A → #A85A2A`) for Publish + Generate Blog (×2); secondary/destructive buttons stay flat outlines.

On-device QA passed (generate → live `generating → draft`, inline photos + Places, Publish/Unpublish, Export Markdown + HTML, Discard, regenerate-replaces-draft). Merged + pushed.

### Deferred from QA → backlog (see Backlog section)

- ~~**#2** editable location on note capture~~ ✅ done 2026-05-30 · **#4** editable + croppable blog/cover (reverses the read-only decision; its own spec) · personalize blog voice from the user's writing style.

---

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
