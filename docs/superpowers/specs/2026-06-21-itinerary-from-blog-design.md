# Itinerary Creation from Blog (0c) — Design

**Date:** 2026-06-21
**Status:** Approved design — ready for plan
**Depends on:** Phase 9 blog generation (shipped), Note date from photo EXIF (`notes.occurred_at`, shipped), Trip-aware location inference (`notes.lat/lng`, shipped)
**Confirms:** the post-MVP "Itinerary Creation" direction in `docs/superpowers/specs/2026-05-28-phase-9-blog-generation-design.md`

---

## Problem

When a trip ends, `generate-blog` produces a polished narrative blog post. The same notes — now timestamped (`occurred_at`) and geolocated (`lat`/`lng`) — also contain everything needed for a **day-by-day itinerary**: which places, in what order, on which day. Today that structure is thrown away into prose. A traveler (or someone reading their published story later) gets no at-a-glance "here's what they did each day" view, and no reusable plan.

This feature derives a structured itinerary from the trip's notes during the existing generation pass and renders it as a second, toggleable view on the blog post — **only when the trip has enough multi-day, located material to make a real itinerary.**

---

## Scope

**In:**
- New nullable `itinerary jsonb` column on `blog_posts`.
- `generate-blog` produces the itinerary in the **same Claude call** as the narrative, gated by a deterministic multi-day check.
- A **Story / Itinerary segmented toggle** on `BlogPostScreen`, shown only when a valid itinerary exists.
- An `ItineraryView` component rendering day cards with part-of-day–grouped stops.
- A TDD-tested `parseItinerary` client helper.

**Out (deferred, noted not built):**
- Itinerary mini-map (coords are stored now so it can be added later without regenerating).
- Including the itinerary in Markdown/HTML export (export stays narrative-only).
- Editing/reordering the itinerary (the whole draft is read-only, consistent with Phase 9).
- Per-stop times beyond coarse part-of-day buckets.

---

## Data Model

New nullable column on `blog_posts`:

```sql
-- migration 014_blog_posts_itinerary.sql
alter table public.blog_posts add column itinerary jsonb;
```

`null` means "no itinerary" (trip too sparse, or itinerary failed to parse). The narrative is never affected by the itinerary's presence.

Logical shape of the `jsonb` (mirrored as a TypeScript type in `blogHelpers.ts`):

```ts
type ItineraryStop = {
  time_of_day: 'morning' | 'afternoon' | 'evening' | null;
  place_name: string;       // required — a stop must be a named place
  category: Category | null; // food | stay | activity | shopping | to-visit | general
  description: string;      // one short line, grounded in the notes
  lat: number | null;
  lng: number | null;       // straight from the note; stored for a future mini-map
};

type ItineraryDay = {
  day: number;            // 1-based, in trip order
  date: string | null;    // ISO yyyy-mm-dd, or null if unknown
  title: string;          // short Claude-written, e.g. "Old town & the river"
  stops: ItineraryStop[];
};

type Itinerary = ItineraryDay[]; // the stored jsonb; null when not generated
```

`title` (per day) and `description` (per stop) are the only free-text fields Claude authors; everything else is grounded in note metadata.

---

## Generation — Edge Function (`supabase/functions/generate-blog/index.ts`)

### Note loading
- Add `occurred_at` to the `notes` select and to the `NoteRow` type.
- Include `occurred_at` in each note's metadata line (`noteMeta`) so Claude can number days and assign dates. Day ordering uses `occurred_at ?? created_at`.

### Deterministic eligibility gate
Before calling Claude, the function decides whether the trip warrants an itinerary:

- A note qualifies as a **stop candidate** when it has a non-empty `place_name` **and** both `lat` and `lng` (located + named).
- Group qualifying notes by **calendar day** of `occurred_at ?? created_at`.
- The trip is **itinerary-eligible** when the count of distinct qualifying days is **≥ `MIN_ITINERARY_DAYS` (3)**.

This rule lives inline in the edge function, consistent with the project convention that the edge function is smoke-tested via MCP rather than unit-tested.

### Prompt changes
- `SYSTEM_PROMPT` gains the `itinerary` field in its output JSON schema and a rules block:
  - Use **only** named, located places from the notes as stops — never invent.
  - Bucket each stop into `morning` / `afternoon` / `evening` (or `null` if unclear) — do not fabricate precise times.
  - One day object per trip day, in order; a short evocative `title` per day; a one-line `description` per stop.
  - Output `itinerary: null` when instructed (see below).
- The function appends a per-request instruction to the user content:
  - **Eligible:** "Produce a day-by-day itinerary as described in the schema."
  - **Not eligible:** "Do NOT produce an itinerary. Set itinerary to null."

