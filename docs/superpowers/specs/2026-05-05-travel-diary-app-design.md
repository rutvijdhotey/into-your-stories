# Travel Diary App — Design Spec
**Date:** 2026-05-05
**Status:** Approved for implementation planning

---

## 1. Product Summary

A voice-first travel memory app that captures notes, photos, and places while traveling, then generates polished blog posts from that material. The app serves two purposes: a personal travel organizer on the go, and a blogging platform where finished posts live publicly.

The end goal for each trip is a blog post — written in the user's voice, with photos placed contextually — that can be published in-app or exported to their personal website.

---

## 2. Core Concept

**Trip-centric.** Everything belongs to a trip (e.g., "Japan 2024"). Within a trip, the user captures notes and photos, saves places of interest, and browses them on a map. When a trip ends, they generate a blog post from all that material.

**Destinations** provide a cross-trip view. Every city or place the user has ever visited appears under Destinations. Tapping a destination shows all restaurants, hotels, museums, and activities logged there — across every trip — so the user can reference past visits before returning.

---

## 3. Data Model

### Trip
- Name, destination(s), date range, cover photo, status (active / completed)
- A trip spans one or more cities

### Note
- Content — transcribed voice or typed text
- Media — photos imported from camera roll
- Category — Food, Stay, Activity, Shopping, To-Visit, General
- Place name — extracted by AI if mentioned in content
- GPS coordinates + city — auto-tagged from device GPS on save
- EXIF fallback — if GPS unavailable, coordinates and timestamp pulled from photo metadata
- AI extraction fallback — if no GPS or EXIF, Claude extracts location and time references from note content (e.g., "near Shibuya station", "last night")
- Belongs to a Trip

### Place
- Extracted from notes when a specific location is detected
- Name, category, coordinates, city
- Links to the note(s) that mentioned it
- Pinned on the map

### Destination
- A city or place visited across one or more trips
- Aggregates all Places from all trips to that location
- Filterable by category

### Blog Post
- Generated from a completed trip
- AI-drafted content in the user's writing style
- Photos embedded contextually throughout
- Status: Draft (private, editable) or Published (publicly viewable in-app)
- Exportable as Markdown or HTML

---

## 4. Screen Structure

**Home**
List of trips. Each shows cover photo, destination, dates, and note count. One button to start a new trip.

**Destinations**
Every place the user has visited, across all trips. Tap a destination to see all logged places filtered by category (Food, Stay, Activity, Shopping). Useful before revisiting a city.

**Trip Detail**
The hub for an active or completed trip. Two tabs:
- *Feed* — chronological list of notes with photo thumbnails
- *Map* — Apple Maps with categorized, color-coded pins for all saved places in the trip

A persistent capture bar at the bottom of the screen holds the push-to-talk mic button and a text input field. When the trip is marked complete, a "Generate Blog" button appears prominently.

**Note Capture Sheet**
Slides up from the bottom. Contains: push-to-talk mic button, text field, photo picker (camera roll), and category selector. Location fills automatically in the background.

**Search**
Global semantic search across all trips. Voice or text input. "Find me that noodle place I liked in Tokyo" returns the relevant note even if the words don't match exactly.

**Blog**
Shows all blog posts — drafts and published. Tap a post to open the editor (draft) or the public view (published). Published posts have a shareable link. Export button outputs Markdown or HTML.

---

## 5. AI Layer

Five distinct AI jobs power the app.

### 5.1 Voice Transcription and Intent Detection
iOS Native Speech Recognition (SFSpeechRecognizer) transcribes the audio. Claude then reads the transcription and detects intent:
- *Save intent* ("this place has the best ramen") → creates a note
- *Search intent* ("find me that ramen place from last week") → triggers semantic search

### 5.2 Smart Tagging
On every save, Claude reads note content plus any extracted GPS or EXIF data and assigns: category, place name (if mentioned), and city (if not GPS-tagged). No manual tagging required.

### 5.3 Semantic Search
Every note is embedded using Cohere Embeddings on save. Embeddings are stored in a pgvector table in Supabase. Search queries are embedded at query time and matched by meaning — not keywords. Returns ranked results.

