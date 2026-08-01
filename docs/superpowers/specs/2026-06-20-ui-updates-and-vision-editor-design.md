# Notebound — UI Updates & Vision Photo Editor Design Spec
**Date:** 2026-06-20
**Status:** Draft — awaiting user review
**Branch:** (to be created from `main`)

---

## 1. Purpose

A batch of four improvements:

1. Fix the **Completed** trip badge, which disappears over light photo backgrounds.
2. Lower the per-note photo limit from **5 to 3**.
3. Give blog generation a **vision-based photo editor** — Claude actually *sees* the photos and decides which best represent each moment, instead of picking blindly from URLs.
4. Add an **editor brain** that gates generation when there aren't enough notes (or the notes are too thin) and keeps blog length flexible rather than rigid.

Items 3 and 4 are both changes to the existing `generate-blog` Supabase edge function. Items 1 and 2 are app-side.

---

## 2. Scope

In scope: items 1–4 above.

Out of scope (explicitly deferred at user's request): blog readiness indicator UI, polished "not enough info" empty state, manual cover-photo override, and a broader audit of other white-on-photo badges/labels.

---

## 3. Item 1 — Completed badge contrast

**File:** `src/components/TripStatusBadge.tsx`

The `completed` status currently renders a translucent white pill with white text:

```ts
status === 'completed' ? 'rgba(255,255,255,0.2)' : ...
```

Over a light photo this is white-on-near-white and effectively invisible. Active and Overdue use solid colored pills and are unaffected.

**Fix:** give Completed a solid, opaque background with guaranteed contrast against white text. Use a dark slate, `rgba(28,28,30,0.92)`, matching the opacity weight of the Active/Overdue pills. No layout, size, or text-color change — only the `completed` branch of `bgColor`.

---

## 4. Item 2 — Photo limit 5 → 3

**Files:**
- `src/hooks/usePhotoPicker.ts` — change `export const MAX_PHOTOS_PER_NOTE = 5;` to `3`.
- `src/components/__tests__/NoteEditSheet.test.tsx` — update the mock `MAX_PHOTOS_PER_NOTE: 5` to `3`.

`MAX_PHOTOS_PER_NOTE` is the single source of truth. The capture sheet, edit sheet, remaining-slot math, and "Photo limit reached" alert all derive from it, so no other UI changes are required. The limit also acts as a hard ceiling on vision cost (item 3) — fewer candidate photos per note means fewer images sent to Claude.

Verify after the change: the capture sheet and edit sheet both block at 3 and show the correct count in their alerts.

---

## 5. Item 3 — Vision-based photo editor

**File:** `supabase/functions/generate-blog/index.ts`

The current call sends photo URLs as **text** and asks Claude to pick "the strongest, most representative photos" — a blind choice, since Claude never sees the images. We upgrade the existing single call to multimodal so the selection is informed.

### 5.1 Model

Change the model from `claude-sonnet-4-6` to `claude-opus-4-8` (vision-capable, stronger judgment). Keep `max_tokens: 16000` (well within the non-streaming limit; the blog body is ~2K output tokens). Keep the existing 140s `AbortController` timeout — generous, and the call runs in `EdgeRuntime.waitUntil` so user-facing latency is unaffected.

### 5.2 Multimodal input

Instead of listing photo URLs as text lines, attach each note's actual images as image content blocks, grouped under that note's text, so Claude associates photos with the moment they belong to. The model then judges, per note, which photo is strongest, features only a handful of the best overall across the trip, and chooses the cover from those.

The output JSON shape is unchanged: `{ title, content_markdown, cover_photo_url, selected_photo_urls }`. Selection is now a *seen* decision rather than a guessed one.

### 5.3 Downsample for vision only — full quality preserved in the blog

**This is a correctness requirement, not just an optimization.**

Before sending an image to Claude, downsample it to ~1536px on the long edge. This is purely the "eyes" for the selection decision and is discarded after the call.

The blog itself is **never** affected: Claude only ever emits URLs (strings) — it does not generate, re-encode, or re-host images. `cover_photo_url` and `selected_photo_urls` point at the **original full-resolution files in Supabase storage**, and the blog renders straight from those originals. Pipeline:

```
original full-res photo
  → temporary ~1536px copy (sent to Claude as judgment input)
  → Claude returns the original URL it chose
  → blog embeds the original full-res URL
```

Downsampling cuts per-image tokens roughly 3× versus full high-res (~1,300 vs ~4,784 tokens/image) with no meaningful loss in "which shot is best" judgment.

### 5.4 Photo URL access — verify during implementation

Claude fetches image URLs server-side. If the Supabase photo URLs are publicly reachable, send them as `image` blocks with a URL source (and rely on a CDN/transform param for the downsize if available). If the storage bucket is private/signed and Claude cannot fetch them, the edge function must **download the bytes, downsize, and send base64** instead. Determine which path applies before building; the design supports either.

### 5.5 Cost envelope (informational)

At ~1536px downsizing and Opus 4.8 pricing ($5/1M in, $25/1M out): ~$0.12 (light trip) to ~$0.65 (heavy trip, 90 photos) per generation, dominated by image tokens. Runs once per "generate," in the background. A cheap aesthetic pre-filter is a possible future lever but is out of scope at a 3-photo cap.

---

## 6. Item 4 — Editor brain (readiness gate + flexible length)

**Files:** `supabase/functions/generate-blog/index.ts` (server gate + length guidance); the app screen that invokes `generateBlog` (local gate); `src/services/blogService.ts` / blog status handling (surface the new status).

### 6.1 Local gate — app-side, free, instant

Before invoking `generate-blog`, block generation when the trip is too thin:

- Fewer than **3 notes**, OR
- Combined trimmed note text below a small floor (≈80 characters — lenient; the LLM is the real judge).

When blocked, show a plain message: *"Add a few more notes before generating a blog."* This avoids spending an API call (and the user's time) on a trip that obviously can't produce a post.

### 6.2 Server-side LLM fallback — the real judge

If a trip clears the local floor but the notes are still genuinely too sparse/garbled to write a real post from, the model returns a structured signal instead of a fabricated blog:

```json
{ "insufficient": true, "reason": "<short, user-friendly reason>" }
```

The edge function detects this and writes a blog_posts row with a new `status: 'insufficient'` carrying the `reason` (reuse the existing `error_message` column for the text, or add a field if cleaner). The current statuses are `generating` / `draft` / `error` / `published`; `insufficient` is distinct from `error` (nothing failed — there just isn't enough to work with).

The system prompt gains an instruction: if the notes do not contain enough substance to write a genuine, non-fabricated post, respond with the `insufficient` object rather than inventing content. This reinforces the existing "never invent places, food, or events" rule.

### 6.3 UI for the insufficient status

Minimal surface (the *polished* empty state was deferred): where the blog draft/error is shown, render the `insufficient` status as a plain, non-alarming message using its `reason` (e.g. *"Not enough to work with yet — try adding a bit more detail to your notes."*) rather than the red error treatment. No new components beyond branching on the status.

### 6.4 Blog length — flexible, not rigid

Replace any implicit length behavior with **soft prompt guidance**, not a hard cap:

- Roughly one section per city (and per day where timestamps make that natural — already in the prompt).
- Target ~600–1200 words for a typical trip, breathing up to ~2000 for rich, photo- and note-heavy trips.
- Never truncate; `max_tokens` stays at 16000 as a ceiling only.

---

## 7. Risks & verification

- **Private storage URLs** (§5.4) — the single biggest implementation unknown. Resolve first; it determines whether we pass URLs or base64.
- **Opus + images latency** — bounded by the 140s timeout and the background `waitUntil`; verify a heavy trip (many photos) completes inside the window. If not, the per-note-best bounding can be tightened or images downsized further.
- **`insufficient` status plumbing** — confirm the realtime subscription that surfaces `generating → draft` also surfaces `generating → insufficient`, so the client updates live.
- **Photo cap regression** — confirm both sheets enforce 3 and the alert text reads "3".

---

## 8. Open items for the user

None outstanding — all decisions (bounded vision, Opus 4.8, downsample-for-vision-only, 3-note floor + LLM fallback, soft length, bundled delivery) are confirmed. Deployment of the edge function is done by the user; app-side changes are implemented and verified locally.
