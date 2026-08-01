# Notebound — Design Spec
**Date:** 2026-05-06
**Status:** Approved for implementation planning
**Supersedes:** 2026-05-05-travel-diary-app-design.md

---

## 1. Product Summary

A voice-first travel memory and community app. Travelers capture notes, photos, and places on the go; when a trip ends, Claude drafts a polished blog post in their writing style from all that material. Published posts appear in a community discovery feed — organized by destination — so anyone can learn about a place through other travelers' real stories.

The app serves two purposes: a personal travel organizer while on the go, and a community platform where finished stories live publicly, helping other travelers discover restaurants, spots, and experiences from people who were actually there.

Monetization is secondary. The goal is a place where people document their travels and learn from each other's.

---

## 2. Core Concept

**Trip-centric.** Everything belongs to a trip (e.g., "Japan 2024"). Within a trip, the user captures notes and photos, saves places of interest, and browses them on a map. When a trip ends, they generate a blog post from all that material.

**Explore** is the community discovery layer. Every published blog post surfaces in a destination-first browsing view — tap Tokyo, see every story published about Tokyo, with an aggregated map of every place mentioned across all those stories. V1 is pure read-only; social features (follow, profiles) come in V2.

**Destinations** is a personal reference tool. Every city the user has personally visited, with all their own logged places filterable by category. Separate from community discovery — this is your own travel history.

---

## 3. Data Model

### Trip
- Name, destination(s), date range, cover photo, status (active / completed)
- A trip spans one or more cities
- Multiple trips can be active simultaneously

### Note
- Content — transcribed voice or typed text
- Media — photos imported from camera roll
- Category — Food, Stay, Activity, Shopping, To-Visit, General
- Place name — extracted by AI if mentioned in content
- GPS coordinates + city — auto-tagged from device GPS on save
- EXIF fallback — if GPS unavailable, coordinates and timestamp pulled from photo metadata
- AI extraction fallback — if no GPS or EXIF, Claude extracts location and time references from note content
- Saved immediately on capture; AI tagging queued and applied when connectivity is available
- Belongs to a Trip; always private

### Place
- Extracted from notes when a specific location is detected
- Name, category, coordinates, city
- Links to the note(s) that mentioned it
- Pinned on the trip map
- When the parent blog post is published, the Place is indexed into the community destination map

### Destination (Personal)
- A city aggregating the user's own Places across all their trips
- Filterable by category
- Accessible from within Trip Detail and Home; not a primary tab

### Community Destination
- A city aggregating Places from all published blog posts by all users
- Powers the Explore tab destination page
- Filterable by category (Food, Stay, Activity, Shopping)
- Populated automatically when a blog post is published; depopulated if unpublished

