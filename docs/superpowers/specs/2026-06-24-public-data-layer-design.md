# Public Data Layer — Design Spec

**Date:** 2026-06-24
**Backlog item:** Public layer (#3 Explore + #4 privacy) — **Spec A of two.**
Spec B (the Explore UI: destination grid + community map + ranked list) is a
separate spec, built after this one, since it has nothing to read until this
layer exists.

## Goal

When a trip completes, fold its visited places into an anonymized, public-read
aggregate. The public surface carries **no identity, no visit timestamps, no
note prose** — only place name, city, coordinates, popularity counts, and
ratings. This is the data foundation the Explore UI reads.

## Scope

In scope: the `public_places` aggregate table, the private
`public_place_contributions` bookkeeping table, a global opt-out, and the
trip-completion trigger that performs the aggregation. No UI.

Out of scope (deferred): the Explore UI (Spec B); reversal of contributions on
note delete/edit/opt-out (V2); any community "wishlist / most-wanted" surface
for `to-visit` places (separate V2 feature); moderation (V2).

## Decided model (corrections to prior backlog note)

The backlog's "Public/community model (decided 2026-06-21)" listed `to-visit`
as a public category. That was an oversight: the `tag-note` prompt defines
`to-visit` as *"a place the user wants to go later, not somewhere they are"*
([supabase/functions/tag-note/index.ts:16](../../../supabase/functions/tag-note/index.ts)),
i.e. aspirational, un-visited, and un-rateable. Counting it as a community
"visit" would conflate bookmarks with experience and dilute ratings.

**Public categories = food, stay, activity, shopping only.** `general` and
`to-visit` both stay private.

## Schema

### `public_places` (public-read)

One row per deduped place.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid pk` | `default gen_random_uuid()` |
| `place_key` | `text unique not null` | `normalized(place_name) \|\| '\|' \|\| normalized(coalesce(city,''))` — the dedupe identity |
| `place_name` | `text not null` | display copy of the canonical name |
| `city` | `text` | nullable |
| `lat` | `double precision` | running average; nullable |
| `lng` | `double precision` | running average; nullable |
| `coord_count` | `int not null default 0` | # contributions with coords — denominator for the running avg |
| `visit_count` | `int not null default 0` | popularity |
| `rating_sum` | `int not null default 0` | |
| `rating_count` | `int not null default 0` | only counts notes that carried a rating |
| `category_counts` | `jsonb not null default '{}'` | per-category tally, e.g. `{"food":3,"activity":1}` |
| `dominant_category` | `text` | most-common category among contributions |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | via `set_updated_at` trigger |

- **`avg_rating` is derived, not stored**: `rating_sum::float / nullif(rating_count, 0)`.
  Consumers compute it (or a view exposes it). Never store a pre-divided average.
- **Normalize** = lowercase + trim + collapse internal whitespace to single spaces.

### `public_place_contributions` (private — internal bookkeeping)

The idempotency ledger. Links a contributing note to the public place it fed.
Never publicly readable (it ties user-owned notes to places).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid pk` | |
| `public_place_id` | `uuid not null → public_places(id)` | |
| `note_id` | `uuid not null unique → notes(id)` | **the idempotency guard** — a note contributes at most once |
| `trip_id` | `uuid not null → trips(id)` | |
| `rating` | `smallint` | snapshot of the note's rating at contribution time |
| `category` | `text` | snapshot of the note's category |
| `created_at` | `timestamptz not null default now()` | |

`note_id unique` is what makes re-completing a trip safe: already-contributed
notes are skipped.

### `profiles` — add opt-out

```
alter table public.profiles
  add column contribute_to_community boolean not null default true;
```

Global opt-out, default ON ("Contribute my places to the community map").

## Aggregation — the trigger

A `SECURITY DEFINER` function, `AFTER UPDATE ON public.trips`, fired only when
`old.status = 'active' AND new.status = 'completed'`. Search_path hardened, same
pattern as the existing `set_updated_at` function (migration 003).

Steps:

1. If the trip owner's `profiles.contribute_to_community = false`, return — no
   contributions.
2. Select eligible notes for `new.id`:
   - `category IN ('food','stay','activity','shopping')`
   - `place_name` is non-null and non-empty after trim
   - `note_id NOT IN (select note_id from public_place_contributions)` (idempotency)
3. For each eligible note, by `place_key`:
   - **Upsert** `public_places`: insert the row if new, else update.
   - `visit_count += 1`.
   - If the note has a rating: `rating_sum += rating`, `rating_count += 1`.
   - If the note has coords: fold into the running average —
     `lat := (lat*coord_count + note.lat) / (coord_count+1)` (same for `lng`),
     then `coord_count += 1`.
   - Bump `category_counts[note.category]` and recompute `dominant_category`
     (the key with the max tally; ties broken deterministically, e.g. by
     category name order).
   - Insert a `public_place_contributions` row.

**Add-only.** Reopening a completed trip, adding notes, and re-completing folds
in only the *new* notes. There is no reversal on note delete, note edit, or
opt-out in V1 — once counted, a contribution stays. The public surface is an
anonymized counter, so a slightly stale count is low-harm; reversal is V2.

Opt-out stops *future* contributions; it does not retroactively remove ones
already made (consistent with the add-only rule).

## Security & anonymity

- `public_places`: RLS enabled. One `SELECT` policy, `using (true)`, for `anon`
  and `authenticated`. **No** insert/update/delete policies — only the
  `SECURITY DEFINER` trigger function writes (it runs as table owner, bypassing
  RLS). Clients can read but never write.
- `public_place_contributions`: RLS enabled, **no policies at all** — fully
  locked to clients. The definer function bypasses RLS to maintain it. This keeps
  the note↔place↔user linkage private.
- `public_places` stores **no `user_id`, no visit timestamps, no note prose** —
  only place, coords, counts, ratings, category tally. Anonymity is structural,
  not policy-dependent.

## Testing

**Pure helpers (extract + unit test):**
- `place_key` normalization (case, whitespace, null city → empty bucket).
- Running-average fold for coordinates.
- Dominant-category selection (including tie-break).

**SQL / integration (against a Supabase branch):**
- Complete a trip with eligible notes → matching `public_places` rows + one
  contribution per note.
- Re-complete the same trip → no double-count; new notes added on reopen *are*
  counted.
- Opted-out user completes a trip → nothing written.
- `general` and `to-visit` notes excluded.
- Notes without a rating bump `visit_count` but not `rating_count`.
- Two users' notes for the same place (same `place_key`) merge into one row with
  `visit_count = 2`; different cities stay separate.
- Notes without coords contribute counts but leave the running average untouched.

## Follow-ups

- Update `backlog_priority.md`'s "Public/community model" note to reflect
  `to-visit` exclusion and the `general`-and-`to-visit` private rule.
- Spec B (Explore UI) reads `public_places`: destination grid by popularity →
  destination page = community map (filter by `dominant_category`) + ranked
  places list (by `visit_count`, then `avg_rating`).