### Output handling
- Extend the expected output JSON to `{title, content_markdown, cover_photo_url, selected_photo_urls, itinerary}`.
- **Itinerary is supplementary, never fatal:**
  - If the trip is not eligible, force `itinerary = null` regardless of what Claude returned.
  - If eligible, validate the returned itinerary inline (drop malformed days/stops; require `place_name` on each stop). If nothing valid remains, store `null`.
  - A malformed or missing itinerary **never** fails generation — the narrative still saves as `draft`. Only the existing narrative checks (`empty_content`, etc.) can fail a post.
- Write `itinerary` alongside the existing fields in the `draft` update.

Model, `max_tokens`, abort timeout, and the vision pass are unchanged. Redeploy `generate-blog` v7 → v8. The successful Deno build is the type-check for the edge function (Deno isn't installed locally).

---

## Client Rendering (`BlogPostScreen.tsx`)

### Parsing helper (`blogHelpers.ts`)
- New pure helper `parseItinerary(value: unknown): Itinerary | null`:
  - Returns `null` for non-arrays, empty arrays, or arrays with no valid day.
  - For each day: require a numeric `day` and an array of stops; coerce `date`/`title` to safe values; drop the day if it has no valid stops.
  - For each stop: require a non-empty `place_name`; coerce `time_of_day` to the allowed union or `null`; coerce `category` to a known `Category` or `null`; coerce `description` to a string; coerce `lat`/`lng` to numbers or `null`.
  - This is the **one new unit-test surface** (TDD), mirroring the existing `validateBlogResult` pattern. The edge function does its own inline validation (no shared import across the Deno boundary), consistent with how `validateBlogResult` already isn't shared with the edge function.
- Add the `Itinerary`, `ItineraryDay`, `ItineraryStop` types and export them.

### View toggle
- New local state `view: 'story' | 'itinerary'`, default `'story'`.
- Compute `itinerary = parseItinerary(post.itinerary)`; `hasItinerary = !!itinerary`.
- A segmented control ("Story" / "Itinerary") renders at the top of the post content **only** when `hasItinerary` and `post.status` is `draft` or `published`. Not shown for `generating` / `error` / `insufficient`.
- `Story` view = the existing cover image + markdown (unchanged). `Itinerary` view = `<ItineraryView itinerary={itinerary} />`.

### `ItineraryView` component
- One card per `ItineraryDay`: header line `Day {day}` · formatted `date` (when present) · `title`.
- Within a card, stops are shown in their array order, labeled by `time_of_day` (Morning / Afternoon / Evening; unlabeled when `null`).
- Each stop row: the existing `CategoryBadge` (when `category` present) + `place_name` (bold) + `description`.
- No map in this slice; `lat`/`lng` are carried in the data but not rendered yet.
- Styled with existing theme tokens (`Colors`, `Spacing`, `BorderRadius`), matching the dark surface card idiom.

---

## Testing

- `parseItinerary` unit tests (valid, empty/null, partially-malformed days/stops, bad category/time_of_day, coercions).
- An `ItineraryView` (or `BlogPostScreen`) render test: given a post with an itinerary, the toggle appears and the itinerary renders day/stop content; given `itinerary: null`, no toggle appears.
- Full Jest suite + `npx tsc --noEmit` green before merge.
- Edge function: smoke-tested via Supabase MCP after deploy (eligible trip produces an itinerary; a 1–2 day trip stores `itinerary: null`).

---

## Deployment

- Apply `014_blog_posts_itinerary.sql` via Supabase MCP (project `dcejrbyujfcxartywpis`).
- Regenerate `src/lib/database.types.ts`.
- Redeploy `generate-blog` (v8).
- On-device QA: a multi-day located trip shows the Story/Itinerary toggle with correct day cards; a sparse trip shows no toggle; regeneration replaces the itinerary.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Generation | LLM in the same call as the narrative | Reuses the existing vision pass + chronological context; Claude writes day titles and orders stops naturally |
| Time granularity | Morning / Afternoon / Evening buckets | Reads like a real itinerary; tolerant of missing/fuzzy timestamps; no false precision |
| Coordinates | Store `lat`/`lng` per stop | Map-ready data with no extra cost; mini-map can ship later without regenerating |
| UI placement | Story / Itinerary segmented toggle | Keeps prose and structured views each clean; toggle only when an itinerary exists |
| Sufficiency | Deterministic gate (≥3 located-and-named days) in the edge function | Predictable, no wasted output tokens, one clear rule |
| Failure mode | Itinerary is supplementary | A malformed itinerary stores `null` and never fails the narrative |
| Map | Deferred | Coords stored now; rendering is its own small follow-up |
```