### Blog Post
- Generated from a completed trip via background job
- AI-drafted content in the user's writing style
- Photos selected automatically by Claude (representative set, ~8–12 for a week-long trip); user can override
- Cover photo selected automatically by Claude from trip photos; user can override
- Status: Draft (private, read-only preview) or Published (public)
- Published posts include:
  - Narrative (AI-generated, user's voice)
  - Structured places summary (all Places from the trip, categorized)
  - Mini-map (Apple Maps view with all Place pins)
  - Itinerary tab (conditional — only rendered when sufficient timestamped + GPS data exists)
- Accessible via a real web URL — readable in any browser without installing the app
- Exportable as Markdown or HTML

---

## 4. Navigation Structure

**Tab bar:** Home · Explore · Search · Blog

A **global floating capture button** (mic/text) is visible on every screen, above the tab bar. Tapping it opens the Note Capture Sheet from anywhere in the app.

**Destinations** is accessible from Home (link in trip cards or header) and from Trip Detail — not a primary tab.

---

## 5. Screen Structure

### Home
List of the user's trips — active at the top, completed below. Each card shows cover photo, destination, dates, and note count. One button to start a new trip. Link to personal Destinations view.

New users with no trips see a prompt: "Start your first trip" — but they land on **Explore** first (see Onboarding).

### Explore
Community discovery hub. Destination-first browsing of all published stories.

**Default state (no destination selected):**
- Searchable grid of destinations sorted by recency of last published story
- Destinations only appear once at least one story is published there
- "Recently Published" horizontal strip below the grid for fresh content

**Destination page (after tapping a destination):**
- Aggregated community map at the top — all Places from all published stories about that destination, filterable by category (Food, Stay, Activity, Shopping)
- Blog post list scrollable below — each card shows cover photo, author display name, trip dates, and a one-line excerpt
- Tapping a blog post opens the full published post view

**Published post view:**
- Full-bleed hero image (cover photo)
- Narrative body with contextually placed photos
- Structured places summary (categorized list of every Place mentioned)
- Mini-map (all Place pins from this post)
- Itinerary tab (conditional — day-by-day breakdown from timestamps + GPS, only shown when data is sufficient)
- Share button (copies web URL)
- "Capture your own stories →" CTA at the bottom (acquisition hook for non-users)
- V1: read-only. No comments, no likes, no follow.

### Destinations (Personal)
The user's own travel history. Every city they have personally visited across all trips. Tap a destination to see all their own logged Places filtered by category. Useful before revisiting a city.

### Note Capture Sheet
Global — triggered by the floating capture button from any screen.

Contains:
- Push-to-talk mic button (hold to record)
- Text input field
- Photo picker (camera roll)
- Category selector
- Location fills automatically in background

**Trip selector:** If one trip is active, it auto-selects. If multiple trips are active, a one-tap selector appears to choose which trip this note belongs to. If no trip is active, a prompt appears to start one.

**Voice intent handling:** iOS Native STT transcribes audio. Claude detects intent:
- Save intent → creates note
- Search intent → triggers search
- Ambiguous → defaults to save, with a one-tap "Did you mean to search?" prompt

**Offline behavior:** Note saves immediately to local storage. Claude tagging queues and runs when connectivity is restored. The note appears in the feed immediately with a subtle "processing" indicator until tags arrive.

### Search
Unified semantic search across:
1. The user's own notes (all trips)
2. Published community blog posts

Results are visually distinguished — personal notes labeled "Your notes," community results labeled with the author's display name and trip name. Voice or text input. Results ranked by semantic similarity via Cohere + pgvector.

### Blog
The user's own blog posts — drafts and published.

- Draft: private, read-only preview of the generated post. Publish or discard.
- Published: public, accessible via web URL. Export as Markdown or HTML.

---

## 6. AI Layer

Six distinct AI jobs power the app.

### 6.1 Voice Transcription and Intent Detection
iOS Native Speech Recognition (SFSpeechRecognizer) transcribes audio on-device. Claude detects intent from the transcription:
- Save intent → creates a note
- Search intent → triggers semantic search
- Ambiguous → defaults to save; one-tap prompt allows switching to search

### 6.2 Smart Tagging
On every save (or when connectivity restores after offline capture), Claude reads note content plus any GPS or EXIF data and assigns: category, place name (if mentioned), and city (if not GPS-tagged). No manual tagging required. Notes saved offline are tagged once connectivity returns.

### 6.3 Semantic Search
Every note is embedded using Cohere Embeddings on save. Published blog post content is embedded when published and removed when unpublished. All embeddings stored in a pgvector table in Supabase. Search queries are embedded at query time and matched by meaning across both personal notes and community posts.

### 6.4 Image Understanding
When photos are imported, Claude Vision analyzes each and generates a semantic description: what it shows, what type of moment or place it captures. Descriptions stored alongside the photo and used for:
- Contextual photo placement during blog generation
- Image-based search ("find photos of that street food stall")

### 6.5 Blog Generation
Triggered when the user taps "Generate Blog" on a completed trip. Runs as a **background job**; the user receives a push notification when the draft is ready.

1. Claude reads all notes, smart tags, place names, and photo descriptions from the trip
2. Claude selects a representative set of photos (~8–12 for a week-long trip) based on semantic descriptions; cover photo selected automatically
3. Claude matches the user's writing style using their style profile (if set) or the "clear, engaging travel writing" default
4. Claude produces a structured draft: intro, narrative sections by city or day, photos placed contextually, closing
5. Claude runs a lightweight content check; flags anything clearly inappropriate before the draft is shown
6. Push notification delivered; user opens the draft in the Blog screen
7. Draft is a read-only preview. User publishes as-is or discards.
8. On publish: Places indexed into the community destination map; post accessible via web URL

### 6.6 Community Aggregated Map
When a blog post is published, all its Places (with coordinates and categories) are indexed into the Community Destination for their respective cities. When a post is unpublished, its Places are removed. This powers the aggregated map on destination pages in Explore — a crowdsourced, category-filterable guide to every city, built automatically from travelers' GPS-tagged notes.

---

## 7. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React Native (Expo) | iOS first; cross-platform ready for Android |
| Web (public posts) | Server-side rendered web view | Powers real web URLs for published blog posts; read-only |
| Backend & Auth | Supabase | Postgres, auth, file storage, pgvector, RLS |
| Voice | iOS Native STT (SFSpeechRecognizer) | Free, on-device, English accuracy sufficient for V1 |
| AI / Blog / Tagging | Claude API (claude-sonnet-4-6) | Intent detection, smart tagging, blog generation, content check |
| Image Understanding | Claude Vision | Photo analysis and contextual blog placement |
| Semantic Search | Cohere Embeddings + pgvector | Personal notes + community posts; stored in Supabase |
| Maps | Apple Maps (react-native-maps) | Free, native iOS feel |

**Storage:** Photos upload to Supabase Storage on import. Embeddings in pgvector. Blog content as Markdown in the database. Published post web views served from a lightweight web layer reading from Supabase.

---

## 8. Blog Style Onboarding

Optional, not required to generate a blog post.

**If completed:** User uploads or pastes up to five existing blog posts. Claude analyzes them and stores a style profile: tone, sentence structure, how they describe food vs. places vs. experiences, typical post length. Used in every subsequent blog generation.

**If skipped:** Claude uses a "clear, engaging travel writing" default style. After the user's first blog post is published, it can be used as their first style reference. Style profile builds gradually from their own published posts over time — zero friction path to personalization.

---

## 9. User Identity & Auth

Multi-user from V1 — the community requires multiple accounts.

- **Signup:** email + password + display name (real name or handle, user's choice; simple field, nothing more)
- **Auth:** Supabase Auth; email + password
- **Data isolation:** Supabase RLS ensures each user's notes, trips, and drafts are private
- **Public access:** Published blog posts publicly readable without auth via web URL; all write operations require authentication
- **V1 social:** No profiles, no follow, no public user pages. Display name appears on published posts as author credit.
- **V2:** Follow, author profiles, follower feed

---

## 10. Content Moderation

- Claude runs a lightweight content check during blog generation; if source notes contain clearly inappropriate content, it flags before the draft is shown
- Every published post in Explore has a "Report" button; reports go to a manual review queue
- Manual review handles flagged content at V1 scale

---

## 11. Onboarding (New Users)

1. New user downloads app → lands on **Explore** (not Home)
2. Sees the community's published stories immediately — value before commitment
3. A persistent "Start your first trip →" banner is always visible
4. Signup flow: email + password + display name
5. Style onboarding screen: optional ("Add your writing style" / "Skip for now")
6. After signup, lands on Home with an empty trip list and a prominent "Start your first trip" CTA

---

## 12. Notifications

One notification only: **blog generation complete** — delivers when the background blog generation job finishes and the draft is ready to view.

Everything else is silence. No inactivity nudges, no marketing, no trip-end reminders.

---

## 13. Trip Lifecycle

1. **Create trip** — name, destinations, optional date range
2. **Capture** — notes (voice + text), photos; multiple trips can be active simultaneously
3. **End trip** — manual "End Trip" button. If a set end date passes and the trip is still active, a subtle in-app indicator appears (no push notification)
4. **Generate Blog** — taps "Generate Blog" on completed trip; background job runs; push notification when ready
5. **Review draft** — read-only preview; publish or discard
6. **Publish** — post goes live with web URL; placed indexed to community destination map; opt-in, but app nudges toward sharing

---

## 14. V1 Scope

**In scope:**
- iOS app (React Native / Expo)
- Multi-user auth — email + password + display name
- Trip creation and management (multiple active trips)
- Note capture — global floating capture button; push-to-talk (iOS Native STT) and text input
- Photo import from camera roll, EXIF extraction
- Offline-first capture — save immediately, tag when connectivity returns
- AI smart tagging — category, place name, city, location/time from content
- Voice intent detection — save vs. search; default to save on ambiguity
- Map view — Apple Maps with categorized pins per trip
- Personal Destinations view — cross-trip place history per city
- Unified semantic search — personal notes + community posts via Cohere + pgvector
- Blog generation — background job; Claude drafts in user's style; push notification on completion
- Photo selection — Claude selects automatically; cover photo auto-selected; user can override
- Blog style onboarding — optional; builds from own posts over time
- Blog draft — read-only preview; publish or discard (uneditable in V1)
- Blog publish — opt-in with strong nudge; real web URL (no app required to read)
- Structured places summary — automatically appended to every published post
- Mini-map — all Place pins from the post, rendered on every published post
- Itinerary tab — conditional; day-by-day from timestamps + GPS; omitted when data insufficient
- Blog export — Markdown and HTML
- Explore tab — destination-first community discovery
- Community destination pages — aggregated map (top) + blog post list (below)
- Community aggregated map — all Places from all published stories, by destination, filterable by category
- Explore grid — destinations sorted by recency of last published story
- Content moderation — AI pre-screen during generation + user flagging post-publish
- New user onboarding — lands on Explore; persistent "Start your first trip" CTA

**Out of scope for V1 (V2+):**
- Follow and author profiles
- Social feed of followed authors
- Conversational blog editing (post-generation)
- Multi-user social features (comments, likes)
- Notion integration
- Video support
- Android and web app
- Fact-checker

---

## 15. Key Decisions Log

| Decision | Choice | Reason |
|---|---|---|
| Product type | Community travel platform | People document travels + learn from others'; not a solo tool |
| Monetization | Secondary | Build the community first |
| Organization model | Trip-centric | Matches how people narrate travel |
| Platform | iOS first (React Native/Expo) | Fastest path to working product; cross-platform ready |
| Discovery model | Destination-first (Explore tab) | Works with small user base; no network effects required |
| Destinations tab | Personal only | Stays a personal reference tool; community discovery is Explore |
| Content unit | Blog post | Narrative > raw notes for community value |
| Publishing | Opt-in with strong nudge | Respects privacy; app celebrates the publish moment |
| Blog draft | Read-only preview in V1 | Keeps scope tight; conversational editing in V2 |
| Blog editing | Conversational (V2) | Claude-assisted edits from same voice interface |
| Photo selection | Claude auto-selects; user can override | Removes friction; preserves user control |
| Cover photo | Claude auto-selects; user can override | Same principle |
| Blog generation | Background job + push notification | 60+ seconds is fine; anticipation > frustration |
| Style onboarding | Optional; builds from own posts | Removes activation barrier |
| Web URL | Real URL, no app required | Reach > friction; organic acquisition |
| Structured places | Auto-appended to every post | Zero extra work; massive reader value |
| Mini-map | On every published post | Spatial context is instant; differentiates from any travel blog |
| Itinerary tab | Conditional (data-dependent) | Only shown when meaningful; not forced |
| Community map | Aggregated by destination | Crowdsourced knowledge graph; the killer feature |
| Destination page | Map top, stories below | Complementary, not competing; no tabs needed |
| Explore sort | Recency of last published story | Keeps grid live and dynamic |
| Search scope | Unified personal + community | One search, two pools, clear attribution |
| Social (V1) | Pure read-only | Validate content value before social layer |
| Social (V2) | Follow + author profiles | Adds signal when content density demands filtering |
| New user landing | Explore first | Value before commitment |
| Floating capture | Global, always visible | Capture as reflex, not workflow |
| Multiple active trips | Allowed; trip selector on ambiguity | Real travel is messy |
| Offline capture | Save immediately, tag later | Never lose a memory to bad signal |
| Voice intent | Default to save on ambiguity | Saving is recoverable; missed memory is not |
| Notifications | Blog completion only | Restraint builds trust |
| User identity | Display name at signup; simple | Privacy + flexibility; no mandatory real name |
| Content moderation | AI pre-screen + user flagging | Scales appropriately at V1 size |
| Auth model | Multi-user from V1 | Community requires multiple accounts |
| Voice input | Push-to-talk + text | No always-on listening; battery-friendly |
| Voice engine | iOS Native STT | Free, no external dependency |
| AI provider | Anthropic Claude only | Single AI provider simplifies stack |
| Embeddings | Cohere + pgvector | Non-OpenAI, free tier, strong semantic search |
| Maps | Apple Maps | Free, native on iOS |
| Media | Photos only (no video) | Keeps V1 scope tight; video in V2 |
