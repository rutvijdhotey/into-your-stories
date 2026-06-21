# Move Notes Between Trips — Design

**Date:** 2026-06-21
**Backlog item:** Priority 0b — Move notes between trips (reclassify)
**Status:** Approved, ready for planning

## Problem

A note captured under the wrong trip is permanent today. There is no way to
reassign a note to a different trip — neither in `NoteEditSheet` nor anywhere
else. Misclassification happens (e.g. the trip selector defaulted to the wrong
active trip, or a note was captured before switching trips), and the only
recovery is to delete and re-create the note, losing its photos, location, and
timestamps.

## Goal

Let the user move a single note from its current trip to any other trip they
own, from the note's edit sheet, as an immediate atomic action.

## Decisions (from brainstorming)

- **Target trips:** all of the user's trips (active *and* completed), most
  recent first, excluding the note's current trip.
- **Picker UI:** a dedicated scrollable modal list (not horizontal chips, not
  `ActionSheetIOS`), so it scales to any number of trips and shows enough info
  to disambiguate.
- **Move is immediate and atomic** — changes `trip_id` only. Not staged behind
  the Save button. Any *unsaved* text/category/photo edits in `NoteEditSheet`
  are **not** carried by the move (the move uses the note's last-saved state).
- **Confirmation:** lightweight `Alert` ("Move this note to *{trip}*?") before
  the move executes.
- **After move:** stay on the current trip feed; the note is removed from the
  current feed. No auto-navigation to the destination trip.

## Non-obvious constraints discovered in the codebase

1. **`note_count` desyncs on a move.** The triggers in
   `005_trips_note_count.sql` (`bump_trip_note_count`) only fire on `INSERT` and
   `DELETE`. An `UPDATE` of `trip_id` adjusts neither trip's count. This is the
   migration the backlog refers to.
2. **RLS is too loose for a move.** `notes_update_own` (`004_notes.sql`) only
   checks `auth.uid() = user_id`; unlike the INSERT policy, its `WITH CHECK`
   does **not** verify the *target* `trip_id` belongs to the user. Without
   tightening, a client could move a note onto another user's trip.
3. **`updateNote` resets `tagging_status` to `'pending'`.** Routing a move
   through `updateNote` would needlessly re-trigger AI tagging, so the move must
   be its own thin service call.
4. **Realtime won't remove the note from the source feed.** `useNotes(tripId)`
   subscribes filtered on `trip_id`. An `UPDATE` that moves the row *out* of the
   filter is not reliably delivered to the source channel, and the existing
   `UPDATE` handler (`prev.map(n => n.id === next.id ? next : n)`) would keep a
   stale row anyway. Source-feed removal must be explicit — via the existing
   `useNotes.refresh()`.

## Architecture

### 1. Data layer — migration `012_notes_move_between_trips.sql`

Two changes, both required for correctness.

**`note_count` integrity.** Extend `bump_trip_note_count()` with an `UPDATE`
branch, guarded so it only acts when the trip actually changes:

```sql
elsif (tg_op = 'UPDATE') then
  if (new.trip_id is distinct from old.trip_id) then
    update public.trips set note_count = greatest(0, note_count - 1) where id = old.trip_id;
    update public.trips set note_count = note_count + 1            where id = new.trip_id;
  end if;
  return new;
```

Add an `after update on public.notes for each row` trigger bound to the same
function. The `is distinct from` guard makes it a cheap no-op for every other
note edit (content, location, tagging), so existing update paths are unaffected.
Keep the existing `search_path = ''` hardening and `revoke execute` grants.

**RLS hardening.** Replace `notes_update_own`'s `WITH CHECK` to mirror the
INSERT policy:

```sql
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trips t
    where t.id = trip_id and t.user_id = auth.uid()
  )
)
```

This closes the hole where a note could be moved onto a non-owned trip.

### 2. Service layer — `moveNote` in `noteService.ts`

```ts
export async function moveNote(noteId: string, newTripId: string): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({ trip_id: newTripId })
    .eq('id', noteId);
  if (error) throw error;
}
```

A single-purpose call that touches `trip_id` only. Deliberately **not** routed
through `updateNote` — it must not reset `tagging_status` or touch location.

### 3. UI

**`MoveToTripSheet` (new component).** A `pageSheet` Modal containing a vertical
`FlatList` of the user's trips, fetched via `listTrips(userId)` on show,
**excluding** the note's current `trip_id`. Each row shows the trip name, first
destination, and a `TripStatusBadge`. Tapping a row triggers an `Alert` confirm;
on confirm it calls `moveNote(noteId, targetTripId)`, then `onMoved()`, then
closes. Props: `userId`, `currentTripId`, `noteId`, `visible`, `onClose`,
`onMoved`.

**`NoteEditSheet` changes.** Add a "Move to trip…" button above "Delete Note",
and a new `onMoved: () => void` prop. The button opens `MoveToTripSheet`
(passing `note.user_id`, `note.trip_id`, `note.id`). No new context wiring —
`note.user_id` is already available.

### 4. Feed consistency

`onMoved` is wired in both `NoteEditSheet` hosts — `TripFeedScreen` and
`TripMapScreen` — to **close the sheet and call `useNotes.refresh()`**. The
refetch drops the moved note from the current feed (it now belongs to another
trip). `note_count` on both trips updates server-side via the new trigger; the
Home `TripCard` counts refresh through the existing `useTrips` realtime
subscription on `trips`.

## Testing

- **`moveNote`** (Supabase mocked): success writes only `trip_id`; error path
  throws.
- **`MoveToTripSheet`**: renders the trip list excluding the current trip;
  tapping a row + confirming calls `moveNote` and `onMoved`; cancel does nothing.
- **`NoteEditSheet`**: the "Move to trip…" button opens the move sheet; existing
  edit/delete/location/photo-cap tests stay green.
- **Migration** (Supabase MCP): move a note, assert both trips' `note_count`
  adjust; assert RLS rejects a move to a non-owned trip.
- Full suite + `npx tsc --noEmit` green.

## Scope guardrails (YAGNI)

- No multi-select / bulk move — one note at a time.
- No undo — the move is reversible by moving back.
- No auto-navigation to the destination trip.
- Move does not re-run AI tagging or re-resolve location — `place_name` / `city`
  / coordinates travel with the note unchanged.

## Out of scope

- Moving notes between *users* (not a feature).
- Reassigning photos independently of their note.
