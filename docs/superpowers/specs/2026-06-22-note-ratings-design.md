# Note Ratings — Design

**Date:** 2026-06-22
**Backlog item:** #8 — Restaurant / place ratings (V1 build order, after itinerary-from-blog)
**Branch:** `backlog/note-ratings`

## Purpose

Let the user attach an optional 1–5 star rating to a note, but only for
rateable categories (`food`, `stay`, `activity`, `shopping`). Ratings are
private in V1. They lay the column that the future public layer will roll up
into `public_places.avg_rating` + `rating_count` — so the data must be clean
from day one (a rating only ever exists on a rateable category).

Non-goals (deferred): the `public_places` aggregate, `avg_rating` /
`rating_count`, any public surface, and the venue-name resolution fix (backlog
3.5). This change only adds the private `rating` column and its UI.

## Data model

Migration `016_notes_rating.sql`:

```sql
alter table public.notes
  add column rating smallint
    check (rating is null or rating between 1 and 5);

-- Safety net mirroring the app rule: a rating may only exist on a rateable
-- category. Enforces "clear rating on category switch" at the DB level so bad
-- data cannot slip in through any path, including the future public aggregate.
alter table public.notes
  add constraint notes_rating_requires_rateable_category
    check (rating is null or category in ('food','stay','activity','shopping'));
```

`rating` is nullable; null means "unrated". Whole numbers 1–5 only (no half
stars).

## Types & helpers (`src/services/noteHelpers.ts`)

- Regenerate Supabase types so `rating` lands on `NoteRow` / `NoteInsertRow`,
  flowing into the existing `Note` / `NoteInsert` derived types.
- Add a single source of truth for rateability:
  - `RATEABLE_CATEGORIES: Category[] = ['food','stay','activity','shopping']`
  - `isRateable(category: Category | null): boolean`
- All three UI sites import `isRateable` — no duplicated category lists.

## Components

### `StarRating` (new, `src/components/StarRating.tsx`)

One component used in all three places.

Props:
- `value: number | null`
- `onChange?: (value: number | null) => void`
- `readOnly?: boolean`
- `size?: 'small' | 'medium'` (small for the feed card, medium for the sheets)

Behavior:
- Interactive (when `onChange` set and not `readOnly`): tapping star N sets the
  value to N. Tapping the star that equals the current value clears it back to
  `null` — an undo without a separate "clear" button.
- Read-only: renders filled/empty stars with no touch handlers.

### `NoteCaptureSheet` + `NoteEditSheet`

Same pattern in both:
- Local `rating` state. Edit sheet seeds from `note.rating` (and resets it in
  the existing `handleShow` reset path); capture sheet starts `null` and clears
  it in the existing reset path.
- Render `<StarRating size="medium">` directly under the `CategoryPicker`, but
  **only when `isRateable(category)`**.
- When the category changes to a non-rateable one, clear `rating` in the same
  `onChange` handler (so state matches the DB constraint before save).
- Include `rating` in the insert (capture) / update (edit) payload.

### `NoteCard` (`ServerNoteCard`)

- When `note.rating` is set, render a read-only `<StarRating size="small">` in
  the existing `headerRow`, next to the `CategoryBadge`.

## Error handling / edge cases

- Category switched rateable → non-rateable with a rating set: app clears
  `rating` in state; DB constraint is the backstop.
- Save with `rating` null is always valid (unrated note).
- No new failure modes in the save path — `rating` rides along the existing
  `createNote` / `updateNote` calls.

## Testing

- `noteHelpers`: `isRateable` truth table across all six categories.
- `StarRating`: renders N filled stars for value N; `onChange` fires the tapped
  value; re-tapping the current value clears to null; `readOnly` ignores taps.
- `NoteEditSheet`: switching to a non-rateable category clears the rating; the
  save payload includes `rating`.
- Migration `016` applied to Supabase; types regenerated.

## Forward-compatibility

The `rating` column is the sole source for the eventual
`public_places.avg_rating` + `rating_count`. The category constraint guarantees
every rating belongs to a rateable category, so the future aggregate can read
it without re-validating.
