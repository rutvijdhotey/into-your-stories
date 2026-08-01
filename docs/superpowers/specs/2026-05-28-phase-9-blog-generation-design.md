# Phase 9 — Blog Generation (Design)

**App:** Notebound
**Status:** Code complete (on-device QA pending) — implemented per `docs/superpowers/plans/2026-05-29-phase-9-blog-generation.md`
**Date:** 2026-05-28 (implemented 2026-05-29)
**Branch:** `phase-9/blog-generation`

> Supersedes the stale `plan-09-blog-generation.md`, which assumed foundations that were never built (`blog_posts`/`style_profiles` tables, a `photo_descriptions` vision pipeline, a `places` table, semantic-search `embeddings` from Module 8, `community_destinations` from Module 10, a web layer for real URLs from Module 11, and `expo-notifications`). This spec re-scopes Phase 9 to what is buildable on today's foundation — the same way Phases 7 and 8 re-scoped their stale predecessors.

---

## Goal

Turn a **completed** trip into a polished, read-only blog draft the user can review, publish (locally), and export. The Blog tab becomes functional for the first time.

**This slice = Generate → Review → Export.** "Publish" is a local status marker only; there is no public web URL yet (that waits for the web-layer phase).

---

## Current State (what we build on)

- **Tables:** `profiles`, `trips`, `notes`; `photos` storage bucket. No `blog_posts` yet.
- **Notes carry:** `content`, `category`, `place_name`, `city`, `lat`, `lng`, `created_at`, `photo_urls` (an array of **public** URLs — `photoService.uploadPhoto` stores `getPublicUrl(...)`, and they already render in-app since Phase 5). Because photos are already public URLs, the draft and the export can use them directly — **no signed-URL handling and no bucket-copy step**.
- **Trip status:** `trips.status` is a real column constrained to `'active' | 'completed'` (see `tripHelpers.ts`). "Completed" = `status === 'completed'`.
- **Edge functions:** `detect-intent`, `tag-note` — both Deno, client-orchestrated, on Supabase project `dcejrbyujfcxartywpis`, `ANTHROPIC_API_KEY` secret set.
- **Blog tab:** `BlogScreen.tsx` is a static placeholder (Drafts / Published empty cards + a stub Generate button).

---

## Architecture — three thin layers

Mirrors the Phase 7/8 convention: pure helpers hold all logic that doesn't need Supabase or native modules (so it's unit-tested in isolation), a thin service wraps Supabase, and a stateless edge function does the privileged AI work.

### 1. Pure helpers — `src/services/blogHelpers.ts` (TDD)

No Supabase / native imports (uses `import type` for row types, per the Phase 8 gotcha so Jest never loads native deps).

- `collectPlaces(notes)` → deduped `{ place_name, category, city }[]`, used both to feed the prompt context and (if needed) to validate the Places section.
- `validateBlogResult(data)` → type-guards the edge function's JSON response shape: `{ title: string, content_markdown: string, cover_photo_url: string | null, selected_photo_urls: string[] }`.
- `markdownToHtml(markdown)` → minimal Markdown→HTML conversion for the HTML export.
- small presentational formatters for cards (status label, generated/published date).

### 2. Service — `src/services/blogService.ts` (unit-tested, Supabase mocked — like `taggingService`)

- `generateBlog(tripId, userId)` → invokes the `generate-blog` edge function; returns the new post id.
- `listBlogPosts(userId)` → all of the user's posts (drafts + published), newest first.
- `getBlogPost(id)`.
- `publishPost(id)` → `status = 'published'`, set `published_at`.
- `discardDraft(id)` → delete the row.
- `unpublish(id)` → `status = 'draft'`, clear `published_at`.

### 3. Edge function — `supabase/functions/generate-blog/index.ts` (Deno, **service role**)

Mirrors `tag-note`/`detect-intent`. Uses the service-role key (full DB access, not RLS-constrained) because it reads every note on the trip server-side.

**Inputs:** `{ trip_id, user_id }`.

