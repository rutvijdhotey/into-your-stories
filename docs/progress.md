# Into Your Stories — Project Progress

**Last updated:** 2026-05-06  
**GitHub:** https://github.com/rutvijdhotey/into-your-stories  
**Status:** Phase 1 implementation in progress — branch `phase-1/scaffold-auth`

---

## What This App Is

A voice-first travel memory app. The user captures notes (push-to-talk or typed), photos, and places while traveling. When a trip ends, Claude drafts a polished blog post in the user's writing style from all that material. Posts live in-app and can be exported to their website.

**Two jobs in one:** personal travel organizer on the go + blogging platform for finished trips.

---

## What's Been Built So Far

| Artifact | Location | Status |
|---|---|---|
| Design spec | `docs/superpowers/specs/2026-05-05-travel-diary-app-design.md` | ✅ Complete |
| UI mockups (8 screens, dark mode) | `docs/superpowers/specs/travel-diary-ui-mockups.html` | ✅ Complete |
| Phase overview | `docs/superpowers/plans/phases-overview.md` | ✅ Complete |
| Phase 1 plan | `docs/superpowers/plans/2026-05-06-phase-1-scaffold-auth.md` | ✅ Written |
| Expo project scaffold | repo root | ✅ Done (Task 1) |
| Dependencies installed | `package.json` | ✅ Done (Task 2) |
| Theme constants | `src/theme/index.ts` | ✅ Done (Task 3) |
| Supabase client | `src/lib/supabase.ts` | ⏳ Task 4 — needs Supabase project URL + anon key |
| Navigation types | `src/navigation/types.ts` | ⏳ Pending |
| AuthContext | `src/contexts/AuthContext.tsx` | ⏳ Pending |
| Placeholder screens (4) | `src/screens/` | ⏳ Pending |
| TabNavigator | `src/navigation/TabNavigator.tsx` | ⏳ Pending |
| Login + Signup screens | `src/screens/auth/` | ⏳ Pending |
| AppNavigator | `src/navigation/AppNavigator.tsx` | ⏳ Pending |
| App.tsx wired | `App.tsx` | ⏳ Pending |

Open `travel-diary-ui-mockups.html` in any browser to see all 8 screens.

---

## Key Decisions (Locked In)

### Product
- **Trip-centric structure.** Everything belongs to a Trip. Destinations view aggregates places cross-trip.
- **Capture:** Push-to-talk (hold mic) + text input. No always-on listening.
- **Blog generation:** Claude drafts in user's writing style, matched to 5 reference blog posts uploaded at onboarding.
- **Blog lives in-app** with shareable public link + Markdown/HTML export.
- **Single user V1** — proof of concept, then multi-user in P2.

### Tech Stack
| Layer | Choice |
|---|---|
| Frontend | React Native (Expo), iOS first |
| Backend / Auth | Supabase (Postgres, auth, file storage, pgvector) |
| Voice | iOS Native STT (SFSpeechRecognizer) — free, on-device |
| AI | Claude API only — claude-sonnet-4-6 |
| Image understanding | Claude Vision |
| Semantic search | Cohere Embeddings + pgvector in Supabase |
| Maps | Apple Maps (react-native-maps) |

### Design
- **Dark mode only.** Single color palette, no theming branching. Simplifies implementation significantly.
- **Accent color:** Warm amber `#C8703A`
- **App background:** `#111111`
- **Surface (cards):** `#1C1C1E`

### AI Layer (5 jobs)
1. **Voice transcription + intent detection** — iOS STT transcribes; Claude detects save vs. search intent
2. **Smart tagging** — Claude assigns category, place name, city on every save
3. **Semantic search** — Cohere embeddings stored in pgvector; similarity search at query time
4. **Image understanding** — Claude Vision analyzes imported photos; descriptions used for contextual blog placement + image search
5. **Blog generation** — Claude drafts from all trip notes/photos in user's writing style

---

## 8 Screens Designed

1. **Home** — trip cards with cover photos, Active badge, note count
2. **Trip Detail: Feed** — chronological notes with category badges + photo thumbnails, persistent capture bar
3. **Trip Detail: Map** — Apple Maps style, 4-color categorized pins (Food/Stay/Activity/Shopping), legend
4. **Note Capture** — bottom sheet over blurred feed, large mic button, photo picker, category pills, auto-detected location
5. **Destinations** — 2-column city grid, cross-trip place counts
6. **Search** — semantic search bar (voice + text), recent chips, results with trip source
7. **Blog** — Published / Drafts sections, blog cards with cover image + status badge
8. **Blog Post** — full-bleed hero image, readable body copy, inline photos, Edit / Share / Export actions

---

## Data Model

### Trip
Name, destination(s), date range, cover photo, status (active / completed)

### Note
Content, media (photos), category, place name (AI-extracted), GPS coordinates + city (auto-tagged), EXIF fallback, AI location extraction fallback, belongs to a Trip

### Place
Extracted from notes when a specific location is detected. Name, category, coordinates, city. Links to notes.

### Destination
A city aggregating all Places across trips. Filterable by category.

### Blog Post
AI-drafted, photos embedded contextually. Status: Draft (private, editable) or Published (public + shareable link). Exportable as Markdown / HTML.

---

## V1 Scope

**In:** iOS app, trip management, note capture (voice + text), photo import + EXIF, AI smart tagging, map view, destinations view, semantic search, blog generation + editor + publish + export, single user.

**Out (P2):** Multi-user, Notion integration, video, Android/web, fact-checker.

---

## What's Next

**Resume Phase 1, Task 4 — Supabase configuration.**

Task 4 requires a manual step: create a Supabase project and get the API keys.

1. Go to https://supabase.com → New project → name: `into-your-stories`
2. Go to Project Settings → API → copy **Project URL** and **anon public** key
3. Provide those two values to Claude to continue

After Task 4, Tasks 5–12 are fully automated (subagent-driven).

**Phase plan:** `docs/superpowers/plans/2026-05-06-phase-1-scaffold-auth.md`
**All phases:** `docs/superpowers/plans/phases-overview.md`
**Branch:** `phase-1/scaffold-auth`

After Phase 1 is done, move to Phase 2: Trip CRUD + Home screen.

---

## Out-of-Scope Context

This app is part of a broader travel passive income project. Other products in the pipeline:
- ✅ Notion Packing List Template (complete, pending Gumroad publish)
- Photography Presets Pack (not started)
- Destination Itinerary PDFs (not started)
