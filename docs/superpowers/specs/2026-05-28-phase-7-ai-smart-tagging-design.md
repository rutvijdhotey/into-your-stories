# Phase 7: AI Smart Tagging — Design Spec

**Date:** 2026-05-28
**Branch:** `phase-7/ai-smart-tagging`
**Status:** Approved — ready for implementation plan
**Supersedes:** `docs/superpowers/plans/plan-06-ai-smart-tagging.md` (stale: assumed a vision
pipeline, a `places` table, and `tagging_status='done'` — none of which match the built code)

---

## Overview

Every saved note already lands in the database with `tagging_status = 'pending'`, but nothing
ever moves it past that — so notes without a manual category show a shimmer forever, and
`place_name` is never populated. This phase builds the tagger that closes that loop: it drains
pending notes, asks Claude for a `category`, `place_name`, and `city`, merges the result without
overwriting anything the user or GPS already provided, and flips `tagging_status` to `complete`.

The UI is already wired for this. `NoteCard` shows a shimmer while `tagging_status === 'pending'
&& !category`, and `useNotes` subscribes to Realtime `UPDATE` events — so a tagged row updates
the card automatically with no new subscription. `updateNote` already resets `tagging_status` to
`'pending'` on edit, so re-tagging-on-edit comes for free.

---

## Scope

**In:**
- New `tag-note` Supabase Edge Function: stateless Claude classifier (Haiku, JSON-only,
  server-side API key) — same shape as the existing `detect-intent` function.
- `taggingHelpers.ts` (pure, TDD): category validation, merge logic, Claude JSON parsing.
- `taggingService.ts`: `tagNote(note)` + `drainTagging()` — calls the function, merges, writes back.
- Client-orchestrated drain wired into the existing lifecycle triggers in `MainStack`.
- `NoteCard` renders `place_name` under the note content when set.
- Merge rules that never override a user-picked category or a GPS-resolved city.

**Out (later phases):**
- `places` table + place-record creation + map pins (map phase).
- Claude Vision / photo-description input to improve tagging (deferred since Phase 5).
- Manual `place_name` entry in the capture/edit sheets.
- Retry-count tracking and a `failed`-state UX (the `failed` enum value stays reserved).

---

## Architecture (Client-Orchestrated)

```
note saved ──► offline queue ──► DB insert (tagging_status = 'pending')
                                        │
                          drainTagging() picks up pending notes
                                        │
                          tag-note edge function (Claude classify)
                                        │
                          mergeTags(existing, suggestion)  ◄── never override user/GPS
                                        │
                          UPDATE note: category, place_name, city, tagging_status='complete'
                                        │
                          Supabase Realtime UPDATE ──► NoteCard swaps shimmer for badge
```