**Flow:**
1. Insert a `blog_posts` row with `status = 'generating'` and return its `id` to the client **immediately**; continue the heavy work via `EdgeRuntime.waitUntil(...)` so the client isn't blocked for the ~60s generation.
2. Load the trip and all its notes (`content`, `category`, `place_name`, `city`, `lat`, `lng`, `created_at`, `photo_urls`).
3. Call Claude **`claude-sonnet-4-6`** (creative long-form, per the design spec's AI-layer choice) with the trip context and a default "clear, engaging travel writing" voice (style onboarding is out of scope). Ask for JSON:
   - `title`
   - `content_markdown` — intro, narrative organized by city/day, **inline photos** using Markdown image syntax with the notes' public photo URLs, a `## Places` section grouping `place_name`s by category, and a closing paragraph.
   - `cover_photo_url` — one hero photo chosen from the trip's photos (or `null` if the trip has no photos).
   - `selected_photo_urls` — the subset of photos featured.
4. Fence-strip + `JSON.parse` the response (Claude wraps JSON in markdown despite instructions — same fix as `detect-intent`/`tag-note`).
5. On success → update the row to `status = 'draft'` with all fields. On any failure → `status = 'error'` + `error_message`. **No silent failure** — an errored post is retriable from the UI by regenerating.

---

## Data Model — migration `008_blog_posts.sql`

```sql
create table public.blog_posts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  trip_id             uuid not null references public.trips(id) on delete cascade,
  status              text not null default 'generating'
                        check (status in ('generating','draft','published','error')),
  title               text,
  content_markdown    text,
  cover_photo_url     text,
  selected_photo_urls text[] not null default '{}',
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  published_at        timestamptz
);
```

- **RLS:** owner-scoped `select` / `insert` / `update` / `delete` (`auth.uid() = user_id`). The edge function writes via service role (bypasses RLS); the client reads/mutates under its own auth.
- **Realtime:** enabled on `blog_posts` so a `generating` card flips to `draft` live (this replaces push notifications, which are out of scope).
- **`updated_at` trigger:** reuse the hardened pattern (`set search_path = ''` + `revoke execute`) established in Phases 2–3.
- **One active post per trip:** a partial unique index on `trip_id` where `status <> 'published'`, so a trip has at most one in-flight/draft post. Regenerating first discards the prior non-published row.

---

## Screens, Components, Hooks

- **`useBlogPosts(userId)`** — Realtime hook over `blog_posts` (per-instance random channel suffix, per the Phase 3 channel-collision gotcha). Drives the Blog tab; surfaces `generating → draft` transitions live.
- **`BlogScreen`** (rewrite the placeholder) — real **Drafts** and **Published** sections from `useBlogPosts`, rendered as `BlogPostCard`s; empty state when neither exists. The existing "Generate Blog" button opens a **completed-trip picker**; choosing a trip calls `generateBlog` and shows the new `generating` card.
- **`TripDetailScreen`** — a "Generate Blog" button, **enabled only when `trip.status === 'completed'`** (the "my trip is over, write it up" moment). Disabled/hidden for active trips.
- **`BlogPostScreen`** (`src/screens/blog/BlogPostScreen.tsx`) — **one** status-driven, **read-only** screen:
  - Render: full-bleed hero cover, title, Markdown narrative with inline photos, Places summary.
  - Actions when `draft`: **Publish** (primary, amber) · **Discard** (destructive, confirm alert) · **Export**.
  - Actions when `published`: **Unpublish** · **Export**.
  - `generating` opened directly shows a generating state; `error` shows the message + a Regenerate affordance.
  - Added as a `BlogPost` route (`{ postId }`) on `MainStack`.
- **`BlogPostCard`** — cover thumbnail, trip/title, date, status label ("Ready to review" / "Published" / "Generating…" / "Failed").
- **Markdown rendering:** new dep `react-native-markdown-display`; images render directly from stored public URLs.
- **Export:** Markdown = raw `content_markdown` shared via RN `Share`; HTML = `markdownToHtml(content_markdown)` written to the cache dir (`expo-file-system`) and opened in the iOS share sheet (`expo-sharing`).

**New deps:** `react-native-markdown-display`, `expo-sharing` (and `expo-file-system` if not already present).

---

## Testing

- TDD pure helpers (`blogHelpers`): `collectPlaces`, `validateBlogResult`, `markdownToHtml`, formatters.
- `blogService` tests with Supabase mocked (lazy-closure mock pattern from the Phase 7 gotcha): generate-invoke, list, publish, discard, unpublish.
- Edge function not unit-tested (consistent with `detect-intent` / `tag-note`); smoke-tested via MCP after deploy.
- Full Jest suite + `npx tsc --noEmit` green before merge.

---

## Explicitly Out of Scope (each becomes its own later phase)

- Public web URL / `web_slug` (web-layer phase)
- Community aggregated map & semantic-search embeddings on publish
- Style onboarding / `style_profiles` (drafts use a default travel-writing voice; the user's own published posts can seed a profile later)
- Photo-override screen (the draft is fully read-only in this slice)
- Push notifications (Realtime surfaces completion instead)

---

## Post-MVP Feature — Itinerary Creation

A named, planned enhancement to ship **after** this slice (not built now). Once a trip has enough timestamped + geolocated notes (≥ 3 days with timestamped, located notes), the generator produces a day-by-day **itinerary** as a separate structured block alongside the narrative, and `BlogPostScreen` renders a conditional **Itinerary** tab/section (hidden when the data is too sparse to be meaningful). This becomes its own spec → plan → implementation cycle, reusing the `blog_posts` row (an added `itinerary jsonb` column) and the existing generation pipeline.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Phase 9 scope | Generate → Review → Export only | Smallest fully-buildable slice on today's foundation; publish/community/web wait for their phases |
| Generation | Background edge function (`EdgeRuntime.waitUntil`) + Realtime | 60s+ work shouldn't block the UI; Realtime flips the card with no push infra |
| Model | `claude-sonnet-4-6` | Creative long-form draft (vs. Haiku for the classifier jobs) |
| Trigger | TripDetail button, **completed trips only** | Matches the "when a trip ends" product framing; Blog-tab Generate routes to the same flow via a trip picker |
| Photos | Cover + inline, from existing public URLs | Photos are already public URLs that render in-app — no signed URLs, no bucket copy |
| Draft | Read-only (no photo-override) | Keeps V1 tight; photo override and conversational editing are later phases |
| Publish | Local status marker only | No web layer yet; data is reviewable/exportable, public URL deferred |
| One post per trip | Partial unique index (non-published) | Prevents duplicate drafts; regenerate replaces the prior non-published row |
| Itinerary | Post-MVP feature (documented) | Real complexity (data-sufficiency logic + structured block); ships as its own follow-up phase |
