# Module 8 — Semantic Search
**App:** Into Your Stories
**Status:** Design doc — pending approval before execution
**Depends on:** Module 3 (notes), Module 6 (tags, for result display), Module 9 (published posts — for community embeddings; partial dependency; personal search works without it)

---

## Purpose

Unified search across two pools: the user's own notes (private) and published community blog posts (public). Search works by meaning, not keyword. Typing "where did I eat ramen" surfaces a note about "Ichiran Shinjuku" even if neither word appears in the query.

After this module: the Search tab is fully functional for personal notes. Community results appear once Module 10 has published posts.

---

## How It Works (End to End)

```
User types or speaks a query
  → query embedded via Cohere API → 1024-dim vector
  → Two parallel Supabase RPC calls:
      match_notes(query_embedding, user_id, limit=20)   ← personal
      match_posts(query_embedding, limit=20)             ← community (published only)
  → Results merged, deduplicated, ranked by cosine similarity score
  → Displayed in two labeled sections
```

---

## Embedding Pipeline

**Provider:** Cohere `embed-english-v3.0`. 1024 dimensions. Stored in `embeddings` table as `vector(1024)`.

### Personal Notes — Embedded on Save

After a note is saved and tagged (Module 6), its content is sent to Cohere for embedding. The resulting vector is inserted into the `embeddings` table with `source_type = 'note'`, `source_id = note.id`, `user_id = note.user_id`.

- Runs as part of the same async worker chain as tagging (Module 6) and vision (Module 5)
- Offline notes: embedded once they sync and tagging completes
- If the note content is updated: re-embed (not applicable in V1 — notes are immutable after save)

### Community Posts — Embedded on Publish

When a blog post is published (Module 9), the full post content (markdown) is sent to Cohere for embedding. Vector stored with `source_type = 'post'`, `source_id = post.id`, `user_id = null` (public).

When a post is unpublished: the corresponding embedding row is deleted. The post no longer appears in community search results.

---

## Supabase RPC Functions

Two Postgres functions using pgvector's `<=>` cosine distance operator:

**`match_notes(query_embedding, user_id, limit)`**
- Filters: `source_type = 'note'` AND `user_id = auth.uid()`
- Orders by: `embedding <=> query_embedding ASC` (lowest distance = most similar)
- Returns: note_id, similarity score, note content, category, place_name, city, created_at

**`match_posts(query_embedding, limit)`**
- Filters: `source_type = 'post'` AND post status = `published`
- Orders by: cosine distance
- Returns: post_id, similarity score, post title, trip destination, author display_name, published_at, cover_photo_url

Both use the `ivfflat` index on the `embedding` column (created in Module 0 schema migration) for fast approximate nearest-neighbor search.

---

## SearchScreen

The Search tab. Accessible from the tab bar and from voice intent routing (Module 4).

**Input:**
- Text field — auto-focused on tab open
- Mic icon (right of input) — triggers voice input using the same `useVoiceInput` hook from Module 4; transcript populates search field and fires search immediately
- Query fires on each keystroke with 300ms debounce (or immediately when navigated to with a `prefillQuery` param from voice intent)

**Results layout:**

Two labeled sections, rendered as a flat list:

**"Your Notes"** section:
- Each result: category badge, note content snippet (first 120 chars), place name + city, relative timestamp
- Tapping → note detail screen (same as tapping a callout in Module 7)
- If no personal results: section hidden (not shown as empty)

**"Community"** section:
- Each result: cover photo thumbnail, blog post title, author display name, trip destination, published date
- Tapping → PublishedPostView (Module 10)
- If no community results (no published posts yet): section hidden

**Empty state (no results for either):** Centered text — "No results. Try different words." No suggestion chips or trending in V1.

**Loading state:** Skeleton cards while RPCs are in flight.

---

## Voice Integration

`SearchScreen` accepts a `prefillQuery` navigation param. When present (navigated from voice intent in Module 4):
- Text field is pre-filled with the transcription
- Search fires immediately on mount — no user action needed
- Keyboard does not auto-open (query already set)

---

## File Structure

```
src/
  services/
    embeddingService.ts     ← calls Cohere Embed API; returns vector
    searchService.ts        ← embeds query; calls both RPCs; merges results
  screens/
    SearchScreen.tsx        ← replaces placeholder from Module 1
  components/
    SearchResultCard.tsx    ← shared display for note + post results (two variants)
    SearchInput.tsx         ← text input + mic icon + debounce logic
  hooks/
    useSearch.ts            ← orchestrates query → embed → RPC → merge → state
  supabase/
    migrations/
      009_search_rpcs.sql   ← match_notes + match_posts RPC definitions
```

**New dep:** `cohere-ai`

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Embedding provider | Cohere embed-english-v3.0 | Non-OpenAI, strong semantic quality, free tier, 1024 dims |
| Search scope | Personal notes + community posts | One search bar; two pools; clear attribution |
| Embed timing | After tagging (not before) | Tagged content includes place name + city; richer embedding |
| Community embeddings | Null user_id | Public; accessible to any authenticated user's search |
| Remove on unpublish | Delete embedding row | Post should not appear in search once unpublished |
| Result ranking | Cosine similarity score | Standard for semantic search; unified ranking across both pools |
| Debounce | 300ms | Responsive but not wasteful on Cohere API calls |
| No keyword fallback | Correct — semantic only | Keeps architecture simple; semantic search is good enough |