The edge function is **stateless** — it returns suggestions only. The client (holding the note
and the user's JWT) does the merge and the RLS-scoped write. This mirrors `detect-intent`, which
returns JSON that the client acts on, and keeps the write under the user's own auth.

Tagging operates on notes **already synced to the database**, distinct from the AsyncStorage
offline queue (which handles pre-sync inserts). The two coordinate by ordering: queue drain
first (inserts the rows), tag drain second (tags the freshly-inserted rows).

---

## `tag-note` Edge Function

`supabase/functions/tag-note/index.ts` — modeled on `detect-intent`.

**Request body:**
```json
{ "content": "string", "lat": 35.6, "lng": 139.7, "city": "Tokyo" }
```
`lat`/`lng`/`city` are nullable. `city` is passed as known context so Claude only *infers* a city
when it is null (and the client keeps the existing one regardless — see merge rules).

**Response body (HTTP 200):**
```json
{ "category": "food", "place_name": "Ichiran Ramen", "city": "Tokyo" }
```
- `category` — exactly one of `food`, `stay`, `activity`, `shopping`, `to-visit`, `general`
  (lowercase, matching the `notes.category` check constraint).
- `place_name` — specific named location if mentioned, else `null`.
- `city` — inferred only when not provided, else echoes/returns `null`.

**System prompt:** a tightly-scoped classifier (no free-form generation). Strips markdown code
fences if Claude wraps the JSON. Model `claude-haiku-4-5-20251001`, low `max_tokens`.

**Failure handling:** on Claude API non-OK or unparseable output, the function returns a **non-200**
response. The client treats that as a transient failure and leaves the note `pending` for the next
drain — it does **not** silently write a fallback category, so a real outage never mislabels notes.

---

## Merge Rules (`taggingHelpers.mergeTags`)

Given the note's current values and Claude's suggestion:

| Field | Rule |
|---|---|
| `category` | Keep existing user pick **if set**; otherwise use Claude's, validated against the enum (invalid/unknown → `general`). |
| `city` | Keep existing GPS-resolved city **if set**; otherwise use Claude's (may be `null`). |
| `place_name` | Always take Claude's value (no manual source to protect; a re-tag after edit replaces it). |
| `tagging_status` | `complete` on a successful merge+write. Left `pending` on transient failure (retried next drain). |

---

## Drain Triggers

`drainTagging()` is idempotent and safe to call often. It queries the current user's notes where
`tagging_status = 'pending'` and tags each.

Wired into the **same three triggers** that already drive `drainQueue()` in `MainStack.tsx`
(on mount, on reconnect via `useOnReconnect`, on app state `active`), sequenced **after** the
queue drain so newly-synced notes are visible to the tag query:

```
await drainQueue();
await drainTagging();
```

**Plus** a prompt path for online saves: `noteService.trySync` returns a boolean indicating a
successful insert, and `createNote` kicks a `drainTagging()` pass when it does — so an
online-saved note is tagged promptly rather than waiting for the next foreground. Offline notes
flow through the reconnect queue-drain → tag-drain sequence.

---

## File Changes

| File | Change |
|---|---|
| `supabase/functions/tag-note/index.ts` | **New.** Claude classifier edge function. |
| `src/services/taggingHelpers.ts` | **New (pure, TDD).** `validateCategory`, `mergeTags`, `parseClaudeJson`. |
| `src/services/taggingService.ts` | **New.** `tagNote(note)`, `drainTagging()` — invoke function, merge, update row. |
| `src/services/noteService.ts` | `trySync` returns `boolean`; `createNote` triggers a tag pass on successful online sync. |
| `src/navigation/MainStack.tsx` | Add `drainTagging()` after `drainQueue()` at the three existing trigger points. |
| `src/components/NoteCard.tsx` | Render `note.place_name` beneath content when set. |

No migration required — `category`, `place_name`, `city`, and `tagging_status` already exist on
the `notes` table (migration 004).

---

## `taggingHelpers.ts` (pure, TDD)

```
validateCategory(value: unknown): Category
  – returns value if it's one of the 6 enum strings (case-insensitive); else 'general'

parseClaudeJson(raw: string): { category, place_name, city } | null
  – strips markdown fences, JSON.parse; returns null on malformed output

mergeTags(existing, suggestion): { category, place_name, city }
  – applies the merge rules above (keep existing category/city; take suggested place_name)
```

---

## `taggingService.ts`

```
tagNote(note: Note): Promise<void>
  – calls the tag-note function with { content, lat, lng, city }
  – on non-200 / network error: returns without writing (note stays 'pending')
  – on success: mergeTags(note, suggestion) → update notes row with merged fields
    + tagging_status = 'complete'

drainTagging(): Promise<number>
  – selects current user's notes where tagging_status = 'pending'
  – tags each via tagNote; returns count successfully tagged
```

---

## Testing Strategy

**Unit (TDD):**
- `taggingHelpers`
  - `validateCategory`: each valid value, mixed casing, junk → `general`.
  - `parseClaudeJson`: plain JSON, fenced JSON, malformed → `null`.
  - `mergeTags`: keeps existing category, keeps existing city, fills both when blank, always
    takes suggested `place_name`.
- `taggingService`
  - `tagNote` happy path: calls function, merges, updates row with `complete`.
  - respects an existing user category and an existing GPS city.
  - leaves the note `pending` (no write) when the function errors.
  - `drainTagging` iterates all pending notes and returns the tagged count.

**Manual verification:**
- Save a note with text only → shimmer appears → resolves to a real category badge within a
  moment (online).
- Save a note mentioning a named place (e.g. "great ramen at Ichiran") → `place_name` renders
  under the content.
- Pre-pick a category before saving → after tagging, the picked category is unchanged.
- Save with GPS city present → city is not overwritten.
- Save offline, then reconnect → note syncs, then tags.
- Edit a note's content → it re-enters `pending` and re-tags.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Trigger model | Client-orchestrated edge-function calls | Consistent with `detect-intent` and the existing queue-drain lifecycle; simplest to test. |
| Merge precedence | AI fills blanks only; never overrides user/GPS | Human and device data are ground truth; avoids surprising re-labels. |
| `places` table | Deferred to the map phase | Nothing consumes it yet; building it now is speculative (YAGNI). |
| Vision input | Out of scope | No photo-description pipeline exists (Phase 5 deferred it). |
| Failure handling | Non-200 → leave `pending`, retry next drain | Never silently mislabels a note during an outage. |
| Merge logic location | Client, not edge function | Edge function stays stateless; write happens under the user's RLS auth. |
| Model | `claude-haiku-4-5-20251001` | Matches `detect-intent`; cheap and fast, sufficient for classification. |