### 5.4 Image Understanding
When photos are imported, Claude Vision analyzes each image and generates a semantic description — what it shows, what type of moment or place it captures. These descriptions are stored alongside the photo.

During blog generation, Claude uses these descriptions to place photos contextually in the narrative. Food photos appear near the meal description; landmark photos appear when that location is mentioned.

Image search also benefits: "find photos of that street food stall" can surface images even without a matching note.

### 5.5 Blog Generation
Triggered when the user taps "Generate Blog" on a completed trip.

1. Claude reads all notes, smart tags, place names, and photo descriptions from the trip
2. Claude matches the user's writing style using their five reference blog posts (uploaded once during onboarding)
3. Claude produces a structured draft: intro, narrative sections by city or day, photos placed contextually, closing
4. The draft opens in the in-app editor for the user to revise
5. The user publishes in-app or exports as Markdown / HTML

---

## 6. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React Native (Expo) | iOS first; cross-platform ready for Android and web |
| Backend & Auth | Supabase | Postgres, auth, file storage, pgvector |
| Voice | iOS Native STT | Free, on-device, English accuracy sufficient for V1 |
| AI / Blog / Tagging | Claude API (claude-sonnet-4-6) | Intent detection, smart tagging, blog generation |
| Image Understanding | Claude Vision | Photo analysis and contextual blog placement |
| Semantic Search | Cohere Embeddings + pgvector | Stored in Supabase, similarity search via pgvector |
| Maps | Apple Maps (react-native-maps) | Free, native iOS feel |
| Notion Integration | Notion API | P2 only |

**Storage:** Photos upload to Supabase Storage on import. Embeddings live in a pgvector table alongside notes. Blog content stores as Markdown in the database.

---

## 7. Blog Style Onboarding

One-time setup. The user uploads or pastes five existing blog posts. Claude analyzes them and stores a style profile: tone, sentence structure, how they describe food versus places versus experiences, typical post length. This profile is used in every subsequent blog generation.

---

## 8. V1 Scope

**In scope:**
- iOS app (React Native / Expo)
- Trip creation and management
- Note capture — push-to-talk (iOS Native STT) and text input
- Photo import from camera roll, EXIF extraction
- AI smart tagging — category, place name, city, location/time from content
- Map view — Apple Maps with categorized pins per trip
- Destinations view — cross-trip place history per city
- Semantic search — voice and text via Cohere + pgvector
- Blog generation — Claude drafts in user's writing style from notes and photos
- Blog editor — editable draft in-app
- Blog publish — publicly viewable in-app with shareable link
- Blog export — Markdown and HTML
- Single user (proof of concept)

**Out of scope for V1 (P2):**
- Multi-user accounts
- Notion integration
- Video support
- Android and web
- Fact-checker

---

## 9. Auth Model

For V1 (single user), authentication uses Supabase Auth with email and password. One account, one user. All notes, trips, and blog posts belong to that account. Published blog posts are publicly readable without auth via a shareable link; all write operations require the authenticated user.

When multi-user (P2) is added, Supabase Auth scales without changes to the auth layer.

---

## 10. Open Questions

None — all clarifying questions resolved.

---

## 10. Key Decisions Log

| Decision | Choice | Reason |
|---|---|---|
| Organization model | Trip-centric | Matches how people narrate travel; cleanest V1 scope |
| Platform | iOS first (React Native/Expo) | Fastest path to working product; cross-platform ready |
| Voice input | Push-to-talk + text | No always-on listening; battery-friendly and explicit |
| Voice engine | iOS Native STT | Free, no external dependency |
| AI provider | Anthropic Claude only | No OpenAI; single AI provider simplifies stack |
| Embeddings | Cohere + pgvector | Non-OpenAI, free tier, strong semantic search |
| Maps | Apple Maps | Free, native on iOS |
| Media | Photos only (no video) | Keeps V1 scope tight; video in P2 |
| Blog lives in-app | Yes, with export | App is the primary home; user moves to website manually |
| User scope | Single user V1 | Proof of concept first, multi-user in P2 |
